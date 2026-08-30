/**
 * Die drei Ziehungen, ihre Gewinne und wer an welcher teilnimmt.
 *
 * Eigene Datei ohne Node-Abhängigkeit: Diese Angaben stehen auf der
 * öffentlichen Seite, im Formular, im Teilen-Bereich und im Panel - also auch
 * in Bausteinen, die im Browser laufen. `domain/verlosung.ts` selbst braucht
 * `node:crypto` für die Ziehung und lässt sich dort nicht laden.
 */

export type Verlosungsart = "normal" | "super" | "mega";

export const VERLOSUNGSARTEN: readonly Verlosungsart[] = ["normal", "super", "mega"];

export interface Verlosungsgewinn {
  readonly anzahl: number;
  readonly wertEuro: number;
  /**
   * So viele geworbene Personen mit veröffentlichter Bewertung im selben Monat
   * sind nötig. 0 heißt: Bewerten genügt.
   */
  readonly mindestEmpfehlungen: number;
}

export const GEWINNE: Readonly<Record<Verlosungsart, Verlosungsgewinn>> = {
  normal: { anzahl: 50, wertEuro: 50, mindestEmpfehlungen: 0 },
  super: { anzahl: 25, wertEuro: 100, mindestEmpfehlungen: 1 },
  mega: { anzahl: 1, wertEuro: 1000, mindestEmpfehlungen: 100 },
};

export const VERLOSUNG_LABEL: Readonly<Record<Verlosungsart, string>> = {
  normal: "Monatliche Verlosung",
  super: "Superverlosung",
  mega: "Mega-Verlosung",
};

export const PARTNER = "Wunschgutschein.de";

export function istVerlosungsart(wert: string): wert is Verlosungsart {
  return (VERLOSUNGSARTEN as readonly string[]).includes(wert);
}

/**
 * An welchen Ziehungen ein Konto in diesem Monat teilnimmt.
 *
 * `empfehlungen` sind die geworbenen Personen mit **veröffentlichter**
 * Bewertung im selben Monat. `hatSchonGewonnen` bezieht sich nur auf die
 * normale Ziehung: Wer dort einmal gewonnen hat, ist dort heraus, bleibt aber
 * bei Super- und Mega-Verlosung dabei - die belohnen das Weitersagen, und das
 * lässt sich nicht dadurch entwerten, dass man einmal Glück hatte.
 */
export function teilnahmeAn(
  empfehlungen: number,
  hatSchonGewonnen: boolean,
): Verlosungsart[] {
  return VERLOSUNGSARTEN.filter((art) => {
    if (art === "normal") return !hatSchonGewonnen;
    return empfehlungen >= GEWINNE[art].mindestEmpfehlungen;
  });
}
