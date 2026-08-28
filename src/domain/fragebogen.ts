/**
 * Fragebogen - kanonische Definition.
 *
 * Quelle: docs/fragebogen-de.md. Diese Datei ist die maschinenlesbare Fassung
 * desselben Inhalts; bei Abweichungen gilt das Markdown-Dokument als Referenz
 * für den Wortlaut und diese Datei als Referenz für Struktur und Wertung.
 *
 * Deutsch ist hier das Original, keine Übersetzung (Entwicklungsplan, Abschnitt 3).
 */

export type SkalenName = "qualitaet" | "sicherheit" | "haeufigkeit";
export type KategorieId = "A" | "B" | "C" | "D" | "E" | "F";
export type Skalenwert = 1 | 2 | 3 | 4 | 5;

/** Wird bei „Kann ich nicht beurteilen“ gespeichert und aus jeder Mittelwertbildung ausgenommen. */
export const KEINE_ANGABE = "keine_angabe" as const;
export type Antwort = Skalenwert | typeof KEINE_ANGABE;

/**
 * Wie der Rohwert in den Score eingeht.
 *  - "direkt":      5 ist gut  (Qualitäts- und Sicherheitsskala)
 *  - "invertiert":  1 ist gut  (Häufigkeit unerwünschter Vorfälle, Score = 6 − Rohwert)
 *
 * Die Wertung hängt bewusst an der einzelnen Frage, nicht an der Skala: „Wie häufig
 * finden Ausflüge statt?" wäre ebenfalls Häufigkeit, aber direkt zu werten. Solche
 * Fragen sind im Katalog vermieden (siehe fragebogen-de.md, Abschnitt 7), die
 * Engine bleibt trotzdem für beide Fälle korrekt.
 */
export type Wertung = "direkt" | "invertiert";

/** Teilbereich innerhalb der Kategorie A (Safety Scoring Spec). */
export type TeilbereichA = "klima" | "aggression";

export interface Antwortoption {
  readonly label: string;
  readonly wert: Skalenwert;
}

/** Reihenfolge: wie im Formular angezeigt (bester Wert zuerst bzw. „Nie“ zuerst). */
export const SKALEN: Readonly<Record<SkalenName, readonly Antwortoption[]>> = {
  qualitaet: [
    { label: "Sehr gut", wert: 5 },
    { label: "Gut", wert: 4 },
    { label: "Befriedigend", wert: 3 },
    { label: "Schlecht", wert: 2 },
    { label: "Sehr schlecht", wert: 1 },
  ],
  sicherheit: [
    { label: "Sehr sicher", wert: 5 },
    { label: "Eher sicher", wert: 4 },
    { label: "Teils, teils", wert: 3 },
    { label: "Eher unsicher", wert: 2 },
    { label: "Sehr unsicher", wert: 1 },
  ],
  haeufigkeit: [
    { label: "Nie", wert: 1 },
    { label: "Selten", wert: 2 },
    { label: "Gelegentlich", wert: 3 },
    { label: "Häufig", wert: 4 },
    { label: "Sehr häufig", wert: 5 },
  ],
} as const;

export const LABEL_KEINE_ANGABE = "Kann ich nicht beurteilen";

export interface Kategorie {
  readonly id: KategorieId;
  readonly titel: string;
  readonly gewichtung: number;
  readonly pflicht: boolean;
  readonly freitextLabel: string;
}

export const KATEGORIEN: readonly Kategorie[] = [
  {
    id: "A",
    titel: "Sicherheit & Schulklima",
    // Vierfach statt dreifach (Entscheidung vom 28.08.2026): Ob eine Schule
    // sicher ist, wiegt schwerer als alles andere, was hier gefragt wird.
    gewichtung: 4,
    pflicht: true,
    freitextLabel: "Weitere Anmerkungen zu Sicherheit und Schulklima",
  },
  {
    id: "B",
    titel: "Unterrichts- & Lernqualität",
    gewichtung: 2,
    pflicht: true,
    freitextLabel: "Weitere Anmerkungen zu Unterricht und Lernen",
  },
  {
    id: "C",
    titel: "Ausstattung & Lernmittel",
    gewichtung: 2,
    pflicht: true,
    freitextLabel: "Weitere Anmerkungen zu Ausstattung und Lernmitteln",
  },
  {
    id: "D",
    titel: "Schulleitung, Kommunikation & Verwaltung",
    // Einfach statt zweifach (Entscheidung vom 28.08.2026): Verwaltung ist für
    // die Schülerinnen und Schüler selbst am wenigsten spürbar.
    gewichtung: 1,
    pflicht: false,
    freitextLabel: "Weitere Anmerkungen zu Schulleitung und Verwaltung",
  },
  {
    id: "E",
    titel: "Umwelt & Nachhaltigkeit",
    gewichtung: 1,
    pflicht: false,
    freitextLabel: "Weitere Anmerkungen zu Umwelt und Nachhaltigkeit",
  },
  {
    id: "F",
    titel: "Außerunterrichtliches Angebot & Schulleben",
    gewichtung: 1,
    pflicht: false,
    freitextLabel: "Weitere Anmerkungen zu außerunterrichtlichen Angeboten und Schulleben",
  },
] as const;

