/**
 * Nachprüfung der erzeugten Zusammenfassung.
 *
 * Das Modell bekommt Regeln, und es hält sie meistens ein. „Meistens“ genügt
 * hier nicht: was veröffentlicht wird, ist ab dem Moment **unser** Text - das
 * Haftungsprivileg für fremde Inhalte greift für eigene nicht (Entwicklungsplan,
 * Abschnitt 10.2). Deshalb prüft diese Datei die Ausgabe noch einmal mit
 * stumpfen, aber verlässlichen Mitteln.
 *
 * Der Grundsatz ist derselbe wie bei der Betrugsprüfung: **im Zweifel halten,
 * nie stillschweigend veröffentlichen.** Eine Zusammenfassung, die durchfällt,
 * wird nicht heimlich verworfen, sondern geht in die Moderation.
 */

export type Schwere = "blockierend" | "hinweis";

export interface Beanstandung {
  readonly regel: string;
  readonly schwere: Schwere;
  readonly fund: string;
}

/** Zwei bis vier Sätze - so steht es in Abschnitt 10.2. */
export const MIN_SAETZE = 2;
export const MAX_SAETZE = 4;
export const MAX_ZEICHEN = 700;

/**
 * Zählt Sätze.
 *
 * Absichtlich einfach gehalten und an den Fällen ausgerichtet, die in deutschen
 * Zusammenfassungen wirklich vorkommen: Abkürzungen wie „z. B.“ und „u. a.“
 * sowie Ordnungszahlen („in der 8. Klasse“) dürfen keinen Satz beenden.
 */
export function zaehleSaetze(text: string): number {
  const bereinigt = text
    .replace(/\b(z|u|d|o|i|s|ca|bzw|etc|inkl|evtl|ggf|max|min|Nr|Abs)\.\s*(B|a|h|Ä|S)?\./gi, "$1$2")
    // Ordnungszahl wie in „8. Klasse“: der Punkt gehört zur Zahl, nicht zum Satz.
    .replace(/\b(\d{1,2})\.(?=\s)/g, "$1");
  const treffer = bereinigt.match(/[.!?]+(\s|$)/g);
  return treffer === null ? (bereinigt.trim() === "" ? 0 : 1) : treffer.length;
}

interface Regel {
  readonly name: string;
  readonly schwere: Schwere;
  readonly muster: RegExp;
}

/**
 * Was nie in einer veröffentlichten Zusammenfassung stehen darf.
 *
 * Funktionsbezeichnungen stehen mit auf der Liste, und das ist der Punkt, an
 * dem die Prüfung schärfer ist, als sie auf den ersten Blick sein müsste: eine
 * Schule hat genau eine Schulleitung. „Die Schulleitung wird als unnahbar
 * beschrieben“ ist eine Aussage über eine bestimmte Person, auch ohne Namen.
 */
const REGELN: readonly Regel[] = [
  {
    name: "Anrede mit Namen",
    schwere: "blockierend",
    muster: /\b(Frau|Herr|Herrn)\s+[A-ZÄÖÜ][a-zäöüß]{2,}/,
  },
  {
    name: "Funktionsbezeichnung",
    schwere: "blockierend",
    muster:
      /\b(Schulleiter(in|s)?|Schulleitung|Rektor(in|s)?|Konrektor(in)?|Direktor(in|s)?|Hausmeister(in)?|Sekretärin|Sekretariat|Vertrauenslehrer(in)?)\b/i,
  },
  {
    name: "Klassen- oder Jahrgangsangabe",
    schwere: "blockierend",
    // „der 8b“, „Klasse 10a“, „Jahrgang 7“ - jede davon grenzt den Kreis der
    // gemeinten Personen so weit ein, dass er bestimmbar wird.
    muster: /\b(Klasse|Jahrgang|Kurs)\s*\d{1,2}\s*[a-f]?\b|\b\d{1,2}[a-f]\b/i,
  },
  {
    name: "Fach in Verbindung mit einer Lehrkraft",
    schwere: "blockierend",
    muster:
      /\b(Mathematik|Mathe|Deutsch|Englisch|Französisch|Latein|Physik|Chemie|Biologie|Sport|Kunst|Musik|Geschichte|Erdkunde|Religion|Informatik)[a-zäöüß]*lehr(er|erin|kraft)\b/i,
  },
  {
    name: "Internetadresse",
    schwere: "blockierend",
    muster: /https?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  },
  {
    name: "E-Mail-Adresse",
    schwere: "blockierend",
    muster: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  },
  {
    name: "Telefonnummer",
    schwere: "blockierend",
    muster: /(\+49|\b0)[\s/-]?\d{2,5}[\s/-]?\d{3,}/,
  },
  {
    name: "Beschimpfung",
    schwere: "blockierend",
    muster:
      /\b(idiot|idioten|arschloch|abschaum|hurensohn|wichser|missgeburt|schlampe|penner|vollpfosten)\w*\b/i,
  },
  {
    name: "Tatsachenbehauptung statt Meinungsbild",
    schwere: "hinweis",
    // Kein Ausschlussgrund, aber ein Grund hinzusehen: „An der Schule gibt es
    // Mobbing“ ist eine Behauptung, „Bewertende berichten von Mobbing“ nicht.
    muster: /\b(An der Schule (gibt es|herrscht|ist)|Die Schule (ist|hat) (nachweislich|eindeutig))\b/i,
  },
];

