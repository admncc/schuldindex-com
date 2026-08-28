/**
 * Zugangsschlüssel, die im Panel hinterlegt werden.
 *
 * Bisher stand der Claude-Schlüssel in der Umgebung des Servers. Das ist der
 * sauberere Ort - aber er verlangt Serverzugang für jede Änderung, und wenn der
 * Schlüssel abläuft, steht die Redaktion vor einem Panel, das die
 * Zusammenfassungen nicht mehr erzeugt und nichts dagegen tun kann.
 *
 * Deshalb liegt er jetzt wahlweise in der Datenbank - aber **nicht im
 * Klartext**. Verschlüsselt wird mit AES-256-GCM unter einem Schlüssel, der aus
 * `KONTAKT_CHIFFRE_SCHLUESSEL` abgeleitet wird, mit eigener Zweckkennung: Wer
 * einen Datenbankabzug hat, hat damit noch keinen API-Schlüssel, und ein
 * Geheimnis lässt sich nicht als Kontakt entschlüsseln oder umgekehrt.
 *
 * Die Umgebungsvariable bleibt gültig und geht vor, wenn beides gesetzt ist:
 * Was im Betrieb vorgegeben wurde, soll sich nicht aus einer Oberfläche heraus
 * überschreiben lassen.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const CHIFFRE = "aes-256-gcm";

function ableitung(): Buffer {
  const wert = process.env["KONTAKT_CHIFFRE_SCHLUESSEL"];
  if (!wert) throw new Error("KONTAKT_CHIFFRE_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) {
    throw new Error(`KONTAKT_CHIFFRE_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  }
  // Zweckgetrennt: derselbe Grundschlüssel, aber ein anderer abgeleiteter -
  // sonst wäre ein Geheimnis mit demselben Verfahren lesbar wie ein Kontakt.
  return createHmac("sha256", roh).update("geheimnis:v1").digest();
}

export function verschluesseleGeheimnis(klartext: string): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv(CHIFFRE, ableitung(), nonce);
  const geheim = Buffer.concat([c.update(klartext, "utf8"), c.final()]);
  return Buffer.concat([nonce, c.getAuthTag(), geheim]);
}

/** `null`, wenn der Wert nicht lesbar ist - etwa nach einem Schlüsselwechsel. */
export function entschluesseleGeheimnis(daten: Buffer): string | null {
  try {
    const d = createDecipheriv(CHIFFRE, ableitung(), daten.subarray(0, 12));
    d.setAuthTag(daten.subarray(12, 28));
    return Buffer.concat([d.update(daten.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Zeigt genug, um den Schlüssel wiederzuerkennen - und zu wenig, um ihn zu
 * benutzen.
 *
 * Vier Zeichen am Ende reichen, um zu sehen, ob der hinterlegte Schlüssel der
 * ist, den man gerade in der Hand hat.
 */
export function verschleiereSchluessel(klartext: string): string {
  if (klartext.length <= 8) return "****";
  return `${klartext.slice(0, 7)}…${klartext.slice(-4)}`;
}

/**
 * Sieht das nach einem Anthropic-Schlüssel aus?
 *
 * Absichtlich locker: Das Format kann sich ändern, und ein Schlüssel, der beim
 * Speichern abgewiesen wird, weil das Portal ihn nicht kennt, ist ärgerlicher
 * als einer, der später beim ersten Aufruf scheitert. Geprüft wird nur, was
 * sicher falsch ist.
 */
export function sichtbarKeinSchluessel(klartext: string): string | null {
  const wert = klartext.trim();
  if (wert === "") return "Bitte den Schlüssel eintragen.";
  if (/\s/.test(wert)) return "Der Schlüssel enthält Leerzeichen - vermutlich beim Kopieren passiert.";
  if (wert.length < 20) return "Das ist zu kurz für einen API-Schlüssel.";
  if (!wert.startsWith("sk-")) return "Ein Anthropic-Schlüssel beginnt mit „sk-“.";
  return null;
}
