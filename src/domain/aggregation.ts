/**
 * Aggregation der Bewertungen einer Schule.
 *
 * **Eine Frage, die keine Spezifikation beantwortet:** Wie entsteht der
 * Gesamtscore einer Schule aus mehreren Bewertungen?
 *
 * Zwei Wege sind denkbar:
 *
 *  a) Je Bewertung den Gesamtscore rechnen, dann diese mitteln.
 *  b) Je Kategorie über alle Bewertungen mitteln, dann die Gewichtung
 *     einmal auf die Kategoriemittel anwenden.
 *
 * Sie liefern **unterschiedliche Ergebnisse**, sobald nicht alle Bewertungen
 * dieselben optionalen Kategorien beantworten - und das ist der Regelfall, weil
 * D, E und F freiwillig sind. Weg (a) mittelt dann Zahlen, die unter
 * verschiedenen Gewichtungen entstanden sind: eine Bewertung nur zu A–C zählt
 * Kategorie A mit 3/7, eine vollständige mit 3/11. Dieselbe Antwort wiegt je
 * nach Nachbarschaft anders schwer.
 *
 * Umgesetzt ist **Weg (b)**: jede Kategorie wird über alle Personen gemittelt,
 * die sie beurteilt haben, und die Gewichtung greift genau einmal. Damit zählt
 * jede Antwort in ihrer Kategorie gleich viel, unabhängig davon, was die
 * bewertende Person sonst noch ausgefüllt hat.
 */

import { KATEGORIEN, type KategorieId } from "./fragebogen";
import {
  ampelstufe,
  aufZehnerskala,
  erreichteObergrenze,
  scorestufe,
  type Ampelstufe,
  type Bewertungsergebnis,
  type Scorestufe,
} from "./scoring";

/** Mindestzahlen, entschieden am 26.08.2026. */
export const MINDESTZAHL_PROFIL = 10;

/**
 * Ab wie vielen Beurteilenden ein **freiwilliger** Bereich ausgewiesen wird.
 *
 * Die Pflichtbereiche brauchen die Zahl nicht: Sie sind vollständig zu
 * beantworten, ihre Zahl ist die der Bewertungen, und die steht schon unter
 * `MINDESTZAHL_PROFIL`.
 *
 * Bei den freiwilligen war sie es, die fehlte. Ein Balken „Umwelt &
 * Nachhaltigkeit 8,3" konnte der Schnitt **einer einzigen** Person über zehn
 * Fragen sein - veröffentlicht, mit einer Nachkommastelle, neben Balken aus
 * dreissig Bewertungen. Die Deckelung nach Abdeckung nahm ihm zwar den Hebel
 * auf die Gesamtwertung, nicht aber die Aussage über die eine Person.
 *
 * Dieselbe Fünf wie bei der einzelnen Frage, und aus demselben Grund.
 */
export const MINDESTZAHL_KATEGORIE = 5;
export const MINDESTZAHL_RANGLISTE = 20;
export const MINDESTZAHL_ZUSAMMENFASSUNG = 10;

export interface EinzelneBewertung {
  readonly ergebnis: Bewertungsergebnis;
  readonly rolle: string;
  readonly hatFreitext: boolean;
  readonly erstelltAm: Date;
}

export interface Schulaggregat {
  /**
   * Öffentlicher Anzeigewert 0–10 - **null**, solange die Mindestzahl nicht
   * erreicht ist. Bewusst so herum: wer dieses Feld rendert, kann eine Schule
   * nicht versehentlich mit einer Zahl versehen, die auf drei Stimmen beruht.
   */
  readonly gesamtscore: number | null;
  /**
   * Derselbe Wert ohne Sichtbarkeitsschranke, für Moderation und Auswertung.
   * Gehört nie in eine öffentliche Antwort.
   */
  readonly gesamtscoreIntern: number | null;
  /**
   * Derselbe Wert **ohne** Deckelung.
   *
   * Nur für die Sortierung: Sobald mehrere Schulen die Obergrenze erreichen,
   * entschiede sonst die Zahl der Bewertungen über den ersten Platz und nicht
   * die Qualität. Angezeigt wird er nirgends.
   */
  readonly gesamtscoreRoh: number | null;
  readonly stufe: Scorestufe | null;
  readonly kategorien: Readonly<Partial<Record<KategorieId, number>>>;
  readonly aggressionsindex: number | null;
  readonly aggressionsstufe: Ampelstufe | null;
  readonly anzahl: number;
  readonly anzahlJeRolle: Readonly<Record<string, number>>;
  readonly anzahlMitFreitext: number;
  readonly letzteBewertungAm: Date | null;
  /** Erreicht die Schule die Schwelle für die öffentliche Anzeige? */
  readonly sichtbar: boolean;
  readonly ranglistenfaehig: boolean;
  readonly zusammenfassungMoeglich: boolean;
}

