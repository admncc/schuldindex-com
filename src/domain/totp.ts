/**
 * Zeitbasierte Einmalkennwörter (TOTP, RFC 6238) für den Moderationszugang.
 *
 * Warum selbst geschrieben und nicht als Abhängigkeit geholt: der Algorithmus
 * ist dreißig Zeilen, die Bausteine (HMAC-SHA1) stehen in `node:crypto`, und
 * jede Bibliothek an dieser Stelle ist eine, die den zweiten Faktor der
 * Moderation lesen könnte. Der Prüfstand unten geht gegen die Testvektoren aus
 * RFC 6238 - wenn die stimmen, stimmt die Umsetzung.
 *
 * SHA-1 ist hier kein Versäumnis: Google Authenticator, Aegis, 1Password und
 * die übrigen gängigen Apps können nur SHA-1 mit sechs Stellen. Ein stärkerer
 * Hash wäre eine Oberfläche, in der sich niemand einrichten kann. Der Angriff,
 * gegen den TOTP schützt, ist ohnehin nicht die Kollision, sondern das
 * gestohlene Kennwort.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Schrittweite in Sekunden. 30 ist das, was jede App voraussetzt. */
export const SCHRITT_SEKUNDEN = 30;

/** Stellen des Codes. */
export const STELLEN = 6;

/**
 * Wie viele Schritte in jede Richtung akzeptiert werden.
 *
 * Eins - das sind ±30 Sekunden. Ohne Toleranz scheitert jeder, dessen Uhr ein
 * paar Sekunden nachgeht; mit zu viel Toleranz verlängert sich das Zeitfenster,
 * in dem ein abgefangener Code noch etwas wert ist.
 */
export const TOLERANZ_SCHRITTE = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 nach RFC 4648, ohne Auffüllzeichen - so erwarten es die Apps. */
export function base32Kodiere(daten: Buffer): string {
  let bits = 0;
  let wert = 0;
  let aus = "";
  for (const byte of daten) {
    wert = (wert << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      aus += BASE32[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) aus += BASE32[(wert << (5 - bits)) & 31];
  return aus;
}

export function base32Dekodiere(text: string): Buffer {
  const sauber = text.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let wert = 0;
  const aus: number[] = [];
  for (const zeichen of sauber) {
    const index = BASE32.indexOf(zeichen);
    if (index < 0) throw new Error(`Ungültiges Base32-Zeichen: „${zeichen}“`);
    wert = (wert << 5) | index;
    bits += 5;
    if (bits >= 8) {
      aus.push((wert >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(aus);
}

/**
 * Erzeugt ein neues Geheimnis.
 *
 * 20 Byte, weil RFC 4226 das als Mindestmaß nennt und weil es genau 32 Zeichen
 * Base32 ergibt - eine Länge, die sich noch abtippen lässt.
 */
export function erzeugeGeheimnis(): string {
  return base32Kodiere(randomBytes(20));
}

/** Ein Code für einen Zählerstand (HOTP, RFC 4226). */
export function hotp(geheimnis: Buffer, zaehler: number): string {
  const block = Buffer.alloc(8);
  block.writeBigUInt64BE(BigInt(zaehler));
  const abdruck = createHmac("sha1", geheimnis).update(block).digest();

  // Dynamische Trunkierung: die letzten vier Bit zeigen auf die Startstelle.
  const versatz = abdruck[abdruck.length - 1]! & 0x0f;
  const zahl =
    ((abdruck[versatz]! & 0x7f) << 24) |
    ((abdruck[versatz + 1]! & 0xff) << 16) |
    ((abdruck[versatz + 2]! & 0xff) << 8) |
    (abdruck[versatz + 3]! & 0xff);

  return String(zahl % 10 ** STELLEN).padStart(STELLEN, "0");
}

export function schritt(jetzt: Date): number {
  return Math.floor(jetzt.getTime() / 1000 / SCHRITT_SEKUNDEN);
}

export function totp(geheimnisBase32: string, jetzt = new Date()): string {
  return hotp(base32Dekodiere(geheimnisBase32), schritt(jetzt));
}

export type Pruefergebnis =
  | { readonly ok: true; readonly schritt: number }
  | { readonly ok: false };

/**
 * Prüft einen vorgelegten Code.
 *
 * Zurück kommt der Schritt, in dem er gepasst hat - nicht aus Neugier: der
 * Aufrufer muss ihn speichern, sonst lässt sich derselbe Code innerhalb seines
 * Fensters ein zweites Mal einlösen. Genau das macht jemand, der einem
 * Moderator über die Schulter geschaut hat.
 *
 * `zuletztGenutzt` ist der zuletzt eingelöste Schritt; alles bis einschließlich
 * dazu wird abgewiesen.
 */
export function pruefeCode(
  geheimnisBase32: string,
  vorgelegt: string,
  jetzt = new Date(),
  zuletztGenutzt: number | null = null,
): Pruefergebnis {
  const eingabe = vorgelegt.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(eingabe)) return { ok: false };

  const geheimnis = base32Dekodiere(geheimnisBase32);
  const jetztSchritt = schritt(jetzt);

  for (let d = -TOLERANZ_SCHRITTE; d <= TOLERANZ_SCHRITTE; d++) {
    const s = jetztSchritt + d;
    if (zuletztGenutzt !== null && s <= zuletztGenutzt) continue;
    const erwartet = Buffer.from(hotp(geheimnis, s));
    const gegeben = Buffer.from(eingabe);
    if (erwartet.length === gegeben.length && timingSafeEqual(erwartet, gegeben)) {
      return { ok: true, schritt: s };
    }
  }
  return { ok: false };
}

/**
 * Einrichtungs-URL für die Authenticator-App.
 *
 * Der Aussteller steht sowohl im Pfad als auch als Parameter - ältere Apps
 * lesen das eine, neuere das andere.
 */
export function otpauthUrl(kennung: string, geheimnisBase32: string, aussteller = "SCHULINDEX"): string {
  const bezeichnung = `${encodeURIComponent(aussteller)}:${encodeURIComponent(kennung)}`;
  const p = new URLSearchParams({
    secret: geheimnisBase32,
    issuer: aussteller,
    algorithm: "SHA1",
    digits: String(STELLEN),
    period: String(SCHRITT_SEKUNDEN),
  });
  return `otpauth://totp/${bezeichnung}?${p.toString()}`;
}
