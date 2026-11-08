import { NextResponse, type NextRequest } from "next/server";
import {
  EMPFEHLUNG_TAGE,
  EMPFEHLUNGSCOOKIE,
  EMPFEHLUNGSPARAMETER,
  istEmpfehlungscode,
} from "@/domain/empfehlung";
import { GERAET_TAGE, GERAETECOOKIE, istGeraetekennung } from "@/domain/geraetekennung";
import { adresseIstGeheim, GEHEIMKOPFZEILE } from "@/domain/geheimeadresse";

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
  /**
   * Trägt an die Seite weiter, ob in dieser Adresse ein Geheimnis steckt.
   *
   * Hier und nicht in der Seite, weil die Middleware jede öffentliche Anfrage
   * ohnehin sieht: Die nächste Seite mit einem Token in der Adresse wäre sonst
   * die eine, bei der es niemand bedenkt. Die Seite liest die Kopfzeile und
   * lädt dann nichts Fremdes (`app/einbettung.tsx`).
   */
  const kopfzeilen = new Headers(anfrage.headers);
  // Was von draußen kommt, gilt nicht: Sonst könnte jeder die Messung
  // abschalten - oder, schlimmer, sie auf einer Geheimseite erzwingen.
  kopfzeilen.delete(GEHEIMKOPFZEILE);
  if (adresseIstGeheim(anfrage.nextUrl.pathname, anfrage.nextUrl.searchParams)) {
    kopfzeilen.set(GEHEIMKOPFZEILE, "1");
  }

  const antwort = NextResponse.next({ request: { headers: kopfzeilen } });
  if (kopfzeilen.get(GEHEIMKOPFZEILE) === "1") {
    /**
     * Und das Geheimnis darf auch nicht auf der **nächsten** Seite ankommen.
     *
     * Die Einbettung auf der Geheimseite selbst ist damit schon abgeschaltet.
     * Wer von dort aber weiterklickt, bringt die aufrufende Adresse mit:
     * `document.referrer` steht dann auf `/bestaetigen?token=…`, und das liest
     * eine Reichweitenmessung aus und schickt es mit. Deshalb hier `no-referrer`
     * - gezielt nur auf diesen Seiten, weil die Verweisquelle überall sonst die
     * Angabe ist, aus der sich überhaupt ablesen lässt, woher die Leute kommen.
     */
    antwort.headers.set("Referrer-Policy", "no-referrer");
  }
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
  // Nur die öffentlichen Seiten. Nicht die statischen Dateien (für ein Bild
  // braucht niemand eine Kennung), nicht die Schnittstellen (dort wird der
  // Cookie gelesen, nicht gesetzt) und nicht die Moderation - eine
  // Gerätekennung für die eigene Redaktion wäre sinnlos und stünde nur im Weg.
  matcher: [
    "/((?!api|moderation|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
