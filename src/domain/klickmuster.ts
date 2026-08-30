/**
 * Auswertung des Klickverhaltens im Bewertungsformular.
 *
 * Gemessen wird jeder Klick auf eine Antwort, auf die Millisekunde genau. Aus
 * den Abständen zwischen den Klicks entstehen zwei Signale, die sich in ihrer
 * Aussage unterscheiden:
 *
 *  - **Zu schnell** - der mittlere Abstand liegt unter dem, was Lesen und
 *    Entscheiden braucht. Findet das unbedachte Durchklicken.
 *  - **Zu gleichmäßig** - die Abstände streuen kaum. Das ist der eigentlich
 *    verräterische Befund: Ein Mensch braucht für die eine Frage zwei Sekunden
 *    und für die nächste zehn; ein Skript klickt alle 300 Millisekunden. Sogar
 *    ein *langsames* Skript fällt darüber auf, ein schnelles Lesen dagegen nicht.
 *
 * **Gespeichert wird die vollständige Klickfolge** (Entscheidung vom 27.08.2026,
 * „maximale Auswertbarkeit“). Der Grund ist die Kalibrierung: Ob 400 ms und 15 %
 * die richtigen Schwellen sind, weiß vor dem Betrieb niemand, und ein Detektor
 * lässt sich nicht an Kennzahlen verbessern, die man schon zusammengefasst hat.
 * Auch der Vergleich ganzer Verläufe untereinander - dieselbe Handschrift über
 * viele Abgaben - geht nur mit der Folge.
 *
 * Was das bedeutet, steht ausdrücklich hier, damit es niemand übersieht: Die
 * Fragen erscheinen in fester Reihenfolge, also lässt sich aus dem n-ten Abstand
 * ablesen, wie lange jemand vor der n-ten Frage gezögert hat - auch vor den
 * Fragen zu Mobbing und Gewalt. Die Folge ist damit eine personenbezogene
 * Verhaltensspur und **kein bloßes Messrauschen**. Sie gehört in die
 * Datenschutzerklärung (Abschnitt 3.2), unterliegt einer eigenen
 * Aufbewahrungsregel (`domain/aufbewahrung.ts`, `klickfolgen_loeschen`) und
 * steht auf der Liste für die Kanzlei.
 *
 * Die Abstände kommen aus dem Browser und sind damit nicht fälschungssicher.
 * Deshalb werden sie gegen die vom Server gemessene Gesamtdauer geprüft
 * (`plausibel`): Wer behauptet, acht Minuten geklickt zu haben, während der
 * signierte Stempel zwanzig Sekunden sagt, wird nicht geglaubt. Gespeichert wird
 * die Folge trotzdem - gerade eine erfundene Reihe ist ein Befund.
 */

import { VORGABEN, zahl, type Einstellungen } from "./einstellungen";
import type { Signal } from "./betrugspruefung";

/** Mehr Abstände nimmt niemand entgegen - 61 Fragen ergeben höchstens 60. */
export const MAX_ABSTAENDE = 200;

export interface Klickauswertung {
  readonly anzahl: number;
  /** Mittlerer Abstand zwischen zwei Antworten, in Millisekunden. */
  readonly medianMs: number;
  /**
   * Streuung der Abstände, als Anteil vom Mittelwert (Variationskoeffizient).
   * 0 heißt: exakt gleiche Abstände. Menschen liegen erfahrungsgemäß über 0,5.
   */
  readonly streuung: number;
}

/**
 * Die Folge, wie sie gespeichert wird: nur das, was eine Zahlenreihe ist.
 *
 * Anders als bei der Auswertung wird hier **nicht gekappt**. Die 60-Sekunden-
 * Grenze ist eine Rechenhilfe gegen Ausreißer; für die spätere Analyse ist
 * gerade die lange Pause eine Information.
 */
export function bereinige(abstaendeMs: readonly number[]): number[] {
  return abstaendeMs.filter((a) => Number.isFinite(a) && a >= 0).slice(0, MAX_ABSTAENDE);
}

function median(werte: readonly number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 0
    ? ((sortiert[mitte - 1] ?? 0) + (sortiert[mitte] ?? 0)) / 2
    : (sortiert[mitte] ?? 0);
}