function mittel(werte: readonly number[]): number | null {
  return werte.length === 0 ? null : werte.reduce((a, b) => a + b, 0) / werte.length;
}

export function aggregiere(bewertungen: readonly EinzelneBewertung[]): Schulaggregat {
  const anzahl = bewertungen.length;

  const anzahlJeRolle: Record<string, number> = {};
  let anzahlMitFreitext = 0;
  let letzteBewertungAm: Date | null = null;
  for (const b of bewertungen) {
    anzahlJeRolle[b.rolle] = (anzahlJeRolle[b.rolle] ?? 0) + 1;
    if (b.hatFreitext) anzahlMitFreitext++;
    if (letzteBewertungAm === null || b.erstelltAm > letzteBewertungAm) {
      letzteBewertungAm = b.erstelltAm;
    }
  }

  // Kategorie für Kategorie über alle Personen mitteln, die sie beurteilt haben.
  const kategorien: Partial<Record<KategorieId, number>> = {};
  let summe = 0;
  let gewichtssumme = 0;
  for (const kategorie of KATEGORIEN) {
    const werte = bewertungen
      .map((b) => b.ergebnis.kategorien.find((k) => k.kategorie === kategorie.id)?.score)
      .filter((w): w is number => w != null);
    const durchschnitt = mittel(werte);
    if (durchschnitt === null) continue;
    // Ein freiwilliger Bereich braucht seine eigene Untergrenze - sonst steht
    // dort die Auskunft einer einzelnen Person. Fällt er heraus, fällt er
    // ganz heraus: auch aus der Gewichtssumme, sonst hinge die Gesamtwertung
    // an einem Wert, den die Seite nicht zeigt.
    if (!kategorie.pflicht && werte.length < MINDESTZAHL_KATEGORIE) continue;

    kategorien[kategorie.id] = durchschnitt;
    summe += durchschnitt * kategorie.gewichtung;
    gewichtssumme += kategorie.gewichtung;
  }

  // **Ohne alle drei Pflichtbereiche gibt es keinen Gesamtwert.** Für die
  // einzelne Bewertung erzwingt `bewerte()` das mit einer Ausnahme; auf
  // Schulebene fehlte die Prüfung, und die vorhandenen Bereiche wurden einfach
  // unter sich neu gewichtet. Eine Schule, zu der nur die Sicherheit beurteilt
  // wurde, stand dann mit einem vollwertigen Score in der Rangliste.
  const pflichtVollstaendig = KATEGORIEN.filter((k) => k.pflicht).every(
    (k) => kategorien[k.id] !== undefined,
  );

  const roh = gewichtssumme === 0 || !pflichtVollstaendig ? null : summe / gewichtssumme;

  /**
   * Derselbe Maßstab wie bei der einzelnen Bewertung, hier auf Schulebene -
   * **gewichtet mit der Abdeckung.**
   *
   * Das ist der Unterschied zur einzelnen Bewertung, und er ist teuer erkauft:
   * Ein freiwilliger Bereich galt schon als vorhanden, wenn ein einziger
   * Mensch eine einzige Frage daraus beantwortet hatte. Zwanzig Bewertungen
   * nur zu A, B und C standen bei 8,5; eine einundzwanzigste, die zusätzlich
   * je eine Frage in D, E und F ankreuzte, hob die ganze Schule auf 10,0. Mit
   * drei Klicks.
   *
   * Jetzt zählt der Anteil derer, die den Bereich beurteilt haben: Sagt die
   * Hälfte etwas zu D, bringt D die Hälfte seines möglichen Zuschlags. Bei
   * einer von zwanzig ist es ein Zwanzigstel - sichtbar, aber ohne Hebel.
   */
  const freiwilligeWerte = KATEGORIEN.filter((k) => !k.pflicht)
    .map((k) => {
      const wert = kategorien[k.id];
      if (wert === undefined) return null;
      const beurteilt = bewertungen.filter((b) =>
        b.ergebnis.kategorien.some((e) => e.kategorie === k.id && e.score !== null),
      ).length;
      return { wert, anteil: anzahl === 0 ? 0 : beurteilt / anzahl };
    })
    .filter((e): e is { wert: number; anteil: number } => e !== null);

  const gesamtscore =
    roh === null
      ? null
      : Math.min(aufZehnerskala(roh), erreichteObergrenze(freiwilligeWerte));

  const aggressionswerte = bewertungen
    .map((b) => b.ergebnis.aggression?.index)
    .filter((w): w is number => w != null);
  const aggressionsindex = mittel(aggressionswerte);

  const sichtbar = anzahl >= MINDESTZAHL_PROFIL;

  return {
    // Unterhalb der Mindestzahl wird kein Score veröffentlicht - die Zahl
    // existiert intern, taugt aber nicht als Aussage über eine Schule.
    gesamtscore: sichtbar ? gesamtscore : null,
    gesamtscoreIntern: gesamtscore,
    gesamtscoreRoh: roh === null ? null : aufZehnerskala(roh),
    stufe: sichtbar && gesamtscore !== null ? scorestufe(gesamtscore) : null,
    kategorien,
    aggressionsindex,
    aggressionsstufe: aggressionsindex === null ? null : ampelstufe(aggressionsindex),
    anzahl,
    anzahlJeRolle,
    anzahlMitFreitext,
    letzteBewertungAm,
    sichtbar,
    ranglistenfaehig: anzahl >= MINDESTZAHL_RANGLISTE,
    zusammenfassungMoeglich: anzahlMitFreitext >= MINDESTZAHL_ZUSAMMENFASSUNG,
  };
}

