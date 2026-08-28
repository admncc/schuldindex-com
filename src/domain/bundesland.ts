/**
 * Die 16 Bundesländer als Domänenbegriff - Filter, Ranglisten, Anzeige.
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

/**
 * Grobe Umrisskästen je Bundesland: [südlichster, nördlichster, westlichster,
 * östlichster Punkt].
 *
 * Kästen, keine Polygone - zwei Verwendungen kommen damit aus: die
 * Plausibilitätsprüfung beim Geokodieren (liegt der Treffer überhaupt im
 * richtigen Land?) und der Bildausschnitt der Karte. Für beides wären Polygone
 * genauer und teurer; für keines von beidem genau genug, um den Unterschied zu
 * rechtfertigen.
 */
export const UMRISSE: Readonly<Record<Bundesland, readonly [number, number, number, number]>> = {
  //          [südlichster, nördlichster, westlichster, östlichster Punkt]
  SH: [53.36, 55.06, 7.86, 11.31],
  HH: [53.39, 53.97, 8.42, 10.33],
  NI: [51.29, 53.90, 6.35, 11.60],
  HB: [53.01, 53.61, 8.48, 8.99],
  NW: [50.32, 52.53, 5.87, 9.46],
  HE: [49.39, 51.66, 7.77, 10.24],
  RP: [48.97, 50.94, 6.11, 8.51],
  BW: [47.53, 49.79, 7.51, 10.50],
  BY: [47.27, 50.56, 8.98, 13.84],
  SL: [49.11, 49.64, 6.36, 7.40],
  BE: [52.34, 52.68, 13.09, 13.76],
  BB: [51.36, 53.56, 11.27, 14.77],
  MV: [53.11, 54.68, 10.59, 14.41],
  SN: [50.17, 51.68, 11.87, 15.04],
  ST: [50.94, 53.04, 10.56, 13.19],
  TH: [50.20, 51.65, 9.88, 12.65],
};
