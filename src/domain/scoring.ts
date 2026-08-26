/**
 * Scoring-Engine.
 *
 * Quelle: Safety Scoring & Public Display Specification, umgesetzt mit den
 * Entscheidungen aus docs/dev-plan.md: E8 (lückenlose Ampelgrenzen), E16
 * (Kategorie F) und den Festlegungen vom 26.08.2026: Anzeige auf einer Skala
 * von 0 bis 10, Farbgrenzen an den Antwortstufen des Fragebogens.
 *
 * Leitsatz aus Entscheidung E18: Zahlen entstehen hier — deterministisch,
 * getestet und Zeile für Zeile herleitbar. Kein Modellaufruf berührt diese Datei.
 */

import {
  AGGRESSIONSFRAGEN,
  FRAGE_NACH_ID,
  KATEGORIEN,
  KEINE_ANGABE,
  fragenDerKategorie,
  type Antwort,
  type Frage,
  type KategorieId,
} from "./fragebogen";

/** Antworten einer einzelnen Bewertung, Schlüssel ist die Frage-ID. */
export type Antworten = Readonly<Record<string, Antwort>>;

export interface KategorieErgebnis {
  readonly kategorie: KategorieId;
  /**
   * Interner Mittelwert auf der Antwortskala 1–5, oder null wenn die Kategorie
   * unbeantwortet blieb. Für die Anzeige `anzeige` verwenden, nicht diesen Wert.
   */
  readonly score: number | null;
  /** Derselbe Wert auf der Anzeigeskala 0–10. */
  readonly anzeige: number | null;
  readonly gewichtung: number;
  /** Zahl der Fragen, die in den Mittelwert eingegangen sind. */
  readonly beantwortet: number;
}

/** Farbstufe des Gesamtscores. Nicht zu verwechseln mit der Aggressionsampel. */
export type Scorestufe = "gut" | "mittel" | "schlecht";

export type Ampelstufe = "gering" | "mittel" | "hoch";

export interface Aggressionsergebnis {
  /** Mittelwert der ROHEN Häufigkeitswerte (1–5), nicht invertiert. */
  readonly index: number;
  readonly stufe: Ampelstufe;
}

export interface Bewertungsergebnis {
  /** Gewichteter Gesamtscore auf der Anzeigeskala 0–10. */
  readonly gesamtscore: number;
  /** Farbstufe des Gesamtscores für die öffentliche Anzeige. */
  readonly stufe: Scorestufe;
  readonly kategorien: readonly KategorieErgebnis[];
  /** null, wenn beide Aggressionsfragen unbeantwortet blieben. */
  readonly aggression: Aggressionsergebnis | null;
}

export class UnvollstaendigeBewertung extends Error {
  constructor(public readonly fehlendeKategorien: readonly KategorieId[]) {
    super(
      `Pflichtkategorien ohne Antwort: ${fehlendeKategorien.join(", ")}. ` +
        "Eine Bewertung ohne die Kategorien A, B und C kann nicht gewertet werden.",
    );
    this.name = "UnvollstaendigeBewertung";
  }
}

/**
 * Wert, mit dem eine Frage in den Score eingeht.
 * Invertierte Fragen (Häufigkeit unerwünschter Vorfälle): 6 − Rohwert.
 */
export function punktwert(frage: Frage, antwort: Antwort): number | null {
  if (antwort === KEINE_ANGABE) return null;
  return frage.wertung === "invertiert" ? 6 - antwort : antwort;
}

