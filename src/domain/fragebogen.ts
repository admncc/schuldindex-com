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
   *
   * Dies ist die Fassung für Schülerinnen und Schüler und zugleich der
   * kanonische Wortlaut aus `docs/fragebogen-de.md`.
   */
  readonly text: string;
  /**
   * Abweichender Wortlaut je nach Rolle.
   *
   * „Wie häufig erlebst du Mobbing?" ist an ein Elternteil falsch gestellt -
   * es erlebt es nicht selbst, es bekommt es mit. An eine ehemalige Schülerin
   * ist es in der Gegenwartsform falsch gestellt. Gefragt wird deshalb je Rolle
   * das, was die Person auch beantworten kann; **die Skala und die Wertung
   * bleiben dieselben**, sonst wären die Antworten nicht mehr vergleichbar.
   *
   * Nur dort gesetzt, wo der kanonische Wortlaut nicht passt. Fehlt eine
   * Fassung, gilt der kanonische Text - die meisten Fragen beschreiben die
   * Schule und nicht die eigene Erfahrung und passen für alle.
   */
  readonly varianten?: Readonly<Partial<Record<Ansprache, string>>>;
}

/**
 * Wen der Fragebogen gerade anspricht.
 *
 * Abgeleitet aus der Rolle (`domain/bewertungseingabe.ts`, `ansprachefuer`).
 * Beide Schülerrollen teilen sich eine Ansprache: Der Unterschied zwischen
 * unter und ab 16 betrifft die Einwilligung, nicht die Frage.
 */
export type Ansprache = "schueler" | "eltern" | "lehrkraft" | "ehemalig";

/** Der Fragetext für diese Ansprache - mit dem kanonischen Text als Rückfall. */
export function frageText(frage: Frage, ansprache: Ansprache): string {
  return frage.varianten?.[ansprache] ?? frage.text;
}

