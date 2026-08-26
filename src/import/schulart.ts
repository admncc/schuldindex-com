/**
 * Normalisierung der Schulartbezeichnungen aus jedeschule.codefor.de
 * auf die Taxonomie des Portals.
 *
 * Warum das nötig ist: die Quelle führt 232 verschiedene Schulartbezeichnungen,
 * weil jedes Bundesland seine eigene Systematik liefert. Ohne Vereinheitlichung
 * gäbe es keinen Filter „alle Gymnasien“ und keine Rangliste je Schulart.
 *
 * Vier Eigenheiten der Quelle, die hier behandelt werden:
 *   1. Baden-Württemberg liefert englische Codes (`primaryEducation`,
 *      `lowerSecondaryEduction` — Tippfehler im Original) statt Klartext.
 *   2. Bayern liefert Pluralformen („Grundschulen“, „Gymnasien“).
 *   3. Hamburg liefert Mehrfachwerte mit `|`, das Saarland mit `;` und Tabs.
 *   4. Rund 400 Datensätze sind gar keine Schulen, sondern Schulämter,
 *      Studienseminare und Hochschulen.
 */

/** Taxonomie des Portals. Eine Schule kann mehreren Arten zugleich angehören. */
export type Schulart =
  | "grundschule"
  | "hauptschule"
  | "realschule"
  | "oberschule"
  | "gesamtschule"
  | "gymnasium"
  | "foerderschule"
  | "berufliche_schule"
  | "waldorfschule"
  | "sonstige";

export const SCHULART_LABEL: Readonly<Record<Schulart, string>> = {
  grundschule: "Grundschule",
  hauptschule: "Hauptschule",
  realschule: "Realschule",
  oberschule: "Mittel-/Oberschule",
  gesamtschule: "Gesamtschule",
  gymnasium: "Gymnasium",
  foerderschule: "Förderschule",
  berufliche_schule: "Berufliche Schule",
  waldorfschule: "Waldorf-/Freie Schule",
  sonstige: "Sonstige",
};

export interface Schulartzuordnung {
  /** Taxonomie-Arten, aufsteigend sortiert und ohne Dubletten. Für Filter und Ranglisten. */
  readonly arten: readonly Schulart[];
  /**
   * Originalbezeichnung des Bundeslandes, bereinigt — für die Anzeige.
   * Eine Schleswig-Holsteiner „Gemeinschaftsschule“ wird als Gesamtschule
   * gefiltert, heißt auf ihrem Profil aber weiterhin Gemeinschaftsschule.
   */
  readonly bezeichnung: string | null;
  /** false bei Schulamt, Studienseminar, Hochschule — diese Datensätze gehören nicht ins Portal. */
  readonly istSchule: boolean;
  /** Woher die Zuordnung stammt. `name` heißt: aus dem Schulnamen erschlossen. */
  readonly quelle: "schulart" | "name" | "unbekannt";
}

// ---------------------------------------------------------------------------