export type Trendrichtung = "verbessert" | "verschlechtert" | "stabil" | "unbekannt";

export interface Trend {
  readonly richtung: Trendrichtung;
  /** Veränderung in Punkten der Anzeigeskala 0–10. */
  readonly veraenderung: number | null;
}

/** Ab welcher Veränderung von „stabil“ abgewichen wird. */
export const TRENDSCHWELLE = 0.3;

/**
 * Vergleicht die letzten sechs Monate mit den sechs Monaten davor.
 *
 * Beide Zeitfenster müssen die Mindestzahl erreichen. Sonst entstünde aus zwei
 * Bewertungen im Vorjahr und zwanzig im laufenden Jahr ein „Trend“, der nur die
 * gewachsene Beteiligung abbildet.
 */
export function berechneTrend(
  aktuell: readonly EinzelneBewertung[],
  davor: readonly EinzelneBewertung[],
  mindestzahl = MINDESTZAHL_PROFIL,
): Trend {
  return trendAusScores(
    { score: aggregiere(aktuell).gesamtscore, anzahl: aktuell.length },
    { score: aggregiere(davor).gesamtscore, anzahl: davor.length },
    mindestzahl,
  );
}

export interface Zeitfenster {
  readonly score: number | null;
  readonly anzahl: number;
}

/**
 * Derselbe Vergleich aus zwei fertigen Werten.
 *
 * Gebraucht für die Ranglisten: dort stehen die beiden Stände vorberechnet in
 * `schul_aggregate`, und die einzelnen Bewertungen dafür noch einmal zu laden
 * hieße, für eine Liste mit fünfzig Zeilen tausende Datensätze zu holen.
 */
export function trendAusScores(jetzt: Zeitfenster, davor: Zeitfenster, mindestzahl = MINDESTZAHL_PROFIL): Trend {
  if (jetzt.anzahl < mindestzahl || davor.anzahl < mindestzahl) {
    return { richtung: "unbekannt", veraenderung: null };
  }
  if (jetzt.score === null || davor.score === null) return { richtung: "unbekannt", veraenderung: null };

  const veraenderung = jetzt.score - davor.score;
  if (Math.abs(veraenderung) < TRENDSCHWELLE) return { richtung: "stabil", veraenderung };
  return { richtung: veraenderung > 0 ? "verbessert" : "verschlechtert", veraenderung };
}

export const TREND_LABEL: Readonly<Record<Trendrichtung, string>> = {
  verbessert: "verbessert",
  verschlechtert: "verschlechtert",
  stabil: "stabil",
  unbekannt: "kein Vergleich möglich",
};