export const FRAGEN: readonly Frage[] = [
  // ---- A - Sicherheit & Schulklima (11 Fragen) ----
  {
    id: "A1", kategorie: "A", skala: "sicherheit", wertung: "direkt", teilbereich: "klima",
    text: "Wie sicher fühlst du dich generell auf dem Schulgelände (Klassenräume, Flure, Schulhof)?",
    varianten: {
      eltern: "Wie sicher ist dein Kind auf dem Schulgelände (Klassenräume, Flure, Schulhof)?",
      lehrkraft: "Wie sicher ist das Schulgelände für alle, die dort täglich sind (Klassenräume, Flure, Schulhof)?",
      ehemalig: "Wie sicher hast du dich auf dem Schulgelände gefühlt (Klassenräume, Flure, Schulhof)?",
    },
  },
  {
    id: "A2", kategorie: "A", skala: "haeufigkeit", wertung: "invertiert", teilbereich: "aggression",
    text: "Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern?",
    varianten: {
      eltern: "Wie häufig bekommst du Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern mit?",
      ehemalig: "Wie häufig hast du Mobbing, Drohungen oder aggressives Verhalten unter Schülerinnen und Schülern erlebt?",
    },
  },
  {
    id: "A3", kategorie: "A", skala: "haeufigkeit", wertung: "invertiert", teilbereich: "aggression",
    text: "Wie häufig erlebst du Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften?",
    varianten: {
      eltern: "Wie häufig bekommst du Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften mit?",
      ehemalig: "Wie häufig hast du Mobbing, Drohungen oder aggressives Verhalten gegenüber Lehrkräften erlebt?",
    },
  },
  {
    id: "A4", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie wirksam reagiert die Schule auf Vorfälle wie Mobbing oder Gewalt?",
    varianten: {
      ehemalig: "Wie wirksam hat die Schule auf Vorfälle wie Mobbing oder Gewalt reagiert?",
    },
  },
  {
    id: "A5", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie fair und einheitlich sind die Schulregeln und Disziplinarmaßnahmen?",
    varianten: {
      ehemalig: "Wie fair und einheitlich waren die Schulregeln und Disziplinarmaßnahmen?",
    },
  },
  {
    id: "A6", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie respektvoll ist der Umgang zwischen Schülerinnen und Schülern und den Lehrkräften?",
    varianten: {
      ehemalig: "Wie respektvoll war der Umgang zwischen Schülerinnen und Schülern und den Lehrkräften?",
    },
  },
  {
    id: "A7", kategorie: "A", skala: "sicherheit", wertung: "direkt", teilbereich: "klima",
    text: "Wie sicher fühlst du dich vor Belästigung oder Einschüchterung im schulischen Umfeld (auch online)?",
    varianten: {
      eltern: "Wie gut ist dein Kind vor Belästigung oder Einschüchterung im schulischen Umfeld geschützt (auch online)?",
      lehrkraft: "Wie gut sind Schülerinnen und Schüler vor Belästigung oder Einschüchterung im schulischen Umfeld geschützt (auch online)?",
      ehemalig: "Wie sicher hast du dich vor Belästigung oder Einschüchterung im schulischen Umfeld gefühlt (auch online)?",
    },
  },
  {
    id: "A8", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie unterstützend ist das Schulpersonal bei persönlichen oder schulischen Problemen?",
    varianten: {
      ehemalig: "Wie unterstützend war das Schulpersonal bei persönlichen oder schulischen Problemen?",
    },
  },
  {
    id: "A9", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie offen ist das Schulumfeld gegenüber Schülerinnen und Schülern unterschiedlicher Herkunft?",
    varianten: {
      ehemalig: "Wie offen war das Schulumfeld gegenüber Schülerinnen und Schülern unterschiedlicher Herkunft?",
    },
  },
  {
    id: "A10", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie gut geht die Schule mit Konflikten zwischen Schülerinnen und Schülern um?",
    varianten: {
      ehemalig: "Wie gut ist die Schule mit Konflikten zwischen Schülerinnen und Schülern umgegangen?",
    },
  },
  {
    id: "A11", kategorie: "A", skala: "qualitaet", wertung: "direkt", teilbereich: "klima",
    text: "Wie bewertest du insgesamt die Sicherheit und das soziale Klima der Schule?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt die Sicherheit und das soziale Klima der Schule?",
    },
  },

  // ---- B - Unterrichts- & Lernqualität (10 Fragen) ----
  { id: "B1", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie verständlich erklären die Lehrkräfte die Unterrichtsinhalte?",
    varianten: {
      ehemalig: "Wie verständlich haben die Lehrkräfte die Unterrichtsinhalte erklärt?",
    },
  },
  { id: "B2", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie fachkundig sind die Lehrkräfte in den Fächern, die sie unterrichten?",
    varianten: {
      ehemalig: "Wie fachkundig waren die Lehrkräfte in den Fächern, die sie unterrichtet haben?",
    },
  },
  { id: "B3", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie interessant und motivierend ist der Unterricht?",
    varianten: {
      ehemalig: "Wie interessant und motivierend war der Unterricht?",
    },
  },
  { id: "B4", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie hilfreich und konstruktiv sind die Rückmeldungen der Lehrkräfte?",
    varianten: {
      ehemalig: "Wie hilfreich und konstruktiv waren die Rückmeldungen der Lehrkräfte?",
    },
  },
  { id: "B5", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Schülerinnen und Schüler mit Lernschwierigkeiten oder besonderem Förderbedarf?",
    varianten: {
      ehemalig: "Wie gut hat die Schule Schülerinnen und Schüler mit Lernschwierigkeiten oder besonderem Förderbedarf unterstützt?",
    },
  },
  { id: "B6", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie angemessen ist das fachliche Niveau des Unterrichts?",
    varianten: {
      ehemalig: "Wie angemessen war das fachliche Niveau des Unterrichts?",
    },
  },
  { id: "B7", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie fair und nachvollziehbar sind Benotung und Leistungsbewertung?",
    varianten: {
      ehemalig: "Wie fair und nachvollziehbar waren Benotung und Leistungsbewertung?",
    },
  },
  { id: "B8", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie wirksam werden moderne Unterrichtsmethoden und digitale Werkzeuge eingesetzt?",
    varianten: {
      ehemalig: "Wie wirksam wurden moderne Unterrichtsmethoden und digitale Werkzeuge eingesetzt?",
    },
  },
  { id: "B9", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut bereitet der Unterricht auf Prüfungen oder den nächsten Bildungsabschnitt vor?",
    varianten: {
      ehemalig: "Wie gut hat der Unterricht auf Prüfungen oder den nächsten Bildungsabschnitt vorbereitet?",
    },
  },
  { id: "B10", kategorie: "B", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Unterrichts- und Lernqualität an dieser Schule?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt die Unterrichts- und Lernqualität an dieser Schule?",
    },
  },

  // ---- C - Ausstattung & Lernmittel (10 Fragen) ----
  { id: "C1", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du den Zustand der Klassenräume (Mobiliar, Beleuchtung, Belüftung)?",
    varianten: {
      ehemalig: "Wie war der Zustand der Klassenräume (Mobiliar, Beleuchtung, Belüftung)?",
    },
  },
  { id: "C2", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie ausreichend und aktuell sind Schulbücher und Lernmaterialien?",
    varianten: {
      ehemalig: "Wie ausreichend und aktuell waren Schulbücher und Lernmaterialien?",
    },
  },
  { id: "C3", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie zuverlässig und nutzbar sind das Internet und die digitale Infrastruktur der Schule?",
    varianten: {
      ehemalig: "Wie zuverlässig und nutzbar waren das Internet und die digitale Infrastruktur der Schule?",
    },
  },
  { id: "C4", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ausgestattet sind Fachräume (zum Beispiel Naturwissenschafts-, Werk- oder Kunsträume)?",
    varianten: {
      ehemalig: "Wie gut ausgestattet waren Fachräume (zum Beispiel Naturwissenschafts-, Werk- oder Kunsträume)?",
    },
  },
  { id: "C5", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie sauber und funktionsfähig sind die Sanitäranlagen (Toiletten, Waschräume)?",
    varianten: {
      ehemalig: "Wie sauber und funktionsfähig waren die Sanitäranlagen (Toiletten, Waschräume)?",
    },
  },
  { id: "C6", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut sind die Sportanlagen und die Sportausstattung?",
    varianten: {
      ehemalig: "Wie gut waren die Sportanlagen und die Sportausstattung?",
    },
  },
  { id: "C7", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie zugänglich und nützlich sind Bibliothek oder Lernräume?",
    varianten: {
      ehemalig: "Wie zugänglich und nützlich waren Bibliothek oder Lernräume?",
    },
  },
  { id: "C8", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut instand gehalten und sicher sind Schulgebäude und Außenanlagen?",
    varianten: {
      ehemalig: "Wie gut instand gehalten und sicher waren Schulgebäude und Außenanlagen?",
    },
  },
  { id: "C9", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie ausreichend stehen digitale Endgeräte (Computer, Tablets) zur Verfügung?",
    varianten: {
      ehemalig: "Wie ausreichend standen digitale Endgeräte (Computer, Tablets) zur Verfügung?",
    },
  },
  { id: "C10", kategorie: "C", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Ausstattung und die Lernmittel der Schule?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt die Ausstattung und die Lernmittel der Schule?",
    },
  },

  // ---- D - Schulleitung, Kommunikation & Verwaltung (10 Fragen, optional) ----
  { id: "D1", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie verständlich kommuniziert die Schulleitung wichtige Informationen?",
    varianten: {
      ehemalig: "Wie verständlich hat die Schulleitung wichtige Informationen kommuniziert?",
    },
  },
  { id: "D2", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie transparent und nachvollziehbar sind Verwaltungsentscheidungen?",
    varianten: {
      ehemalig: "Wie transparent und nachvollziehbar waren Verwaltungsentscheidungen?",
    },
  },
  { id: "D3", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie zuverlässig reagiert die Verwaltung auf Anfragen von Schülerinnen und Schülern, Eltern oder Lehrkräften?",
    varianten: {
      ehemalig: "Wie zuverlässig hat die Verwaltung auf Anfragen von Schülerinnen und Schülern, Eltern oder Lehrkräften reagiert?",
    },
  },
  { id: "D4", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie wirksam geht die Schulleitung mit Konflikten oder Beschwerden um?",
    varianten: {
      ehemalig: "Wie wirksam ist die Schulleitung mit Konflikten oder Beschwerden umgegangen?",
    },
  },
  { id: "D5", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie unterstützend ist die Schulleitung gegenüber Lehrkräften und Personal?",
    varianten: {
      ehemalig: "Wie unterstützend war die Schulleitung gegenüber Lehrkräften und Personal?",
    },
  },
  { id: "D6", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie leicht erreichst du die zuständige Ansprechperson in der Verwaltung?",
    varianten: {
      ehemalig: "Wie leicht hast du die zuständige Ansprechperson in der Verwaltung erreicht?",
    },
  },
  { id: "D7", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut arbeitet die Schule mit Eltern und Erziehungsberechtigten zusammen?",
    varianten: {
      ehemalig: "Wie gut hat die Schule mit Eltern und Erziehungsberechtigten zusammengearbeitet?",
    },
  },
  { id: "D8", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie aktiv arbeitet die Schulleitung an der Verbesserung der Schulqualität?",
    varianten: {
      ehemalig: "Wie aktiv hat die Schulleitung an der Verbesserung der Schulqualität gearbeitet?",
    },
  },
  { id: "D9", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie fair und einheitlich sind Verwaltungsabläufe, die Schülerinnen und Schüler betreffen?",
    varianten: {
      ehemalig: "Wie fair und einheitlich waren Verwaltungsabläufe, die Schülerinnen und Schüler betreffen?",
    },
  },
  { id: "D10", kategorie: "D", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt die Schulleitung und die Verwaltung?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt die Schulleitung und die Verwaltung?",
    },
  },

  // ---- E - Umwelt & Nachhaltigkeit (10 Fragen, optional) ----
  { id: "E1", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie umweltbewusst handelt die Schule im Schulalltag?",
    varianten: {
      ehemalig: "Wie umweltbewusst hat die Schule im Schulalltag gehandelt?",
    },
  },
  { id: "E2", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut fördert die Schule Mülltrennung und Recycling?",
    varianten: {
      ehemalig: "Wie gut hat die Schule Mülltrennung und Recycling gefördert?",
    },
  },
  { id: "E3", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie energieeffizient sind die Schulgebäude (Beleuchtung, Heizung, Dämmung)?",
    varianten: {
      ehemalig: "Wie energieeffizient waren die Schulgebäude (Beleuchtung, Heizung, Dämmung)?",
    },
  },
  { id: "E4", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut reduziert die Schule unnötigen Papierverbrauch und fördert digitale Alternativen?",
    varianten: {
      ehemalig: "Wie gut hat die Schule unnötigen Papierverbrauch reduziert und digitale Alternativen gefördert?",
    },
  },
  { id: "E5", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie sauber und gepflegt sind Außenbereiche und Grünflächen?",
    varianten: {
      ehemalig: "Wie sauber und gepflegt waren Außenbereiche und Grünflächen?",
    },
  },
  { id: "E6", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Welchen Stellenwert hat Umweltbildung an der Schule?",
    varianten: {
      ehemalig: "Welchen Stellenwert hatte Umweltbildung an der Schule?",
    },
  },
  { id: "E7", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie aktiv werden Schülerinnen und Schüler in Umwelt- und Nachhaltigkeitsprojekte einbezogen?",
    varianten: {
      ehemalig: "Wie aktiv wurden Schülerinnen und Schüler in Umwelt- und Nachhaltigkeitsprojekte einbezogen?",
    },
  },
  { id: "E8", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie verantwortungsvoll gestaltet die Schule die Verpflegung (zum Beispiel Abfallvermeidung, nachhaltige Angebote)?",
    varianten: {
      ehemalig: "Wie verantwortungsvoll hat die Schule die Verpflegung gestaltet (zum Beispiel Abfallvermeidung, nachhaltige Angebote)?",
    },
  },
  { id: "E9", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut fördert die Schule umweltbewusstes Verhalten bei Schülerinnen, Schülern und Personal?",
    varianten: {
      ehemalig: "Wie gut hat die Schule umweltbewusstes Verhalten bei Schülerinnen, Schülern und Personal gefördert?",
    },
  },
  { id: "E10", kategorie: "E", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt das Engagement der Schule für Umwelt und Nachhaltigkeit?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt das Engagement der Schule für Umwelt und Nachhaltigkeit?",
    },
  },

  // ---- F - Außerunterrichtliches Angebot & Schulleben (10 Fragen, optional) ----
  { id: "F1", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie vielfältig ist das Angebot an Arbeitsgemeinschaften und Kursen außerhalb des Unterrichts?",
    varianten: {
      ehemalig: "Wie vielfältig war das Angebot an Arbeitsgemeinschaften und Kursen außerhalb des Unterrichts?",
    },
  },
  { id: "F2", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut organisiert sind Ausflüge, Exkursionen und Projekttage?",
    varianten: {
      ehemalig: "Wie gut organisiert waren Ausflüge, Exkursionen und Projekttage?",
    },
  },
  { id: "F3", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie angemessen ist die Anzahl der Ausflüge und Klassenfahrten im Schuljahr?",
    varianten: {
      ehemalig: "Wie angemessen war die Anzahl der Ausflüge und Klassenfahrten im Schuljahr?",
    },
  },
  { id: "F4", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut sind die Sport- und Bewegungsangebote außerhalb des Unterrichts?",
    varianten: {
      ehemalig: "Wie gut waren die Sport- und Bewegungsangebote außerhalb des Unterrichts?",
    },
  },
  { id: "F5", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ist das musisch-künstlerische Angebot (Chor, Orchester, Theater, Kunst)?",
    varianten: {
      ehemalig: "Wie gut war das musisch-künstlerische Angebot (Chor, Orchester, Theater, Kunst)?",
    },
  },
  { id: "F6", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut ist das Ganztags- und Betreuungsangebot (Hausaufgabenbetreuung, Nachmittagsangebote)?",
    varianten: {
      ehemalig: "Wie gut war das Ganztags- und Betreuungsangebot (Hausaufgabenbetreuung, Nachmittagsangebote)?",
    },
  },
  { id: "F7", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut bereitet die Schule auf Beruf und Studium vor (Praktika, Berufsorientierung, Beratung)?",
    varianten: {
      ehemalig: "Wie gut hat die Schule auf Beruf und Studium vorbereitet (Praktika, Berufsorientierung, Beratung)?",
    },
  },
  { id: "F8", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Schüleraustausch und internationale Programme?",
    varianten: {
      ehemalig: "Wie gut hat die Schule Schüleraustausch und internationale Programme unterstützt?",
    },
  },
  { id: "F9", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie gut unterstützt die Schule Eigeninitiative (Schülervertretung, Schülerzeitung, eigene Projekte)?",
    varianten: {
      ehemalig: "Wie gut hat die Schule Eigeninitiative unterstützt (Schülervertretung, Schülerzeitung, eigene Projekte)?",
    },
  },
  { id: "F10", kategorie: "F", skala: "qualitaet", wertung: "direkt",
    text: "Wie bewertest du insgesamt das außerunterrichtliche Angebot und das Schulleben?",
    varianten: {
      ehemalig: "Wie bewertest du rückblickend insgesamt das außerunterrichtliche Angebot und das Schulleben?",
    },
  },
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
