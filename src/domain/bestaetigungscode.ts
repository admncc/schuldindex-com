/**
 * Der sechsstellige Bestätigungscode für SMS und WhatsApp.
 *
 * **Warum nicht der Link, der schon da ist.** Ein Link in einer SMS ist
 * mühsam: Er wird umgebrochen, von manchen Geräten nicht erkannt, von
 * Mobilfunkanbietern als Spam eingestuft, und er reisst die Person aus dem
 * Formular heraus in einen Browser, der womöglich ein anderer ist als der, in
 * dem sie gerade bewertet hat. Ein Code bleibt im selben Fenster: eintippen,
 * fertig.
 *
 * **Sechs Ziffern sind wenig** - eine Million Möglichkeiten, in einer Stunde
 * durchprobiert. Was den Code trotzdem trägt, sind drei Dinge zusammen:
 *
 *  - **Er gilt zehn Minuten.** Kein Vorrat, an dem sich in Ruhe arbeiten lässt.
 *  - **Fünf Versuche je Code**, dann ist er verbraucht. Die Trefferchance liegt
 *    damit bei 5 zu 1.000.000.
 *  - **Er ist an das Konto gebunden** (die Kennung geht in den Abdruck ein).
 *    Ohne diese Bindung liesse sich ein geratener Code gegen *alle* offenen
 *    Bestätigungen gleichzeitig prüfen, und aus 5 zu 1.000.000 würde bei
 *    tausend wartenden Konten 5 zu 1.000. Das ist der Unterschied zwischen
 *    aussichtslos und lohnend.
 *
 * Gespeichert wird wie überall sonst nur der Abdruck, nie der Code.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { CODE_STELLEN, normalisiereCode } from "./codeform";

// Form und Erzeugung sind getrennt: Das Eingabefeld im Browser darf die
// Form laden, ohne `node:crypto` mitzuziehen (siehe `codeform.ts`).
export { CODE_STELLEN, istCodeform, normalisiereCode } from "./codeform";

export const CODE_GUELTIG_MINUTEN = 10;
export const CODE_HOECHSTVERSUCHE = 5;

/** Der Zweck in der Tokentabelle - trennt den Code vom Bestätigungslink. */
export const CODE_ZWECK = "code";

function schluessel(): Buffer {
  const wert = process.env["TOKEN_HMAC_SCHLUESSEL"];
  if (!wert) throw new Error("TOKEN_HMAC_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) throw new Error(`TOKEN_HMAC_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  return roh;
}

/**
 * Ein neuer Code.
 *
 * `randomInt` und nicht `Math.random`: Der Code ist ein Geheimnis, auch wenn er
 * kurz ist. Führende Nullen bleiben erhalten - „043912" ist ein gültiger Code,
 * und wer ihn als Zahl behandelt, verliert sie.
 */
export function erzeugeCode(): string {
  return String(randomInt(0, 10 ** CODE_STELLEN)).padStart(CODE_STELLEN, "0");
}

/**
 * Der Abdruck, unter dem der Code gespeichert wird.
 *
 * Die Kontokennung geht mit ein - siehe oben, das ist der Unterschied zwischen
 * „ein Konto angreifen" und „alle gleichzeitig".
 */
export function hasheCode(kontoId: string, code: string): string {
  return createHmac("sha256", schluessel())
    .update(`code:${kontoId}:${normalisiereCode(code)}`)
    .digest("base64url");
}

/** Zeitkonstanter Vergleich zweier Abdrücke. */
export function codeGleich(a: string, b: string): boolean {
  const pa = Buffer.from(a);
  const pb = Buffer.from(b);
  return pa.length === pb.length && timingSafeEqual(pa, pb);
}


export function codeGueltigBis(jetzt = new Date()): Date {
  return new Date(jetzt.getTime() + CODE_GUELTIG_MINUTEN * 60_000);
}
