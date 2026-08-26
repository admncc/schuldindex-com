/**
 * Die 16 Bundesländer als Domänenbegriff — Filter, Ranglisten, Anzeige.
 *
 * Die Kürzel entsprechen den amtlichen ISO-3166-2:DE-Codes und zugleich dem
 * Präfix der Schul-IDs aus jedeschule.codefor.de („NI-43424“).
 */

export const BUNDESLAENDER = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
] as const;

export type Bundesland = (typeof BUNDESLAENDER)[number];

export const BUNDESLAND_LABEL: Readonly<Record<Bundesland, string>> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

const GUELTIG = new Set<string>(BUNDESLAENDER);

export function istBundesland(wert: string): wert is Bundesland {
  return GUELTIG.has(wert);
}

/** Liest das Bundesland aus dem ID-Präfix der Quelle, etwa `NI-43424` → `NI`. */
export function bundeslandAusId(id: string): Bundesland | null {
  const praefix = id.slice(0, 2).toUpperCase();
  return istBundesland(praefix) ? praefix : null;
}
