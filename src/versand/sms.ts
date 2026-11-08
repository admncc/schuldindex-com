/**
 * Der SMS-Weg über GTX Messaging.
 *
 * **Zwei Eigenheiten dieser Schnittstelle, die man kennen muss:**
 *
 *  - **Der Erfolg steht im Antworttext, nicht im HTTP-Status.** Eine gelungene
 *    Einlieferung antwortet mit `200 OK (<Kennung>)` im Körper; ein Fehler
 *    kommt als HTTP 200 mit `503 Service Unavailable` darin. Wer nur
 *    `response.ok` prüft, hält jeden Ausfall für eine Zustellung - und die
 *    Person wartet auf eine Nachricht, die nie losgeschickt wurde.
 *  - **Die Nummer geht ohne `+` hinaus.** Intern führen wir sie als
 *    `+491701717179`, die Schnittstelle will `491701717179`.
 *
 * **POST und nicht GET**, obwohl beides ginge: Bei GET stünden Benutzername
 * und Kennwort in der Adresse - und damit in jedem Proxy-Protokoll zwischen
 * hier und dort.
 */

import { telefonZustaendig, type Nachricht, type Versandweg, type Zustellergebnis } from "./nachricht";

export interface Smseinstellungen {
  readonly benutzer: string;
  readonly kennwort: string;
  /**
   * Die Absenderkennung, wie sie im Telefon erscheint.
   *
   * In Deutschland sind alphanumerische Absender bei transaktionalen
   * Nachrichten erlaubt und brauchen keine Anmeldung - anders als in den USA.
   * Höchstens elf Zeichen; „SCHULINDEX" sind zehn. Auf eine solche Nachricht
   * kann niemand antworten, was hier richtig ist: Ein Code braucht keine
   * Rückmeldung.
   */
  readonly absender: string;
}

const ENDPUNKT = "https://http.gtx-messaging.net/smsc.php";
const ZEITGRENZE_MS = 15_000;

function ausUmgebung(name: string): string | null {
  const wert = process.env[name];
  return wert === undefined || wert.trim() === "" ? null : wert.trim();
}

/** Die Einstellungen aus der Umgebung - oder `null`, wenn nichts eingerichtet ist. */
export function smsAusUmgebung(): Smseinstellungen | null {
  const benutzer = ausUmgebung("SMS_BENUTZER");
  const kennwort = ausUmgebung("SMS_KENNWORT");
  if (benutzer === null || kennwort === null) return null;
  return { benutzer, kennwort, absender: ausUmgebung("SMS_ABSENDER") ?? "SCHULINDEX" };
}

/**
 * Bringt eine Nummer in die Form, die die Schnittstelle erwartet.
 *
 * `null`, wenn sie keine sein kann: Was nicht als internationale Nummer
 * dasteht, wird nicht „zurechtgebogen" - eine falsch geratene Nummer geht an
 * einen Fremden.
 */
export function fuerGtx(nummer: string): string | null {
  const sauber = nummer.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(sauber)) return null;
  return sauber.slice(1);
}

/**
 * Liest die Antwort von GTX.
 *
 * Der Körper ist Text, keine Struktur: `200 OK (26818021)` oder ein Fehlercode
 * mit Klartext dahinter. Beides wird hier auseinandergehalten.
 */
export function leseAntwort(koerper: string): { ok: true; kennung: string } | { ok: false; grund: string } {
  const text = koerper.trim();
  const treffer = /^200\s+OK\s*(?:\(([^)]*)\))?/i.exec(text);
  if (treffer !== null) return { ok: true, kennung: treffer[1] ?? "" };

  const code = /^(\d{3})/.exec(text)?.[1];
  const erklaerung: Record<string, string> = {
    "400": "Anfrage fehlerhaft",
    "401": "Benutzername oder Kennwort falsch",
    "408": "Empfänger auf der Sperrliste",
    "503": "Dienst gerade nicht verfügbar",
  };
  return {
    ok: false,
    grund: code !== undefined ? `${code} - ${erklaerung[code] ?? "unbekannter Fehler"}` : text.slice(0, 120),
  };
}

/** Was der Weg zum Senden braucht - als Naht, damit er ohne Netz prüfbar bleibt. */
export type Absendefunktion = (felder: URLSearchParams) => Promise<string>;

async function ueberHttp(felder: URLSearchParams): Promise<string> {
  const antwort = await fetch(ENDPUNKT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: felder,
    signal: AbortSignal.timeout(ZEITGRENZE_MS),
  });
  return antwort.text();
}

export function smsweg(e: Smseinstellungen, absenden: Absendefunktion = ueberHttp): Versandweg {
  return {
    art: "sms",
    zustaendig: (empfaenger, gewuenscht) =>
      telefonZustaendig(empfaenger, gewuenscht) && fuerGtx(empfaenger) !== null,

    async sende(nachricht: Nachricht): Promise<Zustellergebnis> {
      const an = fuerGtx(nachricht.empfaenger);
      if (an === null) return { ok: false, grund: "Nummer nicht zustellbar" };

      const felder = new URLSearchParams({
        user: e.benutzer,
        pass: e.kennwort,
        from: e.absender,
        to: an,
        text: nachricht.text,
      });

      try {
        const ergebnis = leseAntwort(await absenden(felder));
        // **Nie den Text mitgeben.** Im Fehlergrund landet der Code, und der
        // Grund geht ins Ereignisprotokoll.
        return ergebnis.ok ? { ok: true, weg: "sms" } : { ok: false, grund: `SMS: ${ergebnis.grund}` };
      } catch (fehler) {
        const grund = fehler instanceof Error ? fehler.message : "unbekannter Fehler";
        return { ok: false, grund: `SMS-Versand fehlgeschlagen: ${grund.slice(0, 120)}` };
      }
    },
  };
}
