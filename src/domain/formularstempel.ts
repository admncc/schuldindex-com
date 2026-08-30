/**
 * Signierter Zeitstempel für das Bewertungsformular.
 *
 * Damit „zu schnell ausgefüllt“ überhaupt eine Aussage ist, muss die Dauer
 * belastbar sein. Der Browser die Zeit messen zu lassen und mitzuschicken wäre
 * wertlos: Wer ein Skript schreibt, das den Fragebogen in zwei Sekunden
 * ausfüllt, schreibt auch `dauer: 480` in die Anfrage.
 *
 * Deshalb stellt der Server den Stempel aus, wenn er das Formular ausliefert,
 * und signiert ihn. Beim Absenden rechnet er die Dauer selbst aus der eigenen
 * Uhr. Ein Angreifer kann den Stempel nicht vordatieren - er kann nur warten,
 * und Warten ist genau das, was wir sehen wollen.
 *
 * Was das **nicht** leistet: Wer den Stempel früh holt und das Formular später
 * abschickt, sieht langsam aus. Das ist hingenommen - das Signal soll die
 * unbedachte Massenabgabe finden, nicht den geduldigen Angreifer.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Wie lange ein Stempel gilt.
 *
 * Zwei Stunden: Wer den Fragebogen länger offen hat, bekommt beim Absenden
 * einen Hinweis statt einer stillen Ablehnung. 61 Fragen in Ruhe zu beantworten
 * dauert bei niemandem so lange.
 */
export const STEMPEL_STUNDEN = 2;

export interface Stempel {
  /** Sekunden seit Epoche - im Klartext, damit der Server nicht raten muss. */
  readonly ausgestellt: number;
  readonly signatur: string;
}

function schluessel(): Buffer {
  const wert = process.env["TOKEN_HMAC_SCHLUESSEL"];
  if (!wert) throw new Error("TOKEN_HMAC_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) throw new Error(`TOKEN_HMAC_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  return roh;
}

/**
 * Der Schul-Slug geht in die Signatur ein.
 *
 * Ohne ihn war ein einmal geholter Stempel zwei Stunden lang für **jede**
 * Schule gültig: einmal ein Formular öffnen, danach beliebig viele Abgaben mit
 * demselben Stempel. Mit der Bindung braucht jede Schule ihren eigenen - und
 * den bekommt man nur, indem man ihr Formular auch aufruft.
 */
function signiere(ausgestellt: number, schulSlug: string): string {
  return createHmac("sha256", schluessel())
    .update(`formular:${schulSlug}:${ausgestellt}`)
    .digest("base64url");
}

export function erzeugeStempel(schulSlug: string, jetzt = new Date()): Stempel {
  const ausgestellt = Math.floor(jetzt.getTime() / 1000);
  return { ausgestellt, signatur: signiere(ausgestellt, schulSlug) };
}

/** Für die Übergabe im Formular: ein Feld statt zwei. */
export function stempelText(s: Stempel): string {
  return `${s.ausgestellt}.${s.signatur}`;
}

export type Stempelpruefung =
  | { readonly ok: true; readonly dauerSekunden: number }
  | { readonly ok: false; readonly grund: "ungueltig" | "abgelaufen" | "aus_der_zukunft" };

/**
 * Prüft einen vorgelegten Stempel und gibt die vergangene Zeit zurück.
 *
 * `aus_der_zukunft` ist kein Schikanefall: Nach einer Zeitumstellung auf dem
 * Server oder bei mehreren Servern mit auseinanderlaufenden Uhren kommt ein
 * Stempel an, der jünger ist als die Gegenwart. Eine negative Dauer als „sehr
 * schnell“ zu werten hieße, alle Abgaben dieser Minute zu verdächtigen.
 */
export function pruefeStempel(text: string, schulSlug: string, jetzt = new Date()): Stempelpruefung {
  const trenner = text.lastIndexOf(".");
  if (trenner <= 0) return { ok: false, grund: "ungueltig" };

  const ausgestellt = Number(text.slice(0, trenner));
  const signatur = text.slice(trenner + 1);
  if (!Number.isSafeInteger(ausgestellt) || signatur === "") return { ok: false, grund: "ungueltig" };

  const erwartet = Buffer.from(signiere(ausgestellt, schulSlug));
  const gegeben = Buffer.from(signatur);
  if (erwartet.length !== gegeben.length || !timingSafeEqual(erwartet, gegeben)) {
    return { ok: false, grund: "ungueltig" };
  }

  const dauerSekunden = Math.floor(jetzt.getTime() / 1000) - ausgestellt;
  if (dauerSekunden < 0) return { ok: false, grund: "aus_der_zukunft" };
  if (dauerSekunden > STEMPEL_STUNDEN * 3600) return { ok: false, grund: "abgelaufen" };

  return { ok: true, dauerSekunden };
}

export const STEMPEL_HINWEIS: Readonly<Record<"ungueltig" | "abgelaufen" | "aus_der_zukunft", string>> = {
  ungueltig: "Bitte lade die Seite neu und schick die Bewertung noch einmal ab.",
  // „Deine Antworten bleiben erhalten" stand hier und traf nicht zu: Das
  // Formular hält seinen Stand allein im Arbeitsspeicher der Seite, und ein
  // Neuladen verwirft ihn - alle 61 Fragen. Wer dem Satz folgte, verlor alles.
  abgelaufen: `Das Formular stand länger als ${STEMPEL_STUNDEN} Stunden offen und lässt sich so nicht mehr absenden. Schreib dir bitte auf, was du geändert hast, lade die Seite neu und gib die Bewertung erneut ab.`,
  aus_der_zukunft: "Bitte lade die Seite neu und schick die Bewertung noch einmal ab.",
};
