/**
 * Das Kennwort des Diagnosezugangs: erzeugen, hashen, vergleichen.
 *
 * Getrennt von `diagnose.ts`, weil `node:crypto` hier unvermeidlich ist und
 * dort nicht vorkommen darf - siehe dortiger Kopf.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TOKEN_VORSATZ, type Zugangsdauer } from "./diagnose";

export interface Diagnosetoken {
  /** Wird einmal angezeigt und steht nie in der Datenbank. */
  readonly klartext: string;
  readonly hash: string;
  readonly gueltigBis: Date;
}

function tokenSchluessel(): Buffer {
  const wert = process.env["TOKEN_HMAC_SCHLUESSEL"];
  if (!wert) throw new Error("TOKEN_HMAC_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) throw new Error(`TOKEN_HMAC_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  return roh;
}

export function hasheToken(klartext: string): string {
  return createHmac("sha256", tokenSchluessel()).update(klartext).digest("base64url");
}

export function erzeugeDiagnosetoken(stunden: Zugangsdauer, jetzt = new Date()): Diagnosetoken {
  const klartext = TOKEN_VORSATZ + randomBytes(32).toString("base64url");
  return {
    klartext,
    hash: hasheToken(klartext),
    gueltigBis: new Date(jetzt.getTime() + stunden * 3600_000),
  };
}

/** Vergleich in gleichbleibender Zeit - sonst verrät die Dauer den Präfix. */
export function tokenGleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
