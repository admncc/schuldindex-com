/**
 * Die konkreten Versandwege.
 *
 * WhatsApp und der SMS-Anbieter brauchen Zugangsdaten und eine Freigabe durch
 * Meta. Solange die fehlen, tritt der Protokollweg an ihre Stelle: er schreibt
 * die Nachricht in die Serverausgabe, statt sie zu verschicken.
 *
 * Das ist kein Platzhalter aus Bequemlichkeit. Der Protokollweg macht den
 * gesamten Ablauf lauffähig, bevor die Meta-Verifizierung durch ist — und die
 * hat ein bis drei Wochen Vorlauf.
 */

import { telefonZustaendig, type Nachricht, type Versandweg, type Zustellergebnis } from "./nachricht";

/**
 * Schreibt die Nachricht ins Protokoll.
 *
 * **Niemals in der Produktion einsetzen** — der Bestätigungslink stünde damit
 * in den Serverprotokollen und jede Person mit Protokollzugriff könnte fremde
 * Konten bestätigen.
 */
export function protokollweg(art: Versandweg["art"]): Versandweg {
  return {
    art,
    zustaendig: (empfaenger, gewuenscht) =>
      art === "email" ? empfaenger.includes("@") : telefonZustaendig(empfaenger, gewuenscht),
    async sende(nachricht: Nachricht): Promise<Zustellergebnis> {
      if (process.env["NODE_ENV"] === "production") {
        return { ok: false, grund: "Protokollweg ist in der Produktion gesperrt" };
      }
      console.info(
        `\n[Versand ${art}] an ${nachricht.empfaenger}\n` +
          (nachricht.betreff ? `Betreff: ${nachricht.betreff}\n` : "") +
          `${nachricht.text}\n`,
      );
      return { ok: true, weg: art };
    },
  };
}

/**
 * Die Kette für den Betrieb.
 *
 * Reihenfolge ist bedeutsam: WhatsApp zuerst, weil je Nachricht günstiger, SMS
 * als Rückfall für Nummern ohne WhatsApp-Konto, E-Mail für alle ohne Nummer.
 */
export function versandkette(): Versandweg[] {
  return [protokollweg("whatsapp"), protokollweg("sms"), protokollweg("email")];
}
