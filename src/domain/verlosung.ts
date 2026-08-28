/**
 * Monatliche Verlosung (Entscheidung E9).
 *
 * Die Regel, auf die es ankommt: **ein Los je Konto, nicht je Bewertung.**
 *
 * Das ist keine Kleinigkeit. Ein Los je Bewertung würde genau das belohnen,
 * wogegen der ganze Rest des Portals arbeitet: möglichst viele Abgaben in
 * kurzer Zeit. Wer zehn Schulen bewertet, hätte zehnfache Gewinnchance - und
 * die Betrugserkennung müsste gegen einen Anreiz anlaufen, den wir selbst
 * gesetzt haben. Mit einem Los je Konto ist die zweite Bewertung für die
 * Verlosung wertlos, und es bleibt nur der Grund, aus dem jemand sie schreiben
 * sollte.
 *
 * Die Ziehung ist nachrechenbar: aus dem gespeicherten Zufallswert und der
 * Losliste ergibt sich derselbe Gewinner. Bei einer Verlosung, an der
 * Minderjährige teilnehmen, ist „vertrau uns“ keine ausreichende Auskunft.
 */

import { createHmac, randomBytes } from "node:crypto";

export interface Zeitraum {
  /** einschließlich */
  readonly von: Date;
  /** ausschließlich */
  readonly bis: Date;
}

/**
 * Der Kalendermonat als Zeitraum, in UTC.
 *
 * UTC und nicht deutsche Ortszeit: sonst verschiebt die Sommerzeit die Grenze
 * um eine Stunde, und eine Bewertung vom 1. August 00:30 Uhr fiele je nach
 * Jahreszeit in den Juli oder in den August.
 */
export function monatszeitraum(jahr: number, monat: number): Zeitraum {
  return {
    von: new Date(Date.UTC(jahr, monat - 1, 1)),
    bis: new Date(Date.UTC(monat === 12 ? jahr + 1 : jahr, monat === 12 ? 0 : monat, 1)),
  };
}

/** Der Monat vor dem angegebenen Zeitpunkt - der Zeitraum, der zu ziehen ist. */
export function letzterMonat(jetzt = new Date()): { jahr: number; monat: number } {
  const jahr = jetzt.getUTCFullYear();
  const monat = jetzt.getUTCMonth() + 1;
  return monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function monatsname(jahr: number, monat: number): string {
  return `${MONATE[monat - 1]} ${jahr}`;
}

/** Rollen, die teilnehmen dürfen (Entscheidung E9). */
export const TEILNAHMEBERECHTIGT: readonly string[] = ["schueler_unter_16", "schueler_ab_16"];

export interface Teilnahme {
  readonly kontoId: string;
  readonly bewertungId: string;
  readonly rolle: string;
}

export interface Los {
  readonly kontoId: string;
  /** Alle Bewertungen dieses Kontos im Zeitraum - für die Nachvollziehbarkeit. */
  readonly bewertungIds: readonly string[];
}

/**
 * Fasst Teilnahmen zu Losen zusammen: eines je Konto.
 *
 * Sortiert nach Konto-Kennung, damit die Liste bei gleicher Datengrundlage
 * immer dieselbe ist - sonst ließe sich die Ziehung nicht nachrechnen.
 */
export function baueLose(teilnahmen: readonly Teilnahme[]): Los[] {
  const nachKonto = new Map<string, string[]>();
  for (const t of teilnahmen) {
    if (!TEILNAHMEBERECHTIGT.includes(t.rolle)) continue;
    const bisher = nachKonto.get(t.kontoId) ?? [];
    bisher.push(t.bewertungId);
    nachKonto.set(t.kontoId, bisher);
  }

  return [...nachKonto.entries()]
    .map(([kontoId, ids]) => ({ kontoId, bewertungIds: [...ids].sort() }))
    .sort((a, b) => (a.kontoId < b.kontoId ? -1 : a.kontoId > b.kontoId ? 1 : 0));
}

/** 32 Byte Zufall, hexadezimal. Wird mit der Ziehung gespeichert. */
export function erzeugeZufallswert(): string {
  return randomBytes(32).toString("hex");
}

export interface Ziehungsergebnis {
  readonly gewinner: Los;
  readonly index: number;
  readonly loseGesamt: number;
}

/**
 * Zieht den Gewinner.
 *
 * Der Index entsteht aus dem Zufallswert und der Zahl der Lose - mit derselben
 * Losliste und demselben Zufallswert kommt jeder auf dasselbe Ergebnis.
 *
 * Zur Verzerrung durch den Rest der Division: bei 256 Bit Zufall und einer
 * Loszahl weit unter einer Milliarde liegt sie in der Größenordnung von
 * 2⁻²²⁰ - sie ist nicht messbar, nicht ausnutzbar und würde durch ein
 * Verwerfen-und-neu-Ziehen nur die Nachrechenbarkeit verkomplizieren.
 */
export function ziehe(lose: readonly Los[], zufallswert: string): Ziehungsergebnis | null {
  if (lose.length === 0) return null;

  const abdruck = createHmac("sha256", Buffer.from(zufallswert, "hex")).update("ziehung").digest("hex");
  const index = Number(BigInt(`0x${abdruck}`) % BigInt(lose.length));

  return { gewinner: lose[index]!, index, loseGesamt: lose.length };
}

/**
 * Prüft eine gespeicherte Ziehung nach.
 *
 * Damit lässt sich später belegen, dass der eingetragene Gewinner der ist, der
 * sich aus Zufallswert und Losliste ergibt - die Grundlage jeder Beschwerde und
 * jeder Prüfung durch Dritte.
 */
export function pruefeZiehung(
  lose: readonly Los[],
  zufallswert: string,
  gewinnerKontoId: string,
): boolean {
  const ergebnis = ziehe(lose, zufallswert);
  return ergebnis !== null && ergebnis.gewinner.kontoId === gewinnerKontoId;
}

/**
 * Was auf der öffentlichen Seite steht.
 *
 * Ohne jede Angabe zur gewinnenden Person: bei einem Teilnehmerkreis, der
 * überwiegend minderjährig ist, wäre selbst eine verkürzte Telefonnummer zu
 * viel. Nachprüfbar bleibt die Ziehung trotzdem - über den Zufallswert.
 */
export function ziehungsmeldung(
  monat: string,
  loseGesamt: number,
  gezogen: boolean,
  benachrichtigt = false,
): string {
  if (!gezogen) {
    return `Für ${monat} lagen keine Teilnahmen vor. Es wurde nicht gezogen.`;
  }
  const teilnahme = `Für ${monat} ${loseGesamt === 1 ? "hat" : "haben"} ${loseGesamt.toLocaleString("de-DE")} ${
    loseGesamt === 1 ? "Konto" : "Konten"
  } teilgenommen.`;
  // Der Unterschied zwischen „ist benachrichtigt“ und „wird benachrichtigt“ ist
  // für die wartende Person der ganze Inhalt dieser Zeile.
  return benachrichtigt
    ? `${teilnahme} Die gewinnende Person wurde benachrichtigt.`
    : `${teilnahme} Die gewinnende Person wird benachrichtigt.`;
}
