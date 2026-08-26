/**
 * Automatische Prüfungen vor der Freigabe einer Bewertung.
 *
 * Der Grundsatz: **jede Prüfung liefert ein Signal, keine Entscheidung.** Eine
 * auffällige Bewertung wird gehalten, nicht abgelehnt — über die Ablehnung
 * entscheidet ein Mensch. Automatisch abzulehnen hieße, echte Bewertungen
 * stillschweigend zu verlieren, und niemand käme dem auf die Spur.
 *
 * Umgekehrt gilt: mehrere schwache Signale zusammen wiegen schwerer als eines.
 * Deshalb ein Punktwert statt einer Kette von Wenn-Dann.
 */

import type { Antworten } from "./scoring";
import { FRAGEN, KEINE_ANGABE } from "./fragebogen";
import type { Geobefund } from "./geopruefung";

export type Signalart =
  | "entfernung"
  | "ort_unbekannt"
  | "zu_viele_von_einer_quelle"
  | "kontakt_mehrfach"
  | "nur_extremwerte"
  | "alles_gleich"
  | "zeitlich_gehaeuft"
  | "verdaechtiger_freitext"
  | "konto_per_email";

export interface Signal {
  readonly art: Signalart;
  /** 1 = Hinweis, 2 = auffällig, 3 = für sich genommen schon Grund zum Halten. */
  readonly gewicht: 1 | 2 | 3;
  readonly erlaeuterung: string;
}

/** Ab dieser Summe geht die Bewertung in die Moderation. */
export const HALTESCHWELLE = 3;

export interface Pruefkontext {
  readonly geo: Geobefund;
  readonly antworten: Antworten;
  /** Bewertungen von derselben Quelle in den letzten zehn Minuten. */
  readonly abgabenLetzteZehnMinuten: number;
  /** Verschiedene Schulen, die dieser Kontakt in den letzten 24 Stunden bewertet hat. */
  readonly schulenLetzte24Stunden: number;
  /** Bewertungen zu dieser Schule in der letzten Stunde, über alle Absender. */
  readonly bewertungenDieserSchuleLetzteStunde: number;
  /** Freitext hat die Vorprüfung nicht bestanden (Namen, Drohungen, Werbung). */
  readonly freitextAuffaellig: boolean;
  /** Konten per E-Mail sind billiger anzulegen als solche mit Telefonnummer. */
  readonly kontoPerEmail: boolean;
}

export interface Pruefergebnis {
  readonly signale: readonly Signal[];
  readonly punkte: number;
  readonly halten: boolean;
  /** Welcher Haltezustand — Geo hat Vorrang, weil er die klarste Begründung trägt. */
  readonly grund: "geo" | "betrug" | null;
}

/** Grenzwerte, im Betrieb nachziehbar. */
export const GRENZEN = {
  abgabenJeZehnMinuten: 5,
  schulenJeTag: 3,
  bewertungenJeSchuleUndStunde: 10,
} as const;

/**
 * Erkennt Antwortmuster, die auf unbedachtes Durchklicken oder eine Kampagne
 * hindeuten.
 *
 * Zwei Muster, bewusst getrennt:
 *
 *  - **Alles gleich** — jede Frage dieselbe Antwort. Häufig bei jemandem, der
 *    schnell fertig werden will, und bei koordinierten Abgaben.
 *  - **Nur Extremwerte** — ausschließlich 1 und 5, nichts dazwischen. Das gibt
 *    es bei echter Empörung, aber auch bei Manipulation.
 *
 * Beide sind für sich **kein Beweis**. Eine tatsächlich durchweg gute Schule
 * bekommt zu Recht überall Bestnoten. Deshalb tragen sie nur Gewicht 1 und 2 —
 * allein reichen sie nicht zum Halten.
 */
export function pruefeAntwortmuster(antworten: Antworten): Signal[] {
  const werte = FRAGEN.map((f) => antworten[f.id]).filter(
    (a): a is 1 | 2 | 3 | 4 | 5 => a !== undefined && a !== KEINE_ANGABE,
  );
  if (werte.length < 10) return [];

  const signale: Signal[] = [];
  const verschiedene = new Set(werte);

  if (verschiedene.size === 1) {
    signale.push({
      art: "alles_gleich",
      gewicht: 2,
      erlaeuterung: `alle ${werte.length} Antworten identisch`,
    });
  } else if ([...verschiedene].every((w) => w === 1 || w === 5)) {
    signale.push({
      art: "nur_extremwerte",
      gewicht: 1,
      erlaeuterung: "ausschließlich Bestnoten und schlechteste Noten",
    });
  }
  return signale;
}

export function pruefe(k: Pruefkontext): Pruefergebnis {
  const signale: Signal[] = [];

  if (k.geo.haltenWegenEntfernung) {
    signale.push({
      art: k.geo.unbekannt ? "ort_unbekannt" : "entfernung",
      gewicht: 3,
      erlaeuterung: k.geo.begruendung ?? "Entfernungsprüfung nicht bestanden",
    });
  }

  if (k.abgabenLetzteZehnMinuten > GRENZEN.abgabenJeZehnMinuten) {
    signale.push({
      art: "zu_viele_von_einer_quelle",
      gewicht: 3,
      erlaeuterung: `${k.abgabenLetzteZehnMinuten} Abgaben in zehn Minuten`,
    });
  }

  if (k.schulenLetzte24Stunden > GRENZEN.schulenJeTag) {
    // Wer an einem Tag fünf verschiedene Schulen bewertet, kennt sie kaum alle.
    signale.push({
      art: "kontakt_mehrfach",
      gewicht: 2,
      erlaeuterung: `${k.schulenLetzte24Stunden} verschiedene Schulen an einem Tag`,
    });
  }

  if (k.bewertungenDieserSchuleLetzteStunde > GRENZEN.bewertungenJeSchuleUndStunde) {
    // Kann auch eine Schulklasse im Unterricht sein — deshalb nur Gewicht 2.
    signale.push({
      art: "zeitlich_gehaeuft",
      gewicht: 2,
      erlaeuterung: `${k.bewertungenDieserSchuleLetzteStunde} Bewertungen dieser Schule in einer Stunde`,
    });
  }

  if (k.freitextAuffaellig) {
    signale.push({
      art: "verdaechtiger_freitext",
      gewicht: 3,
      erlaeuterung: "Freitext enthält Namen, Drohungen oder Werbung",
    });
  }

  if (k.kontoPerEmail) {
    // Kein Vorwurf, nur weniger Vertrauensvorschuss: eine E-Mail-Adresse ist in
    // Sekunden neu angelegt, eine Telefonnummer nicht (Entscheidung E6).
    signale.push({
      art: "konto_per_email",
      gewicht: 1,
      erlaeuterung: "Konto ohne verifizierte Telefonnummer",
    });
  }

  signale.push(...pruefeAntwortmuster(k.antworten));

  const punkte = signale.reduce((summe, s) => summe + s.gewicht, 0);
  const halten = punkte >= HALTESCHWELLE;
  const wegenGeo = signale.some((s) => s.art === "entfernung" || s.art === "ort_unbekannt");

  return {
    signale,
    punkte,
    halten,
    // Geo hat Vorrang: „zu weit entfernt“ lässt sich der bewertenden Person
    // erklären, „auffälliges Muster“ nicht, ohne die Prüfung zu verraten.
    grund: !halten ? null : wegenGeo ? "geo" : "betrug",
  };
}
