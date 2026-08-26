/**
 * Scoring-Engine.
 *
 * Quelle: Safety Scoring & Public Display Specification, umgesetzt mit den
 * Korrekturen E7 (Wertebereich 20–100) und E8 (lückenlose Ampelgrenzen) sowie
 * der Erweiterung E16 (Kategorie F) aus docs/dev-plan.md.
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
} from "./fragebogen.js";

/** Antworten einer einzelnen Bewertung, Schlüssel ist die Frage-ID. */
export type Antworten = Readonly<Record<string, Antwort>>;

export interface KategorieErgebnis {
  readonly kategorie: KategorieId;
  /** Mittelwert auf der Skala 1–5, oder null wenn die Kategorie unbeantwortet blieb. */
  readonly score: number | null;
  readonly gewichtung: number;
  /** Zahl der Fragen, die in den Mittelwert eingegangen sind. */
  readonly beantwortet: number;
}

export type Ampelstufe = "gering" | "mittel" | "hoch";

export interface Aggressionsergebnis {
  /** Mittelwert der ROHEN Häufigkeitswerte (1–5), nicht invertiert. */
  readonly index: number;
  readonly stufe: Ampelstufe;
}

export interface Bewertungsergebnis {
  /** Gesamtscore auf der Skala 20–100 (siehe E7). */
  readonly gesamtscore: number;
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
    gewichtung: 3,
    beantwortet: klima.length + aggression.length,
  };
}

export function scoreKategorie(kategorie: KategorieId, antworten: Antworten): KategorieErgebnis {
  if (kategorie === "A") return scoreKategorieA(antworten);

  const definition = KATEGORIEN.find((k) => k.id === kategorie);
  if (!definition) throw new Error(`Unbekannte Kategorie: ${kategorie}`);

  const werte = punktwerteFuer(fragenDerKategorie(kategorie), antworten);
  return {
    kategorie,
    score: mittelwert(werte),
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
 * Gesamtscore.
 *
 *   (A×3 + B×2 + C×2 + D×2* + E×1* + F×1*) ÷ Σ(aktive Gewichte) × 20
 *   * optionale Kategorien zählen nur, wenn beantwortet
 *
 * Der Wertebereich ist damit 20–100, nicht 0–100 (E7): der niedrigstmögliche
 * Kategoriemittelwert ist 1, und 1 × 20 = 20. Das ist im UI zu kommunizieren.
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

  return {
    gesamtscore: (summe / gewichtssumme) * 20,
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

/** Gesamtscore für die Anzeige: „87,4“. */
export function formatiereScore(score: number): string {
  return ZAHL_DE.format(score);
}

export const AMPEL_LABEL: Readonly<Record<Ampelstufe, string>> = {
  gering: "Geringe Häufigkeit",
  mittel: "Mittlere Häufigkeit",
  hoch: "Hohe Häufigkeit",
};