/**
 * Fasst die Abstände zu drei Kennzahlen zusammen.
 *
 * Ausreißer nach oben fliegen vorher heraus: Wer zwischendurch zehn Minuten
 * Pause macht - Türklingel, Bus, Unterrichtsende -, soll dadurch nicht als
 * besonders unregelmäßig gelten. Gekappt wird bei einer Minute; alles darüber
 * ist keine Antwortzeit mehr, sondern eine Unterbrechung.
 */
export function auswerteKlicks(abstaendeMs: readonly number[]): Klickauswertung | null {
  const brauchbar = abstaendeMs
    .filter((a) => Number.isFinite(a) && a >= 0)
    .slice(0, MAX_ABSTAENDE)
    .map((a) => Math.min(a, 60_000));

  if (brauchbar.length < 2) return null;

  const mittel = brauchbar.reduce((s, a) => s + a, 0) / brauchbar.length;
  const varianz = brauchbar.reduce((s, a) => s + (a - mittel) ** 2, 0) / brauchbar.length;

  return {
    anzahl: brauchbar.length,
    medianMs: median(brauchbar),
    // Bei einem Mittelwert von 0 - alle Klicks im selben Millisekundenfenster -
    // ist die Streuung definitionsgemäß 0 und der Fall ohnehin auffällig.
    streuung: mittel === 0 ? 0 : Math.sqrt(varianz) / mittel,
  };
}

/**
 * Passen die gemeldeten Abstände zur Zeit, die der Server gemessen hat?
 *
 * Die Summe der Abstände kann nicht größer sein als die Zeit, in der das
 * Formular offenstand. Ein bisschen Luft nach oben, weil beide Uhren nicht
 * dieselbe sind; was deutlich darüber liegt, ist erfunden.
 */
export function plausibel(abstaendeMs: readonly number[], dauerSekunden: number | null): boolean {
  if (dauerSekunden === null) return true;
  const summe = abstaendeMs.reduce((s, a) => s + Math.max(0, a), 0);
  return summe <= (dauerSekunden + 5) * 1000;
}

export function pruefeKlickmuster(
  abstaendeMs: readonly number[] | null | undefined,
  dauerSekunden: number | null | undefined,
  e: Einstellungen = VORGABEN,
): { readonly signale: Signal[]; readonly auswertung: Klickauswertung | null } {
  if (!abstaendeMs || abstaendeMs.length === 0) return { signale: [], auswertung: null };

  // Eine erfundene Reihe ist ein Befund, kein fehlender Befund. Vorher stand
  // hier ein leeres Ergebnis - damit schaltete ein einziger überhöhter Wert am
  // Ende der Folge beide Klicksignale ab, und ein gleichmäßig klickendes Skript
  // kam durch, indem es die Reihe unplausibel machte.
  if (!plausibel(abstaendeMs, dauerSekunden ?? null)) {
    return {
      signale: [
        {
          art: "klickfolge_unplausibel",
          gewicht: 3,
          erlaeuterung: "Die gemeldeten Klickabstände passen nicht zur gemessenen Dauer",
        },
      ],
      auswertung: null,
    };
  }

  const auswertung = auswerteKlicks(abstaendeMs);
  if (auswertung === null) return { signale: [], auswertung: null };
  if (auswertung.anzahl < zahl(e, "klick_mindestzahl")) return { signale: [], auswertung };

  const signale: Signal[] = [];

  if (auswertung.medianMs < zahl(e, "klick_mindestabstand_ms")) {
    signale.push({
      art: "zu_schnell_geklickt",
      gewicht: gewicht(e, "klick_tempo_gewicht"),
      erlaeuterung: `${auswertung.anzahl} Klicks, im Mittel ${Math.round(auswertung.medianMs)} ms auseinander`,
    });
  }

  if (auswertung.streuung * 100 < zahl(e, "klick_gleichmass_prozent")) {
    signale.push({
      art: "gleichmaessige_klicks",
      gewicht: gewicht(e, "klick_gleichmass_gewicht"),
      erlaeuterung:
        `Abstände streuen nur um ${Math.round(auswertung.streuung * 100)} % - ` +
        "so gleichmäßig klickt kein Mensch",
    });
  }

  return { signale, auswertung };
}

function gewicht(e: Einstellungen, schluessel: string): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, Math.round(zahl(e, schluessel)))) as 1 | 2 | 3;
}
