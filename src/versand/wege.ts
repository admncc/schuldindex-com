/**
 * Die konkreten Versandwege.
 *
 * WhatsApp und der SMS-Anbieter brauchen Zugangsdaten und eine Freigabe durch
 * Meta. Solange die fehlen, tritt der Protokollweg an ihre Stelle: er schreibt
 * die Nachricht in die Serverausgabe, statt sie zu verschicken.
 *
 * Das ist kein Platzhalter aus Bequemlichkeit. Der Protokollweg macht den
 * gesamten Ablauf lauffähig, bevor die Meta-Verifizierung durch ist - und die
 * hat ein bis drei Wochen Vorlauf.
 */

import { telefonZustaendig, type Nachricht, type Versandweg, type Zustellergebnis } from "./nachricht";
import { emailweg, smtpAusUmgebung } from "./email";
import type { Kontaktart } from "../domain/kontakt";

/**
 * Schreibt die Nachricht ins Protokoll.
 *
 * **Niemals in der Produktion einsetzen** - der Bestätigungslink stünde damit
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
 *
 * **E-Mail ist der erste Weg, der wirklich zustellt** - sobald SMTP in der
 * Umgebung eingerichtet ist. Ist es das nicht, steht wieder der Protokollweg
 * da, und der ist in der Produktion gesperrt: lieber ein sichtbares
 * Scheitern als ein Bestätigungslink in der Serverausgabe.
 *
 * WhatsApp und SMS bleiben Protokollwege, bis es für sie Zugangsdaten gibt.
 * Das ist kein Versehen: Eine Telefonnummer ist die höhere Hürde gegen
 * Mehrfachkonten, aber sie kostet eine Freigabe durch Meta beziehungsweise
 * einen Vertrag - und das Portal soll nicht darauf warten müssen.
 */
export function versandkette(): Versandweg[] {
  const smtp = smtpAusUmgebung();
  return [
    protokollweg("whatsapp"),
    protokollweg("sms"),
    smtp === null ? protokollweg("email") : emailweg(smtp),
  ];
}

/** Ob der E-Mail-Weg zustellen kann - für die Anzeige im Panel. */
export function emailEingerichtet(): boolean {
  return smtpAusUmgebung() !== null;
}

/**
 * Welche Kontaktarten im Betrieb tatsächlich ankommen.
 *
 * **Der Fehler, gegen den das steht.** Das Formular bot bisher alle drei Wege
 * an, die in den Einstellungen angehakt waren - und angehakt waren von Haus
 * aus alle drei. In der Produktion stellte aber keiner zu: WhatsApp und SMS
 * haben keine Zugangsdaten, und der Protokollweg ist dort gesperrt. Wer
 * „WhatsApp" wählte, gab eine Bewertung ab und wartete auf eine Nachricht, die
 * nie kommen konnte. Ein Formular darf keine Wahl anbieten, die es nicht
 * einlösen kann.
 *
 * Ausserhalb der Produktion bleiben alle drei: Dort schreibt der Protokollweg
 * die Nachricht in die Konsole, und das ist für die Entwicklung die
 * Zustellung.
 */
export function zustellbareArten(): Kontaktart[] {
  const protokollGeht = process.env["NODE_ENV"] !== "production";
  const arten: Kontaktart[] = [];
  if (protokollGeht) arten.push("whatsapp", "sms");
  if (smtpAusUmgebung() !== null || protokollGeht) arten.push("email");
  return arten;
}