function mittelwert(werte: readonly number[]): number | null {
  if (werte.length === 0) return null;
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

function punktwerteFuer(fragen: readonly Frage[], antworten: Antworten): number[] {
  const werte: number[] = [];
  for (const frage of fragen) {
    const antwort = antworten[frage.id];
    if (antwort === undefined) continue;
    const wert = punktwert(frage, antwort);
    if (wert !== null) werte.push(wert);
  }
  return werte;
}

/**
 * Kategorie A ist zweigeteilt (Safety Scoring Spec):
 *   Score_A = 0,7 × Ø(Sicherheit & Klima) + 0,3 × Ø(invertierte Aggressionsfragen)
 *
 * Fehlt einer der beiden Teilbereiche vollständig, wird der vorhandene allein
 * gewertet — sonst würde eine einzelne unbeantwortete Frage die ganze
 * Pflichtkategorie entwerten.
 */
function scoreKategorieA(antworten: Antworten): KategorieErgebnis {
  const fragen = fragenDerKategorie("A");
  const klima = punktwerteFuer(fragen.filter((f) => f.teilbereich === "klima"), antworten);
  const aggression = punktwerteFuer(
    fragen.filter((f) => f.teilbereich === "aggression"),
    antworten,
  );

  const oKlima = mittelwert(klima);
  const oAggression = mittelwert(aggression);

  let score: number | null;
  if (oKlima !== null && oAggression !== null) {
    score = 0.7 * oKlima + 0.3 * oAggression;
  } else {
    score = oKlima ?? oAggression;
  }

  return {
    kategorie: "A",
    score,
    anzeige: score === null ? null : aufZehnerskala(score),
    gewichtung: 3,
    beantwortet: klima.length + aggression.length,
  };
}

export function scoreKategorie(kategorie: KategorieId, antworten: Antworten): KategorieErgebnis {
  if (kategorie === "A") return scoreKategorieA(antworten);

  const definition = KATEGORIEN.find((k) => k.id === kategorie);
  if (!definition) throw new Error(`Unbekannte Kategorie: ${kategorie}`);

  const werte = punktwerteFuer(fragenDerKategorie(kategorie), antworten);
  const score = mittelwert(werte);
  return {
    kategorie,
    score,
    anzeige: score === null ? null : aufZehnerskala(score),
    gewichtung: definition.gewichtung,
    beantwortet: werte.length,
  };
}

/**
 * Aggressionsindex — Mittelwert der ROHEN Häufigkeitswerte, bewusst nicht invertiert.
 * Er misst, wie oft berichtet wird, nicht wie gut die Schule dasteht.
 *
 * Ampelgrenzen lückenlos (E8): ≤ 2,0 grün · > 2,0 und < 3,5 gelb · ≥ 3,5 rot.
 */
export function aggressionsindex(antworten: Antworten): Aggressionsergebnis | null {
  const rohwerte: number[] = [];
  for (const frage of AGGRESSIONSFRAGEN) {
    const antwort = antworten[frage.id];
    if (antwort === undefined || antwort === KEINE_ANGABE) continue;
    rohwerte.push(antwort);
  }

  const index = mittelwert(rohwerte);
  if (index === null) return null;

  return { index, stufe: ampelstufe(index) };
}

export function ampelstufe(index: number): Ampelstufe {
  if (index <= 2.0) return "gering";
  if (index >= 3.5) return "hoch";
  return "mittel";
}

/**
 * Rechnet einen Antwortmittelwert (1–5) auf die Anzeigeskala 0–10 um.
 *
 *   (Ø − 1) ÷ 4 × 10
 *
 * Bewusst normalisiert statt einfach multipliziert: `Ø × 2` ergäbe den Bereich
 * 2–10 und damit dieselbe tote Zone am unteren Ende, die der Faktor 20 aus der
 * Spec erzeugt hätte. So entspricht 0 der schlechtestmöglichen und 10 der
 * bestmöglichen Bewertung.
 *
 * Die Antwortstufen liegen damit auf: Sehr schlecht 0 · Schlecht 2,5 ·
 * Befriedigend 5 · Gut 7,5 · Sehr gut 10.
 */
export function aufZehnerskala(mittelwert: number): number {
  return ((mittelwert - 1) / 4) * 10;
}

/**
 * Farbstufe des Gesamtscores, verankert an den Antwortstufen statt an
 * rechnerischen Dritteln (Entscheidung vom 26.08.2026):
 *
 *   ≥ 7,5  grün    — im Schnitt mindestens „Gut“
 *   ≥ 5,0  gelb    — zwischen „Befriedigend“ und „Gut“
 *   < 5,0  rot     — schlechter als „Befriedigend“
 *
 * Gleiche Drittel wären hier irreführend: Bewertungsverteilungen liegen im
 * oberen Bereich, Rot käme praktisch nie vor und die Farbe sagte nichts aus.
 * So ist jede Farbe einer Schule gegenüber begründbar.
 */
export function scorestufe(score: number): Scorestufe {
  if (score >= 7.5) return "gut";
  if (score >= 5.0) return "mittel";
  return "schlecht";
}

/**
 * Gesamtscore.
 *
 *   (A×3 + B×2 + C×2 + D×2* + E×1* + F×1*) ÷ Σ(aktive Gewichte)
 *   * optionale Kategorien zählen nur, wenn beantwortet
 *
 * Das Ergebnis wird auf die Anzeigeskala 0–10 umgerechnet.
 */
export function bewerte(antworten: Antworten): Bewertungsergebnis {
  const kategorien = KATEGORIEN.map((k) => scoreKategorie(k.id, antworten));

  const fehlendePflicht = KATEGORIEN.filter(
    (k) => k.pflicht && kategorien.find((e) => e.kategorie === k.id)?.score === null,
  ).map((k) => k.id);
  if (fehlendePflicht.length > 0) throw new UnvollstaendigeBewertung(fehlendePflicht);

  let summe = 0;
  let gewichtssumme = 0;
  for (const ergebnis of kategorien) {
    if (ergebnis.score === null) continue;
    summe += ergebnis.score * ergebnis.gewichtung;
    gewichtssumme += ergebnis.gewichtung;
  }

  const gesamtscore = aufZehnerskala(summe / gewichtssumme);

  return {
    gesamtscore,
    stufe: scorestufe(gesamtscore),
    kategorien,
    aggression: aggressionsindex(antworten),
  };
}

/** Prüft, ob eine Antwortmenge Frage-IDs enthält, die es im Fragebogen nicht gibt. */
export function unbekannteFragen(antworten: Antworten): readonly string[] {
  return Object.keys(antworten).filter((id) => !FRAGE_NACH_ID.has(id));
}

// ---- Anzeige ----

const ZAHL_DE = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Score für die Anzeige: „8,4“. */
export function formatiereScore(score: number): string {
  return ZAHL_DE.format(score);
}

/** Vollständige Anzeigeform: „8,4 von 10“. */
export function formatiereScoreMitSkala(score: number): string {
  return `${ZAHL_DE.format(score)} von 10`;
}

export const SCORESTUFE_LABEL: Readonly<Record<Scorestufe, string>> = {
  gut: "Gut bewertet",
  mittel: "Durchschnittlich bewertet",
  schlecht: "Unterdurchschnittlich bewertet",
};

export const AMPEL_LABEL: Readonly<Record<Ampelstufe, string>> = {
  gering: "Geringe Häufigkeit",
  mittel: "Mittlere Häufigkeit",
  hoch: "Hohe Häufigkeit",
};
