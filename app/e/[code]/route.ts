import { NextResponse } from "next/server";
import { EMPFEHLUNG_TAGE, EMPFEHLUNGSCOOKIE, istEmpfehlungscode } from "@/domain/empfehlung";
import { anfrageIstSicher } from "../../sichere-verbindung";

/**
 * Der Empfehlungslink.
 *
 * `/e/<code>` merkt sich den Code in einem Cookie und schickt weiter auf die
 * Startseite. Kein Zwischenbildschirm, keine Nachfrage: Wer über eine Story
 * kommt, soll das Portal sehen und nicht ein Formular über Empfehlungen.
 *
 * **Der Code wird nicht geprüft, bevor er im Cookie landet.** Ein Nachschlagen
 * hier hieße eine Datenbankabfrage für jeden Aufruf, auch für jeden Scanner.
 * Zugeordnet wird er erst bei der Abgabe einer Bewertung - dort steht ohnehin
 * eine Transaktion, und ein unbekannter Code läuft dann still ins Leere.
 */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const ziel = new URL("/", anfrage.url);
  const antwort = NextResponse.redirect(ziel, 302);

  if (istEmpfehlungscode(code)) {
    const sicher = anfrageIstSicher(anfrage);
    antwort.cookies.set(EMPFEHLUNGSCOOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: sicher,
      path: "/",
      maxAge: EMPFEHLUNG_TAGE * 24 * 3600,
    });
    // Dieselbe Angabe noch einmal lesbar, damit die Seite sie in den Local
    // Storage spiegeln kann. Der httpOnly-Cookie bleibt die verbindliche
    // Quelle; diese Kopie stellt ihn nur wieder her, wenn er verschwindet
    // (`domain/geraetekennung.ts`).
    antwort.cookies.set(`${EMPFEHLUNGSCOOKIE}_spiegel`, code, {
      httpOnly: false,
      sameSite: "lax",
      secure: sicher,
      path: "/",
      maxAge: EMPFEHLUNG_TAGE * 24 * 3600,
    });
  }

  return antwort;
}
