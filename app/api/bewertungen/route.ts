import { NextResponse } from "next/server";
import { bewertungAbgeben } from "@/dienste/bewertungAbgeben";
import { umgebungMitDatenbank } from "@/dienste/umgebung";
import type { Bewertungseingabe } from "@/domain/bewertungseingabe";

/**
 * Nimmt eine Bewertung entgegen.
 *
 * Die eigentliche Prüfung steckt in `bewertungAbgeben` — hier steht nur, was
 * zur Anbindung gehört: Anfrage lesen, Umgebung bauen, Antwort formen.
 */
export async function POST(anfrage: Request): Promise<NextResponse> {
  let eingabe: Bewertungseingabe;
  try {
    eingabe = (await anfrage.json()) as Bewertungseingabe;
  } catch {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage war nicht lesbar." }] },
      { status: 400 },
    );
  }

  const basis = process.env["BASIS_URL"] ?? new URL(anfrage.url).origin;

  // Die IP wird hier gelesen und nirgends gespeichert (Entscheidung E3). Ohne
  // angebundenen Geo-Dienst bleibt der Standort unbekannt — die Bewertung geht
  // dann in die Moderation, statt ungeprüft durchzugehen.
  const ortung = async () => null;

  try {
    const ergebnis = await bewertungAbgeben(eingabe, umgebungMitDatenbank(basis, ortung));
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