/** Formulierungen, an denen ein Meinungsbild erkennbar ist. */
const MEINUNGSBILD =
  /\b(berichte(n|t)|beschreib(en|t|ung)|schildern|nennen|genannt|kritisier(en|t)|lob(en|t)|bemängel(n|t)|empfinden|wird als|werden als|Bewertende|Rückmeldungen|Stimmen|wünschen sich|äußern)\b/i;

export interface Pruefkontext {
  /** Wie viele freigegebene Bewertungen mit Freitext zugrunde liegen. */
  readonly anzahlBewertungen: number;
  /** Selbstauskunft des Modells - ein Hinweis, keine Prüfung. */
  readonly enthaeltPersonenbezug?: boolean | undefined;
  readonly ausreichendDatenbasis?: boolean | undefined;
}

/** Mindestmenge aus Entscheidung 14: darunter wird nicht zusammengefasst. */
export const MINDESTZAHL_FREITEXTE = 10;

export function pruefeZusammenfassung(text: string, k: Pruefkontext): Beanstandung[] {
  const beanstandungen: Beanstandung[] = [];
  const sauber = text.trim();

  if (k.anzahlBewertungen < MINDESTZAHL_FREITEXTE) {
    beanstandungen.push({
      regel: "Mindestmenge",
      schwere: "blockierend",
      fund: `${k.anzahlBewertungen} statt ${MINDESTZAHL_FREITEXTE} Bewertungen mit Freitext`,
    });
  }

  for (const regel of REGELN) {
    const treffer = regel.muster.exec(sauber);
    if (treffer !== null) {
      beanstandungen.push({ regel: regel.name, schwere: regel.schwere, fund: treffer[0] });
    }
  }

  const saetze = zaehleSaetze(sauber);
  if (saetze < MIN_SAETZE || saetze > MAX_SAETZE) {
    beanstandungen.push({
      regel: "Länge",
      schwere: "blockierend",
      fund: `${saetze} Sätze statt ${MIN_SAETZE} bis ${MAX_SAETZE}`,
    });
  }
  if (sauber.length > MAX_ZEICHEN) {
    beanstandungen.push({
      regel: "Länge",
      schwere: "blockierend",
      fund: `${sauber.length} Zeichen (Grenze ${MAX_ZEICHEN})`,
    });
  }

  if (!MEINUNGSBILD.test(sauber)) {
    beanstandungen.push({
      regel: "Meinungsbild nicht erkennbar",
      schwere: "hinweis",
      fund: "keine Wendung wie „berichten“, „genannt“ oder „kritisiert“",
    });
  }

  // Die Selbstauskunft des Modells ersetzt keine Prüfung, aber sie zu ignorieren
  // wäre töricht: wenn es selbst sagt, dass Personen vorkommen, stimmt das meist.
  if (k.enthaeltPersonenbezug === true) {
    beanstandungen.push({
      regel: "Selbstauskunft Personenbezug",
      schwere: "blockierend",
      fund: "das Modell meldet einen Personenbezug",
    });
  }
  if (k.ausreichendDatenbasis === false) {
    beanstandungen.push({
      regel: "Selbstauskunft Datenbasis",
      schwere: "blockierend",
      fund: "das Modell hält die Grundlage für zu dünn",
    });
  }

  return beanstandungen;
}

export function darfVeroeffentlicht(beanstandungen: readonly Beanstandung[]): boolean {
  return !beanstandungen.some((b) => b.schwere === "blockierend");
}