export interface Frage {
  readonly id: string;
  readonly kategorie: KategorieId;
  readonly skala: SkalenName;
  readonly wertung: Wertung;
  /** Nur in Kategorie A gesetzt. */
  readonly teilbereich?: TeilbereichA;
  /**
   * Fragetext in der Du-Form. Das Portal duzt durchgehend, auch gegenüber
   * Eltern und Lehrkräften (Entscheidung vom 26.08.2026).
   */
  readonly text: string;
}

export const FRAGEN: readonly Frage[] = [
  // ---- A - Sicherheit & Schulklima (11 Fragen) ----
  {
    id: "A1", kategorie: "A", skala: "sicherheit", wertung: "direkt", teilbereich: "klima",
    text: "Wie sicher fühlst du dich generell auf dem Schulgelände (Klassenräume, Flure, Schulhof)?",
  },
  {
    id: "A2", kategorie: "A", skala: "haeufigkeit", wertung: "invertiert", teilbereich: "aggression",
    text: "Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern?",
  },
  {
    id: "A3", kategorie: "A", skala: "haeufigkeit", wertung: "invertiert", teilbereich: "aggression",
    text: "Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften?",
  },
  {
    id: "A4", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie wirksam reagiert die Schule auf Vorfälle wie Mobbing oder Gewalt?",
  },
  {
    id: "A5", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie fair und einheitlich sind die Schulregeln und Disziplinarmaßnahmen?",
  },
  {
    id: "A6", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie respektvoll ist der Umgang zwischen Schülerinnen und Schülern und den Lehrkräften?",
  },
  {
    id: "A7", kategorie: "A", skala: "sicherheit", wertung: "direkt", teilbereich: "klima",
    text: "Wie sicher fühlst du dich vor Belästigung oder Einschüchterung im schulischen Umfeld (auch online)?",
  },
  {
    id: "A8", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie unterstützend ist das Schulpersonal bei persönlichen oder schulischen Problemen?",
  },
  {
    id: "A9", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie offen ist das Schulumfeld gegenüber Schülerinnen und Schülern unterschiedlicher Herkunft?",
  },
  {
    id: "A10", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie gut geht die Schule mit Konflikten zwischen Schülerinnen und Schülern um?",
  },
  {
    id: "A11", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie bewertest du insgesamt die Sicherheit und das soziale Klima der Schule?",
  },

  // ---- B - Unterrichts- & Lernqualität (10 Fragen) ----
  { id: "B1", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie verständlich erklären die Lehrkräfte die Unterrichtsinhalte?" },
  { id: "B2", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie fachkundig sind die Lehrkräfte in den Fächern, die sie unterrichten?" },
  { id: "B3", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie interessant und motivierend ist der Unterricht?" },
  { id: "B4", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie hilfreich und konstruktiv sind die Rückmeldungen der Lehrkräfte?" },
  { id: "B5", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Schülerinnen und Schüler mit Lernschwierigkeiten oder besonderem Förderbedarf?" },
  { id: "B6", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie angemessen ist das fachliche Niveau des Unterrichts?" },
  { id: "B7", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie fair und nachvollziehbar sind Benotung und Leistungsbewertung?" },
  { id: "B8", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie wirksam werden moderne Unterrichtsmethoden und digitale Werkzeuge eingesetzt?" },
  { id: "B9", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut bereitet der Unterricht auf Prüfungen oder den nächsten Bildungsabschnitt vor?" },
  { id: "B10", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Unterrichts- und Lernqualität an dieser Schule?" },

  // ---- C - Ausstattung & Lernmittel (10 Fragen) ----
  { id: "C1", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du den Zustand der Klassenräume (Mobiliar, Beleuchtung, Belüftung)?" },
  { id: "C2", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie ausreichend und aktuell sind Schulbücher und Lernmaterialien?" },
  { id: "C3", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie zuverlässig und nutzbar sind das Internet und die digitale Infrastruktur der Schule?" },
  { id: "C4", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ausgestattet sind Fachräume (zum Beispiel Naturwissenschafts-, Werk- oder Kunsträume)?" },
  { id: "C5", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie sauber und funktionsfähig sind die Sanitäranlagen (Toiletten, Waschräume)?" },
  { id: "C6", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut sind die Sportanlagen und die Sportausstattung?" },
  { id: "C7", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie zugänglich und nützlich sind Bibliothek oder Lernräume?" },
  { id: "C8", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut instand gehalten und sicher sind Schulgebäude und Außenanlagen?" },
  { id: "C9", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie ausreichend stehen digitale Endgeräte (Computer, Tablets) zur Verfügung?" },
  { id: "C10", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Ausstattung und die Lernmittel der Schule?" },

  // ---- D - Schulleitung, Kommunikation & Verwaltung (10 Fragen, optional) ----
  { id: "D1", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie verständlich kommuniziert die Schulleitung wichtige Informationen?" },
  { id: "D2", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie transparent und nachvollziehbar sind Verwaltungsentscheidungen?" },
  { id: "D3", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie zuverlässig reagiert die Verwaltung auf Anfragen von Schülerinnen und Schülern, Eltern oder Lehrkräften?" },
  { id: "D4", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie wirksam geht die Schulleitung mit Konflikten oder Beschwerden um?" },
  { id: "D5", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie unterstützend ist die Schulleitung gegenüber Lehrkräften und Personal?" },
  { id: "D6", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie leicht erreichst du die zuständige Ansprechperson in der Verwaltung?" },
  { id: "D7", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut arbeitet die Schule mit Eltern und Erziehungsberechtigten zusammen?" },
  { id: "D8", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie aktiv arbeitet die Schulleitung an der Verbesserung der Schulqualität?" },
  { id: "D9", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie fair und einheitlich sind Verwaltungsabläufe, die Schülerinnen und Schüler betreffen?" },
  { id: "D10", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Schulleitung und die Verwaltung?" },

  // ---- E - Umwelt & Nachhaltigkeit (10 Fragen, optional) ----
  { id: "E1", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie umweltbewusst handelt die Schule im Schulalltag?" },
  { id: "E2", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut fördert die Schule Mülltrennung und Recycling?" },
  { id: "E3", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie energieeffizient sind die Schulgebäude (Beleuchtung, Heizung, Dämmung)?" },
  { id: "E4", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut reduziert die Schule unnötigen Papierverbrauch und fördert digitale Alternativen?" },
  { id: "E5", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie sauber und gepflegt sind Außenbereiche und Grünflächen?" },
  { id: "E6", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Welchen Stellenwert hat Umweltbildung an der Schule?" },
  { id: "E7", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie aktiv werden Schülerinnen und Schüler in Umwelt- und Nachhaltigkeitsprojekte einbezogen?" },
  { id: "E8", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie verantwortungsvoll gestaltet die Schule die Verpflegung (zum Beispiel Abfallvermeidung, nachhaltige Angebote)?" },
  { id: "E9", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut fördert die Schule umweltbewusstes Verhalten bei Schülerinnen, Schülern und Personal?" },
  { id: "E10", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt das Engagement der Schule für Umwelt und Nachhaltigkeit?" },

  // ---- F - Außerunterrichtliches Angebot & Schulleben (10 Fragen, optional) ----
  { id: "F1", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie vielfältig ist das Angebot an Arbeitsgemeinschaften und Kursen außerhalb des Unterrichts?" },
  { id: "F2", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut organisiert sind Ausflüge, Exkursionen und Projekttage?" },
  { id: "F3", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie angemessen ist die Anzahl der Ausflüge und Klassenfahrten im Schuljahr?" },
  { id: "F4", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut sind die Sport- und Bewegungsangebote außerhalb des Unterrichts?" },
  { id: "F5", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ist das musisch-künstlerische Angebot (Chor, Orchester, Theater, Kunst)?" },
  { id: "F6", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ist das Ganztags- und Betreuungsangebot (Hausaufgabenbetreuung, Nachmittagsangebote)?" },
  { id: "F7", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut bereitet die Schule auf Beruf und Studium vor (Praktika, Berufsorientierung, Beratung)?" },
  { id: "F8", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Schüleraustausch und internationale Programme?" },
  { id: "F9", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Eigeninitiative (Schülervertretung, Schülerzeitung, eigene Projekte)?" },
  { id: "F10", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt das außerunterrichtliche Angebot und das Schulleben?" },
] as const;

// ---- Abgeleitete Nachschlagewerte ----

export const KATEGORIE_NACH_ID: ReadonlyMap<KategorieId, Kategorie> = new Map(
  KATEGORIEN.map((k) => [k.id, k]),
);

export const FRAGE_NACH_ID: ReadonlyMap<string, Frage> = new Map(
  FRAGEN.map((f) => [f.id, f]),
);

export function fragenDerKategorie(kategorie: KategorieId): readonly Frage[] {
  return FRAGEN.filter((f) => f.kategorie === kategorie);
}

/** Die Fragen, aus denen der öffentlich angezeigte Aggressionsindex gebildet wird. */
export const AGGRESSIONSFRAGEN: readonly Frage[] = FRAGEN.filter(
  (f) => f.teilbereich === "aggression",
);

export const PFLICHTKATEGORIEN: readonly KategorieId[] = KATEGORIEN.filter((k) => k.pflicht).map(
  (k) => k.id,
);
