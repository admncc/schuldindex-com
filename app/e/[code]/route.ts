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

  // **Relativ, nicht absolut.** `new URL("/", anfrage.url)` nimmt den Namen,
  // unter dem der Node-Prozess gebunden ist - hinter einem Vorschaltserver
  // also `localhost:3000`. Wer den vorgelesenen Link eintippt, landete damit
  // auf einer Adresse, die es draußen nicht gibt.
  const antwort = new NextResponse(null, { status: 302, headers: { location: "/" } });

  // Eine bestehende Empfehlung bleibt stehen - dieselbe Regel wie in der
  // Middleware. Ohne sie überschriebe der zuletzt geöffnete Kurzlink den
  // ersten: Wer in der Klassengruppe seinen Link hinterherpostet, bekäme alle,
  // die längst über den Link einer anderen gekommen sind.
  const schonGeworben = istEmpfehlungscode(
    anfrage.headers
      .get("cookie")
      ?.split(";")
      .map((t) => t.trim())
      .find((t) => t.startsWith(`${EMPFEHLUNGSCOOKIE}=`))
      ?.slice(EMPFEHLUNGSCOOKIE.length + 1),
  );

  if (istEmpfehlungscode(code) && !schonGeworben) {
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
