import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { bewertungAendern } from "@/dienste/bewertungAendern";
import { aenderungsumgebungMitDatenbank } from "@/dienste/umgebung";
import { holeKontositzung } from "@/db/konto";
import { KONTOCOOKIE_NAMEN } from "@/domain/kontozugang";
import type { Bewertungseingabe } from "@/domain/bewertungseingabe";
import { absenderadresse } from "@/geo/mmdb";
import { zaehle } from "@/domain/drosselung";

/** Wie bei der Abgabe: ein vollständiges Formular ist wenige Kilobyte gross. */
const HOECHSTGROESSE = 64 * 1024;

/**
 * Höchstens so viele Änderungen je Absender und Stunde.
 *
 * Grosszügiger als bei der Abgabe - eine Änderung ist ein gewöhnlicher
 * Vorgang -, aber nicht unbegrenzt: Jede legt eine neue Fassung an, und die
 * Route hatte bisher weder Grenze noch Grössenprüfung, obwohl die Abgabe
 * daneben beides hat.
 */
const AENDERUNGEN_JE_STUNDE = 40;

/**
 * Ändert eine eigene Bewertung.
 *
 * Wer geändert werden darf, entscheidet die Sitzung - nicht die Anfrage. Aus
 * dem Rumpf kommen nur die Antworten; die Kennung des Kontos kommt aus dem
 * Cookie und wird nie aus dem JSON gelesen.
 */
export async function PATCH(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const absender = absenderadresse(await headers());
  const laden = await cookies();
  const cookie = KONTOCOOKIE_NAMEN.map((n) => laden.get(n)?.value).find((v) => v !== undefined);
  const konto = cookie === undefined ? null : await holeKontositzung(cookie);
  if (konto === null) {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Bitte melde dich an, um deine Bewertung zu ändern." }] },
      { status: 401 },
    );
  }

  if (!zaehle("bewertung-aendern", absender ?? konto.id, AENDERUNGEN_JE_STUNDE, 3_600_000).erlaubt) {
    return NextResponse.json(
      {
        ok: false,
        fehler: [{ feld: "", meldung: "Das waren gerade viele Änderungen. Bitte versuche es später noch einmal." }],
      },
      { status: 429 },
    );
  }

  const laenge = Number(anfrage.headers.get("content-length") ?? "0");
  if (Number.isFinite(laenge) && laenge > HOECHSTGROESSE) {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage ist zu groß." }] },
      { status: 413 },
    );
  }

  let eingabe: Bewertungseingabe;
  try {
    eingabe = (await anfrage.json()) as Bewertungseingabe;
  } catch {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage war nicht lesbar." }] },
      { status: 400 },
    );
  }

  try {
    const ergebnis = await bewertungAendern(id, konto.id, eingabe, aenderungsumgebungMitDatenbank());
    return NextResponse.json(ergebnis, { status: ergebnis.ok ? 200 : 422 });
  } catch (fehler) {
    console.error("Bewertung konnte nicht geändert werden:", fehler);
    return NextResponse.json(
      {
        ok: false,
        fehler: [{ feld: "", meldung: "Da ist etwas schiefgegangen. Bitte versuche es später noch einmal." }],
      },
      { status: 500 },
    );
  }
}
