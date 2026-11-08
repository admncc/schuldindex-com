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
  mega: { anzahl: 1, wertEuro: 1000, mindestEmpfehlungen: 15 },
};

/**
 * Die Namen der drei Ziehungen.
 *
 * Die normale hiess „Monatliche Verlosung" und heisst jetzt schlicht
 * „Verlosung": Alle drei sind monatlich, das Wort trennte also nichts und
 * stand ueberall doppelt - „Monatliche Verlosung · August 2026".
 *
 * Aus „Super-Verlosung" und „Mega-Verlosung" wurden **Boost** und **Jackpot**.
 * „Super" und „Mega" sind die Steigerungsformen aus einem Werbeprospekt von
 * 1995; vor einem Publikum, das zu neun Zehnteln zwischen 13 und 18 ist, liest
 * sich das wie ein Erwachsener, der jugendlich klingen will. „Boost" sagt
 * ausserdem, was die Ziehung belohnt - du hast deine Chance selbst
 * hochgezogen -, und „Jackpot" braucht keine Erklaerung.
 *
 * **Nur die Anzeige aendert sich.** Die Kennungen in der Datenbank bleiben
 * `normal`, `super` und `mega`: Ein Name ist eine Entscheidung, die sich in
 * zwei Jahren wieder aendern kann, und keine, fuer die man gespeicherte
 * Ziehungen umschreibt. Deshalb steht der Name an genau einer Stelle, und
 * jeder Text, der ihn braucht, holt ihn hier ab.
 */
export const VERLOSUNG_LABEL: Readonly<Record<Verlosungsart, string>> = {
  normal: "Verlosung",
  super: "Boost",
  mega: "Jackpot",
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
 * bei Boost und Jackpot dabei - die belohnen das Weitersagen, und das lässt
 * sich nicht dadurch entwerten, dass man einmal Glück hatte.
 *
 * **Jeder Monat zählt für sich.** Die Schwelle gilt nicht einmal und dann für
 * immer, sondern in jedem Monat neu - wer im März drei Leute geworben hat und
 * im April keinen, ist im April nicht dabei, und umgekehrt genauso. Das ist
 * keine Härte, sondern die einzige Lesart, in der „jeden Monat" stimmt.
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
