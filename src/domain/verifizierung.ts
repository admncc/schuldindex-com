/**
 * Bestätigungstoken für Konten.
 *
 * Der Ablauf: Konto anlegen → Token erzeugen → Klartext per Nachricht schicken,
 * **nur den Hash speichern** → beim Aufruf des Links den Hash vergleichen.
 *
 * Warum nur der Hash: Wer die Datenbank liest, könnte sonst jedes offene Konto
 * selbst bestätigen. Bei einem Portal, dessen Nutzerkreis überwiegend
 * minderjährig ist, ist das keine theoretische Sorge.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Gültigkeitsdauer, wie im Brief vorgesehen. */
export const GUELTIG_STUNDEN = 24;

/** Wie oft eine Nachricht erneut angefordert werden darf. */
export const MAX_ERNEUT_SENDEN = 3;

export interface Token {
  /** Geht an die Person und steht nie in der Datenbank. */
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

export function hashe(klartext: string): string {
  return createHmac("sha256", tokenSchluessel()).update(klartext).digest("base64url");
}

/**
 * Erzeugt ein Token.
 *
 * 32 zufällige Byte, Base64url — kurz genug für eine SMS mit 160 Zeichen,
 * lang genug, dass Raten ausgeschlossen ist.
 */
export function erzeugeToken(jetzt = new Date()): Token {
  const klartext = randomBytes(32).toString("base64url");
  return {
    klartext,
    hash: hashe(klartext),
    gueltigBis: new Date(jetzt.getTime() + GUELTIG_STUNDEN * 3600_000),
  };
}

export type Pruefergebnis =
  | { readonly ok: true }
  | { readonly ok: false; readonly grund: "unbekannt" | "abgelaufen" | "verbraucht" };

export interface GespeichertesToken {
  readonly hash: string;
  readonly gueltigBis: Date;
  readonly verbrauchtAm: Date | null;
}

/**
 * Prüft ein vorgelegtes Token.
 *
 * Die Reihenfolge ist Absicht: erst der Hashvergleich, dann Ablauf und
 * Verbrauch. Umgekehrt verriete die Fehlermeldung, ob ein Token überhaupt
 * existiert — und damit, ob zu einem Konto eine Bestätigung offen ist.
 */
export function pruefeToken(
  vorgelegt: string,
  gespeichert: GespeichertesToken | null,
  jetzt = new Date(),
): Pruefergebnis {
  if (gespeichert === null) return { ok: false, grund: "unbekannt" };

  const a = Buffer.from(hashe(vorgelegt));
  const b = Buffer.from(gespeichert.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, grund: "unbekannt" };

  if (gespeichert.verbrauchtAm !== null) return { ok: false, grund: "verbraucht" };
  if (gespeichert.gueltigBis.getTime() <= jetzt.getTime()) return { ok: false, grund: "abgelaufen" };
  return { ok: true };
}

/**
 * Text für die betroffene Person.
 *
 * „Unbekannt“ und „verbraucht“ sagen absichtlich dasselbe: Wer einen fremden
 * Link ausprobiert, soll nicht erfahren, ob es ihn gibt.
 */
export const PRUEFUNG_HINWEIS: Readonly<Record<"unbekannt" | "abgelaufen" | "verbraucht", string>> = {
  unbekannt: "Dieser Link ist nicht mehr gültig. Fordere dir einen neuen an.",
  verbraucht: "Dieser Link ist nicht mehr gültig. Fordere dir einen neuen an.",
  abgelaufen: `Dieser Link war ${GUELTIG_STUNDEN} Stunden gültig und ist abgelaufen. Fordere dir einen neuen an.`,
};
