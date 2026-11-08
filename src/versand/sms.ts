/**
 * Der SMS-Weg über GTX Messaging (REST-Schnittstelle).
 *
 * **Warum die REST- und nicht die ältere HTTP-Schnittstelle.** Die alte
 * (`smsc.php`) legt ihr Ergebnis in den *Antworttext*: Eine gelungene
 * Einlieferung antwortet `200 OK (<Kennung>)`, ein Ausfall kommt als HTTP 200
 * mit `503` darin. Wer dort nur `response.ok` prüft, hält jeden Ausfall für
 * eine Zustellung. Die REST-Schnittstelle benutzt echte Statuscodes, nimmt die
 * Nummer mit führendem `+` - also genau so, wie wir sie ohnehin führen - und
 * ihr Schlüssel ist der, den das Dashboard ausgibt.
 *
 * **Der Schlüssel steht im Pfad der Adresse.** Das ist die Entscheidung des
 * Anbieters, nicht unsere, und sie hat eine Folge, die man bedenken muss:
 * Alles, was eine Adresse protokolliert - auch eine Fehlermeldung von `fetch` -
 * trägt ihn mit. Deshalb geht hier keine Fehlermeldung ungefiltert weiter
 * (`ohneSchluessel`).
 */

import { telefonZustaendig, type Nachricht, type Versandweg, type Zustellergebnis } from "./nachricht";

export interface Smseinstellungen {
  /** Der API-Key aus dem GTX-Dashboard. */
  readonly schluessel: string;
  /**
   * Die Absenderkennung, wie sie im Telefon erscheint.
   *
   * In Deutschland sind alphanumerische Absender bei transaktionalen
   * Nachrichten erlaubt und brauchen keine Anmeldung - anders als in den USA.
   * Höchstens elf Zeichen; „SCHULINDEX" sind zehn. Auf eine solche Nachricht
   * kann niemand antworten, und das ist hier richtig: Ein Code braucht keine
   * Rückmeldung.
   */
  readonly absender: string;
}

const ENDPUNKT = "https://rest.gtx-messaging.net/smsc/sendsms";
const ZEITGRENZE_MS = 15_000;

function ausUmgebung(name: string): string | null {
  const wert = process.env[name];
  return wert === undefined || wert.trim() === "" ? null : wert.trim();
}

export function smsAusUmgebung(): Smseinstellungen | null {
  const schluessel = ausUmgebung("SMS_API_KEY");
  if (schluessel === null) return null;
  return { schluessel, absender: ausUmgebung("SMS_ABSENDER") ?? "SCHULINDEX" };
}

/**
 * Prüft, ob eine Nummer in der Form dasteht, die die Schnittstelle erwartet.
 *
 * Was nicht als internationale Nummer dasteht, wird **nicht zurechtgebogen**:
 * Eine falsch geratene Nummer geht an einen Fremden, und der bekommt dann
 * einen Code, der ihn nichts angeht.
 */
export function istVersandnummer(nummer: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(nummer.trim());
}

/**
 * Nimmt den Schlüssel aus einem Text.
 *
 * Fehlermeldungen von `fetch` enthalten die angefragte Adresse, und in der
 * steht der Schlüssel. Der Grund geht ins Ereignisprotokoll - ohne diese
 * Zeile stünde dort der Zugang zum SMS-Konto.
 */
export function ohneSchluessel(text: string, schluessel: string): string {
  return schluessel === "" ? text : text.split(schluessel).join("<schluessel>");
}

export type Absendefunktion = (
  adresse: string,
  felder: URLSearchParams,
) => Promise<{ status: number; koerper: string }>;

async function ueberHttp(
  adresse: string,
  felder: URLSearchParams,
): Promise<{ status: number; koerper: string }> {
  const antwort = await fetch(adresse, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: felder,
    signal: AbortSignal.timeout(ZEITGRENZE_MS),
  });
  return { status: antwort.status, koerper: await antwort.text() };
}

/**
 * Wertet die Antwort aus.
 *
 * Ein 2xx allein genügt nicht: Die Schnittstelle schickt im Körper einen
 * `message-status`, und nur `OK` heisst eingeliefert.
 */
export function leseAntwort(
  status: number,
  koerper: string,
): { ok: true; kennung: string } | { ok: false; grund: string } {
  if (status >= 200 && status < 300) {
    try {
      const d = JSON.parse(koerper) as { "message-status"?: string; "message-id"?: string };
      if ((d["message-status"] ?? "").toUpperCase() === "OK") {
        return { ok: true, kennung: d["message-id"] ?? "" };
      }
      return { ok: false, grund: `Status ${d["message-status"] ?? "unbekannt"}` };
    } catch {
      return { ok: false, grund: "Antwort nicht lesbar" };
    }
  }

  const erklaerung: Record<number, string> = {
    400: "Anfrage fehlerhaft",
    401: "API-Key falsch oder abgelaufen",
    403: "Nicht erlaubt - Absenderkennung oder Guthaben prüfen",
    500: "Störung beim Anbieter",
  };
  return { ok: false, grund: `${status} - ${erklaerung[status] ?? "unbekannter Fehler"}` };
}

export function smsweg(e: Smseinstellungen, absenden: Absendefunktion = ueberHttp): Versandweg {
  return {
    art: "sms",
    zustaendig: (empfaenger, gewuenscht) =>
      telefonZustaendig(empfaenger, gewuenscht) && istVersandnummer(empfaenger),

    async sende(nachricht: Nachricht): Promise<Zustellergebnis> {
      const an = nachricht.empfaenger.trim();
      if (!istVersandnummer(an)) return { ok: false, grund: "Nummer nicht zustellbar" };

      const felder = new URLSearchParams({ from: e.absender, to: an, text: nachricht.text });
      const adresse = `${ENDPUNKT}/${encodeURIComponent(e.schluessel)}/json`;

      try {
        const { status, koerper } = await absenden(adresse, felder);
        const ergebnis = leseAntwort(status, koerper);
        // **Nie den Nachrichtentext mitgeben.** Im Fehlergrund stünde sonst der
        // Code, und der Grund geht ins Ereignisprotokoll.
        return ergebnis.ok
          ? { ok: true, weg: "sms" }
          : { ok: false, grund: `SMS: ${ohneSchluessel(ergebnis.grund, e.schluessel)}` };
      } catch (fehler) {
        const roh = fehler instanceof Error ? fehler.message : "unbekannter Fehler";
        return {
          ok: false,
          grund: `SMS-Versand fehlgeschlagen: ${ohneSchluessel(roh, e.schluessel).slice(0, 120)}`,
        };
      }
    },
  };
}
