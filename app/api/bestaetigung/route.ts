import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { loeseCodeEin } from "@/db/bestaetigung";
import {
  CODE_HOECHSTVERSUCHE,
  hasheCode,
  istCodeform,
  normalisiereCode,
} from "@/domain/bestaetigungscode";
import { istKennung } from "@/domain/kennung";
import { zaehle } from "@/domain/drosselung";
import { absenderadresse } from "@/geo/mmdb";
import { holeEinstellungen } from "@/db/einstellungen";
import { zahl } from "@/domain/einstellungen";
import { protokolliere } from "@/db/ereignisse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Löst den sechsstelligen Code aus der SMS ein.
 *
 * **Zwei Begrenzungen, und sie wirken verschieden.** Der Zähler am Token
 * begrenzt das Raten an *einem* Code auf fünf Versuche; die Drosselung nach
 * Absenderadresse begrenzt das Durchprobieren über *viele* Bewertungen
 * hinweg. Ohne die zweite liesse sich mit tausend eigenen Abgaben tausendmal
 * fünfmal raten.
 *
 * **Die Antwort unterscheidet nicht zwischen „falsch" und „gibt es nicht".**
 * Sonst wäre sie ein Orakel darüber, zu welcher Bewertung gerade ein Code
 * offen ist - und das ist eine Auskunft über fremde Leute.
 */
export async function POST(anfrage: Request): Promise<NextResponse> {
  const absender = absenderadresse(await headers());
  if (!zaehle("bestaetigungscode", absender, 20, 600_000).erlaubt) {
    return NextResponse.json(
      { ok: false, meldung: "Das waren zu viele Versuche. Bitte warte ein paar Minuten." },
      { status: 429 },
    );
  }

  let eingabe: { bewertung?: unknown; code?: unknown };
  try {
    eingabe = (await anfrage.json()) as typeof eingabe;
  } catch {
    return NextResponse.json({ ok: false, meldung: "Die Anfrage war nicht lesbar." }, { status: 400 });
  }

  const bewertungId = String(eingabe.bewertung ?? "");
  const code = normalisiereCode(String(eingabe.code ?? ""));
  if (!istKennung(bewertungId) || !istCodeform(code)) {
    return NextResponse.json(
      { ok: false, meldung: "Der Code besteht aus sechs Ziffern." },
      { status: 400 },
    );
  }

  const schwelle = zahl(await holeEinstellungen(), "halteschwelle");
  const ergebnis = await loeseCodeEin(
    bewertungId,
    (kontoId) => hasheCode(kontoId, code),
    CODE_HOECHSTVERSUCHE,
    schwelle,
  );

  if (!ergebnis.ok) {
    await protokolliere({
      art: "warnung",
      bereich: "abgabe",
      meldung: `Bestätigungscode abgewiesen: ${ergebnis.grund}`,
      // Weder Kennung noch Code - der Grund genügt, um ein Muster zu sehen.
    });

    const meldung =
      ergebnis.grund === "abgelaufen"
        ? "Der Code ist abgelaufen. Fordere einen neuen an."
        : ergebnis.grund === "zu_viele" || ergebnis.grund === "verbraucht"
          ? "Dieser Code gilt nicht mehr. Fordere einen neuen an."
          : "Der Code stimmt nicht.";
    return NextResponse.json({ ok: false, meldung }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    bewertungen: ergebnis.folge.gesamt,
    veroeffentlicht: ergebnis.folge.veroeffentlicht,
  });
}
