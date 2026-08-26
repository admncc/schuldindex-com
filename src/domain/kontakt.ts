/**
 * Umgang mit Kontaktdaten.
 *
 * Ein Konto braucht den Kontakt dauerhaft (Entscheidung E10) — also liegt er
 * verschlüsselt in der Datenbank. Daneben steht ein Hash, mit dem sich Dubletten
 * und Mehrfachkonten erkennen lassen, **ohne** entschlüsseln zu müssen. Das ist
 * der Unterschied, auf den es ankommt: die Betrugserkennung läuft ständig, das
 * Entschlüsseln braucht es nur beim Versand einer Nachricht.
 *
 * Zwei Schlüssel, zwei Zwecke:
 *   - `KONTAKT_HMAC_SCHLUESSEL` bildet den Suchhash. Ein blanker SHA-256 genügte
 *     nicht: der Raum deutscher Mobilnummern ist klein genug, um ihn
 *     durchzurechnen. Mit einem geheimen Schlüssel geht das nicht.
 *   - `KONTAKT_CHIFFRE_SCHLUESSEL` verschlüsselt den Klartext.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const KONTAKTARTEN = ["whatsapp", "sms", "email"] as const;

export type Kontaktart = (typeof KONTAKTARTEN)[number];

export function istKontaktart(wert: string): wert is Kontaktart {
  return (KONTAKTARTEN as readonly string[]).includes(wert);
}

/**
 * Bringt eine Eingabe in die Form, in der sie gehasht wird.
 *
 * Ohne Normalisierung gälten `0170 1234567`, `+49 170 1234567` und
 * `0049-170-1234567` als drei verschiedene Personen — und jede
 * Mehrfachkonten-Erkennung liefe ins Leere.
 */
export function normalisiereKontakt(wert: string, art: Kontaktart): string {
  if (art === "email") {
    // Nur Kleinschreibung. Punkte im lokalen Teil zu entfernen wäre bequem für
    // die Dublettenerkennung, ist aber bei den meisten Anbietern schlicht falsch.
    return wert.trim().toLowerCase();
  }

  let ziffern = wert.replace(/[^\d+]/g, "");
  if (ziffern.startsWith("+")) ziffern = ziffern.slice(1);
  else if (ziffern.startsWith("00")) ziffern = ziffern.slice(2);
  else if (ziffern.startsWith("0")) ziffern = "49" + ziffern.slice(1); // deutsche Inlandsform
  return "+" + ziffern;
}

function schluessel(name: string, laenge: number): Buffer {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} ist nicht gesetzt.`);
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== laenge) {
    throw new Error(`${name} muss ${laenge} Byte lang sein (Base64), ist ${roh.length}.`);
  }
  return roh;
}

/** Suchhash für Dubletten- und Mehrfachkontenerkennung. */
export function kontaktHash(wert: string, art: Kontaktart): string {
  const normal = normalisiereKontakt(wert, art);
  return createHmac("sha256", schluessel("KONTAKT_HMAC_SCHLUESSEL", 32))
    .update(`${art}:${normal}`)
    .digest("base64url");
}

const CHIFFRE = "aes-256-gcm";

/**
 * Verschlüsselt den Klartext für die Speicherung.
 * Aufbau: `nonce(12) | pruefsumme(16) | geheimtext`.
 */
export function verschluessele(klartext: string): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv(CHIFFRE, schluessel("KONTAKT_CHIFFRE_SCHLUESSEL", 32), nonce);
  const geheim = Buffer.concat([c.update(klartext, "utf8"), c.final()]);
  return Buffer.concat([nonce, c.getAuthTag(), geheim]);
}

export function entschluessele(daten: Buffer): string {
  const nonce = daten.subarray(0, 12);
  const pruefsumme = daten.subarray(12, 28);
  const geheim = daten.subarray(28);
  const d = createDecipheriv(CHIFFRE, schluessel("KONTAKT_CHIFFRE_SCHLUESSEL", 32), nonce);
  d.setAuthTag(pruefsumme);
  return Buffer.concat([d.update(geheim), d.final()]).toString("utf8");
}

/**
 * Verschleiert einen Kontakt für die Anzeige: `a***a@beispiel.de`,
 * `+49 170 ****567`.
 *
 * Gebraucht auf der Bestätigungsseite — sie muss erkennen lassen, wohin die
 * Nachricht ging, ohne den Kontakt bei einem geteilten Bildschirm preiszugeben.
 */
export function verschleiere(wert: string, art: Kontaktart): string {
  if (art === "email") {
    const [lokal = "", bereich = ""] = wert.trim().toLowerCase().split("@");
    const sichtbar = lokal.length <= 2 ? lokal.slice(0, 1) : `${lokal[0]}***${lokal.at(-1)}`;
    return `${sichtbar}@${bereich}`;
  }
  const normal = normalisiereKontakt(wert, art);
  return `${normal.slice(0, 6)} ****${normal.slice(-3)}`;
}

/** Zeitkonstanter Vergleich zweier Hashes. */
export function hashGleich(a: string, b: string): boolean {
  const pa = Buffer.from(a);
  const pb = Buffer.from(b);
  if (pa.length !== pb.length) return false;
  return timingSafeEqual(pa, pb);
}