/** Kleinschreibung, Tabs und Mehrfachleerzeichen weg, Anführungszeichen weg. */
function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/["„“»«]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hamburg trennt mit `|`, das Saarland mit `;` — beides plus Leereinträge behandeln. */
export function teileBezeichnung(rohwert: string): string[] {
  return rohwert
    .split(/[|;]/)
    .map((teil) => teil.replace(/\s+/g, " ").trim())
    .filter((teil) => teil.length > 0);
}

/**
 * Bezeichnungen, die keine Schulart sind: Rechtsform, Vorschulangebote,
 * generische Platzhalter. Sie werden übersprungen, ohne die Zuordnung zu
 * verhindern — „Grundschule|Vorschulklasse“ ist eine Grundschule.
 */
const OHNE_AUSSAGE = [
  /^freie tr[äa]gerschaft$/,
  /^schule in freier tr[äa]gerschaft$/,
  /^vorschul/,
  /^willkommensschule$/,
  /^education$/, // BW: generischer Code ohne Aussagekraft
  /^lowersecondaryeduction$/, // BW: Tippfehler im Original, dazu mehrdeutig
];

/** Datensätze, die gar keine Schule beschreiben. */
const KEINE_SCHULE = [
  /schulaufsicht/,
  /schulamt/,
  /ministerium/,
  /dienststelle/,
  /administrationforeducation/,
  /studienseminar/,
  /^seminar /,
  /^zfsl$/,
  /hochschule/,
  /^universit[äa]t/,
  /berufsakademie/,
  /^musikschule$/,
  /^rebuz$/, // Bremen: Regionales Beratungs- und Unterstützungszentrum
  /schullandheim/,
];

// Achtung, kein Ausschlusskriterium: „Sonderpädagogisches Bildungs- und
// Beratungszentrum“ (SBBZ) ist Baden-Württembergs amtliche Bezeichnung für die
// Förderschule. Ein Filter auf „Beratungszentrum“ hätte 685 reale Schulen
// verworfen — aufgefallen bei der Messung am Gesamtbestand.

/**
 * Zuordnungsregeln, **der Reihe nach** geprüft. Die Reihenfolge trägt Bedeutung:
 * „Realschule plus“ muss vor „Realschule“ greifen, „Oberstufenzentrum“ darf nicht
 * als Oberschule durchgehen.
 */
const REGELN: ReadonlyArray<readonly [RegExp, Schulart]> = [
  // Förderschulen zuerst — sie tragen oft zusätzlich einen anderen Schultyp im Namen
  [/f[öo]rderschule|f[öo]rderzentr|f[öo]rderschwerp|f[öo]z\b|sonderschule|sonderp[äa]d|klinik|krankenhausschule|lernbehinderte|geistigbehinderte|schulkindergarten|sprachheil|bildungs- und beratungszentrum|^sbbz\b/, "foerderschule"],
  [/waldorf|freie schule/, "waldorfschule"],
  // Berufliche Schulen vor Gymnasium, damit „Berufliches Gymnasium“ beide bekommt
  [/beruf|berufskolleg|fachschule|fachoberschule|fachakademie|oberstufenzentrum|^osz\b|wirtschaftsschule|schule des gesundheitswesens|doppeltqualifizierend|weiterbildungskolleg|^zbw/, "berufliche_schule"],
  [/gymnasium|gymnasien|gymnasiale oberstufe|gymn\. oberstufe|abendgymnasium|abend-gymnasium|^kollegs?$|lyzeum|uppersecondaryeducation/, "gymnasium"],
  [/gesamtschule|gemeinschaftsschule|stadtteilschule|^primus|kombinierte allgemein bildende schule/, "gesamtschule"],
  [/realschule plus|erweiterte realschule/, "oberschule"],
  [/oberschule|mittelschule|mittelstufenschule|regelschule|regionale schule|sekundarschule|abendoberschule/, "oberschule"],
  [/realschule(?! plus)(?<!erweiterte realschule)/, "realschule"],
  [/hauptschule/, "hauptschule"],
  [/grundschule|primaryeducation|volksschule/, "grundschule"],
];

/**
 * Stämme, die in zusammengezogenen Bezeichnungen als Kurzform auftreten dürfen.
 * Die Liste ist bewusst geschlossen: eine offene Regel würde aus
 * „Grundschule und Förderzentrum“ ein „Grundschuleschule“ machen.
 */
const KURZFORM_STAEMME = "grund|haupt|real|ober|mittel|f[öo]rder|gesamt|werkreal|sekundar|regel";

/**
 * Löst die deutsche Bindestrich-Ellipse auf: „Grund- und Oberschule“ meint eine
 * Grundschule **und** eine Oberschule, enthält den ersten Begriff aber nur
 * verkürzt. Ohne diese Auflösung verliert jede zusammengezogene Bezeichnung
 * ihren ersten Bestandteil — im Bestand betrifft das mehrere hundert Schulen.
 */
export function loeseKurzformenAuf(text: string): string {
  const n = normalisiere(text);
  const ergaenzungen: string[] = [];

  // „Grund- und …“, „Grund-, Haupt…“ — Bindestrich als Auslassungszeichen
  for (const treffer of n.matchAll(new RegExp(`\\b(${KURZFORM_STAEMME})-(?=\\s|,|$)`, "gu"))) {
    ergaenzungen.push(treffer[1] + "schule");
  }
  // „…, Haupt und Realschule“ — dieselbe Auslassung ohne Bindestrich
  for (const treffer of n.matchAll(new RegExp(`\\b(${KURZFORM_STAEMME})\\s+und\\b`, "gu"))) {
    ergaenzungen.push(treffer[1] + "schule");
  }

  return ergaenzungen.length > 0 ? `${n} ${ergaenzungen.join(" ")}` : n;
}

function ordneTokenZu(token: string): Schulart[] {
  const n = loeseKurzformenAuf(token);
  const treffer: Schulart[] = [];
  for (const [muster, art] of REGELN) {
    if (muster.test(n)) treffer.push(art);
  }
  return treffer;
}

function istOhneAussage(token: string): boolean {
  const n = normalisiere(token);
  return OHNE_AUSSAGE.some((m) => m.test(n));
}

function istKeineSchule(token: string): boolean {
  const n = normalisiere(token);
  return KEINE_SCHULE.some((m) => m.test(n));
}

/**
 * Erschließt die Schulart aus dem Schulnamen.
 *
 * Nötig für rund 2.100 Datensätze ohne Schulartangabe — vor allem
 * Schleswig-Holstein, Sachsen-Anhalt und Baden-Württemberg. Deren Namen tragen
 * die Art fast immer mit: „Marschenschool an’t Wattenmeer, Grundschule des
 * Amtes Marne-Nordsee“.
 */
export function ausName(name: string): Schulart[] {
  return ordneTokenZu(name);
}

/**
 * Ordnet einen Datensatz der Taxonomie zu.
 *
 * @param rohwert  Feld `school_type` der Quelle, oft mehrwertig oder leer
 * @param name     Schulname, dient als Rückfall
 */
export function ordneSchulartZu(rohwert: string | null | undefined, name: string): Schulartzuordnung {
  const tokens = rohwert ? teileBezeichnung(rohwert) : [];
  const bezeichnung = bildeBezeichnung(tokens);

  // Die gelieferte Schulart hat Vorrang: sie ist die Angabe des Bundeslandes.
  if (tokens.some(istKeineSchule)) {
    return { arten: [], bezeichnung, istSchule: false, quelle: "schulart" };
  }

  const ausSchulart = new Set<Schulart>();
  for (const token of tokens) {
    if (istOhneAussage(token)) continue;
    for (const art of ordneTokenZu(token)) ausSchulart.add(art);
  }
  if (ausSchulart.size > 0) {
    return { arten: sortiere(ausSchulart), bezeichnung, istSchule: true, quelle: "schulart" };
  }

  // Erst wenn die Schulart nichts hergibt, wird der Name herangezogen — und
  // zwar auch für den Ausschluss. Andersherum verlöre man eine „Berufsfachschule
  // für Physiotherapie am Universitätsklinikum“, weil im Namen „Universität“ steht.
  if (istKeineSchule(name)) {
    return { arten: [], bezeichnung, istSchule: false, quelle: "name" };
  }

  const ausNamen = ausName(name);
  if (ausNamen.length > 0) {
    return { arten: sortiere(new Set(ausNamen)), bezeichnung, istSchule: true, quelle: "name" };
  }

  return { arten: ["sonstige"], bezeichnung, istSchule: true, quelle: "unbekannt" };
}

/** Anzeigebezeichnung: aussagekräftige Bestandteile, zusammengefasst. */
function bildeBezeichnung(tokens: readonly string[]): string | null {
  const brauchbar = tokens.filter((t) => !istOhneAussage(t));
  if (brauchbar.length === 0) return null;
  return [...new Set(brauchbar)].join(" · ");
}

const REIHENFOLGE: readonly Schulart[] = [
  "grundschule",
  "hauptschule",
  "realschule",
  "oberschule",
  "gesamtschule",
  "gymnasium",
  "foerderschule",
  "berufliche_schule",
  "waldorfschule",
  "sonstige",
];

function sortiere(arten: Set<Schulart>): Schulart[] {
  return REIHENFOLGE.filter((a) => arten.has(a));
}
