/**
 * Zugang zum eigenen Konto.
 *
 * Kein Kennwort, sondern ein Link an den hinterlegten Kontakt — dieselbe
 * Mechanik wie bei der Bestätigung einer Bewertung. Das ist keine Bequemlichkeit:
 * ein Kennwort wäre ein weiteres Geheimnis, das ein Vierzehnjähriger verwalten
 * müsste, und der häufigste Weg, wie ein Konto verlorengeht. Der Kontakt ist
 * ohnehin verifiziert; mehr trägt die Anmeldung hier nicht.
 */

import { createHmac, randomBytes } from "node:crypto";

/**
 * Wie lange eine Sitzung gilt.
 *
 * Dreißig Tage — deutlich länger als in der Moderation (zwölf Stunden). Der
 * Unterschied ist Absicht: hier kann jemand die eigenen Bewertungen ändern, dort
 * fremde freigeben. Wer sein Telefon verliert, kann die Sitzung über einen neuen
 * Anmeldelink beenden.
 */
export const KONTO_SITZUNG_TAGE = 30;

/** Gültigkeit des Anmeldelinks. Kürzer als die Bestätigung: er kommt auf Zuruf. */
export const ANMELDELINK_STUNDEN = 2;

/**
 * Wie viele Anmeldelinks je Konto und Stunde.
 *
 * Ohne Begrenzung ließe sich das Telefon einer beliebigen Nummer mit
 * Anmeldelinks zuschütten — die Nummer muss dafür nicht einmal ein Konto haben,
 * denn die Antwort ist in beiden Fällen dieselbe.
 */
export const LINKS_JE_STUNDE = 3;

export interface Zugangstoken {
  readonly klartext: string;
  readonly hash: string;
  readonly gueltigBis: Date;
}

function schluessel(): Buffer {
  const wert = process.env["SITZUNG_HMAC_SCHLUESSEL"];
  if (!wert) throw new Error("SITZUNG_HMAC_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) throw new Error(`SITZUNG_HMAC_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  return roh;
}

/**
 * Hash mit eigenem Verwendungszweck.
 *
 * Der Zweck geht in den Hash ein, damit ein Sitzungstoken nicht als Anmeldelink
 * durchgeht und umgekehrt — auch dann nicht, wenn beide denselben Schlüssel
 * benutzen.
 */
export function hasheKontotoken(klartext: string, zweck: "sitzung" | "anmeldung"): string {
  return createHmac("sha256", schluessel()).update(`konto:${zweck}:${klartext}`).digest("base64url");
}

export function erzeugeKontositzung(jetzt = new Date()): Zugangstoken {
  const klartext = randomBytes(32).toString("base64url");
  return {
    klartext,
    hash: hasheKontotoken(klartext, "sitzung"),
    gueltigBis: new Date(jetzt.getTime() + KONTO_SITZUNG_TAGE * 24 * 3600_000),
  };
}

export function erzeugeAnmeldelink(jetzt = new Date()): Zugangstoken {
  const klartext = randomBytes(32).toString("base64url");
  return {
    klartext,
    hash: hasheKontotoken(klartext, "anmeldung"),
    gueltigBis: new Date(jetzt.getTime() + ANMELDELINK_STUNDEN * 3600_000),
  };
}

const COOKIE_BASIS = "schulindex_konto";

/** Wie in der Moderation: das `__Host-`-Präfix nur dort, wo `Secure` gesetzt wird. */
export function kontocookie(sicher = process.env["NODE_ENV"] === "production"): string {
  return sicher ? `__Host-${COOKIE_BASIS}` : COOKIE_BASIS;
}

export const KONTOCOOKIE_NAMEN: readonly string[] = [`__Host-${COOKIE_BASIS}`, COOKIE_BASIS];

/**
 * Was nach der Anforderung eines Anmeldelinks angezeigt wird.
 *
 * **Immer derselbe Text**, ob es das Konto gibt oder nicht. Sonst ließe sich mit
 * diesem Formular herausfinden, ob eine bestimmte Handynummer schon einmal eine
 * Schule bewertet hat — genau die Auskunft, die dieses Portal niemandem geben
 * darf.
 */
export const LINK_ANGEFORDERT =
  "Wenn zu diesem Kontakt ein Konto besteht, haben wir dir gerade einen Anmeldelink geschickt. " +
  `Er gilt ${ANMELDELINK_STUNDEN} Stunden.`;

/** Dasselbe gilt, wenn die Begrenzung greift. */
export const ZU_VIELE_LINKS =
  `Du hast in der letzten Stunde schon ${LINKS_JE_STUNDE} Anmeldelinks angefordert. ` +
  "Sieh in deinen Nachrichten nach; der zuletzt geschickte Link gilt weiter.";
