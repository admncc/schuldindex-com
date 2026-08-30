import { NextResponse, type NextRequest } from "next/server";
import {
  EMPFEHLUNG_TAGE,
  EMPFEHLUNGSCOOKIE,
  EMPFEHLUNGSPARAMETER,
  istEmpfehlungscode,
} from "@/domain/empfehlung";
import { GERAET_TAGE, GERAETECOOKIE, istGeraetekennung } from "@/domain/geraetekennung";

/**
 * Setzt die Gerätekennung, wenn noch keine da ist.
 *
 * Sie ist Zufall und sagt nichts über die Person - sie beantwortet eine
 * einzige Frage: Kommen zwanzig Bewertungen aus demselben Browser? Das ist ein
 * **Signal mit kleinem Gewicht**, kein Beweis: Ein privates Fenster hat eine
 * neue Kennung, und wer sie loswerden will, braucht dafür zehn Sekunden.
 *
 * In der Middleware und nicht auf jeder Seite, weil sie sonst je nach
 * Einstiegspunkt fehlte - und der häufigste Einstieg ist ein Empfehlungslink
 * aus einer Story, nicht die Startseite.
 *
 * **Nicht `httpOnly`:** Die Seite spiegelt den Wert in den Local Storage und
 * stellt ihn von dort wieder her, wenn der Cookie verschwindet
 * (`domain/geraetekennung.ts`). Zu verbergen ist an einer Zufallszahl nichts.
 */
export function middleware(anfrage: NextRequest): NextResponse {
  const antwort = NextResponse.next();
  const sicher = anfrage.nextUrl.protocol === "https:";

  const vorhanden = anfrage.cookies.get(GERAETECOOKIE)?.value;
  if (!istGeraetekennung(vorhanden)) {
    antwort.cookies.set(GERAETECOOKIE, crypto.randomUUID(), {
      httpOnly: false,
      sameSite: "lax",
      secure: sicher,
      path: "/",
      maxAge: GERAET_TAGE * 24 * 3600,
    });
  }

  /**
   * `?freund=<code>` an jeder Adresse.
   *
   * Ein Empfehlungslink führt nicht auf eine eigene Seite, sondern dorthin, wo
   * die werbende Person hinschickt: Startseite, Landeplatz, Schulprofil.
   * Deshalb wird der Parameter hier gelesen und nicht in einer Route.
   *
   * **Eine bestehende Empfehlung wird nicht überschrieben.** Wer zuerst
   * geworben hat, hat geworben; sonst gewönne der letzte Link vor der Abgabe,
   * und man könnte sich mit einem eigenen Link selbst überschreiben.
   */
  const code = anfrage.nextUrl.searchParams.get(EMPFEHLUNGSPARAMETER);
  const schonGeworben = istEmpfehlungscode(anfrage.cookies.get(EMPFEHLUNGSCOOKIE)?.value);
  if (istEmpfehlungscode(code) && !schonGeworben) {
    const gemeinsam = {
      sameSite: "lax" as const,
      secure: sicher,
      path: "/",
      maxAge: EMPFEHLUNG_TAGE * 24 * 3600,
    };
    // Zweimal: einmal verbindlich und für Skripte unsichtbar, einmal lesbar,
    // damit die Seite den Wert in den Local Storage spiegeln kann. Der
    // httpOnly-Cookie gilt (`domain/geraetekennung.ts`).
    antwort.cookies.set(EMPFEHLUNGSCOOKIE, code, { ...gemeinsam, httpOnly: true });
    antwort.cookies.set(`${EMPFEHLUNGSCOOKIE}_spiegel`, code, { ...gemeinsam, httpOnly: false });
  }

  return antwort;
}

export const config = {
  // Nur die Seiten, nicht die statischen Dateien: Für ein Bild oder eine
  // Schriftdatei braucht niemand eine Kennung.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
