import { NextResponse } from "next/server";
import { bewertungAbgeben } from "@/dienste/bewertungAbgeben";
import { umgebungMitDatenbank } from "@/dienste/umgebung";
import type { Bewertungseingabe } from "@/domain/bewertungseingabe";
import { pruefeStempel } from "@/domain/formularstempel";
import { MAX_ABSTAENDE } from "@/domain/klickmuster";
import { absenderadresse, ortungFuerIp } from "@/geo/mmdb";

type Anfragekoerper = Bewertungseingabe & { stempel?: string; klickabstaende?: unknown };

/**
 * Nimmt die gemeldeten Klickabstände entgegen - und nur das, was auch eine
 * Zahlenreihe ist.
 *
 * Alles hier kommt aus dem Browser und ist damit beliebig fälschbar. Geprüft
 * wird deshalb nur die Form; ob die Reihe zur Wirklichkeit passt, entscheidet
 * später der Vergleich mit der vom Server gemessenen Dauer
 * (`domain/klickmuster.ts`).
 */
function klickabstaende(wert: unknown): number[] | null {
  if (!Array.isArray(wert)) return null;
  const zahlen = wert
    .slice(0, MAX_ABSTAENDE)
    .filter((a): a is number => typeof a === "number" && Number.isFinite(a) && a >= 0);
  return zahlen.length > 0 ? zahlen : null;
}

/**
 * Nimmt eine Bewertung entgegen.
 *
 * Die eigentliche Prüfung steckt in `bewertungAbgeben` - hier steht nur, was
 * zur Anbindung gehört: Anfrage lesen, Umgebung bauen, Antwort formen.
 */
export async function POST(anfrage: Request): Promise<NextResponse> {
  let eingabe: Anfragekoerper;
  try {
    eingabe = (await anfrage.json()) as Anfragekoerper;
  } catch {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage war nicht lesbar." }] },
      { status: 400 },
    );
  }

  const basis = process.env["BASIS_URL"] ?? new URL(anfrage.url).origin;

  // Die IP wird gelesen und nirgends gespeichert (Entscheidung E3). Nachgeschlagen
  // wird sie in der Datenbank auf unserem eigenen Server - kein fremder Dienst
  // erfährt, wer hier bewertet (`src/geo/mmdb.ts`). Liegt keine Datenbank vor,
  // bleibt der Ort unbekannt und die Bewertung geht in die Moderation, statt
  // ungeprüft durchzugehen.
  const ortung = async () => {
    const treffer = await ortungFuerIp(absenderadresse(anfrage.headers));
    return treffer === null ? null : { lat: treffer.lat, lon: treffer.lon };
  };

  // Die Dauer rechnet der Server aus seinem eigenen Stempel - nicht aus einer
  // Zahl, die die Anfrage mitbringt. Ohne gültigen Stempel bleibt sie leer, und
  // das Tempo-Signal entfällt; abgewiesen wird deswegen niemand.
  const stempel = typeof eingabe.stempel === "string" ? pruefeStempel(eingabe.stempel) : null;
  const dauerSekunden = stempel?.ok ? stempel.dauerSekunden : null;

  try {
    const ergebnis = await bewertungAbgeben(
      { ...eingabe, dauerSekunden, klickabstaende: klickabstaende(eingabe.klickabstaende) },
      umgebungMitDatenbank(basis, ortung),
    );
    return NextResponse.json(ergebnis, { status: ergebnis.ok ? 201 : 422 });
  } catch (fehler) {
    console.error("Bewertung konnte nicht angenommen werden:", fehler);
    return NextResponse.json(
      {
        ok: false,
        fehler: [{ feld: "", meldung: "Da ist etwas schiefgegangen. Bitte versuche es später noch einmal." }],
      },
      { status: 500 },
    );
  }
}
