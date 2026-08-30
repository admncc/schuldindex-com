/**
 * Automatische Prüfungen vor der Freigabe einer Bewertung.
 *
 * Der Grundsatz: **jede Prüfung liefert ein Signal, keine Entscheidung.** Eine
 * auffällige Bewertung wird gehalten, nicht abgelehnt - über die Ablehnung
 * entscheidet ein Mensch. Automatisch abzulehnen hieße, echte Bewertungen
 * stillschweigend zu verlieren, und niemand käme dem auf die Spur.
 *
 * Umgekehrt gilt: mehrere schwache Signale zusammen wiegen schwerer als eines.
 * Deshalb ein Punktwert statt einer Kette von Wenn-Dann.
 */

import type { Antworten } from "./scoring";
import { FRAGEN, KEINE_ANGABE } from "./fragebogen";
import { VORGABEN, zahl, type Einstellungen } from "./einstellungen";
import { pruefeKlickmuster, type Klickauswertung } from "./klickmuster";
import type { Geobefund } from "./geopruefung";

export type Signalart =
  | "entfernung"
  | "zu_schnell"
  | "zu_schnell_geklickt"
  | "gleichmaessige_klicks"
  | "klickfolge_unplausibel"
  | "ohne_formularstempel"
  | "geraet_mehrfach"
  | "abweichung_vom_mittel"
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

/**
 * Ab dieser Summe geht die Bewertung in die Moderation.
 *
 * Der Vorgabewert; im Betrieb kommt die Zahl aus den Einstellungen
 * (`/moderation/einstellungen`). Er bleibt hier, weil die Tests und jede
 * Aufrufstelle ohne Datenbank damit auskommen müssen.
 */
export const HALTESCHWELLE = 3;

export interface Pruefkontext {
  readonly geo: Geobefund;
  readonly antworten: Antworten;
  /**
   * Wie lange das Formular offenstand - vom Server gemessen, nicht vom Browser
   * gemeldet (`domain/formularstempel.ts`). `null`, wenn kein gültiger Stempel
   * vorlag; dann entfällt das Signal, statt zu raten.
   */
  readonly dauerSekunden?: number | null | undefined;
  /**
   * Kam die Abgabe ohne gültigen Formularstempel an?
   *
   * Der Stempel wird beim Aufruf des Formulars ausgestellt und ist an die
   * Schule gebunden. Fehlt er, ist das kein Zufall: Ein Browser schickt ihn
   * immer mit. Vorher war sein Weglassen der einfachste Weg, die Tempoprüfung
   * und die Plausibilisierung der Klickfolge zugleich abzuschalten - beide
   * schweigen ohne gemessene Dauer.
   */
  readonly stempelFehlt?: boolean | undefined;
  /**
   * Der Gesamtscore dieser Bewertung und der bisherige Stand der Schule, beide
   * auf der Anzeigeskala 0–10. Ohne genug Bewertungen hat die Schule kein
   * Mittel, von dem jemand abweichen könnte.
   */
  readonly eigenerScore?: number | null | undefined;
  readonly schulmittel?: number | null | undefined;
  readonly schulAnzahl?: number | undefined;
  /**
   * Abstände zwischen den Antwortklicks in Millisekunden, aus dem Browser.
   * Werden gegen die vom Server gemessene Dauer plausibilisiert. Die Prüfung
   * selbst braucht nur Median und Streuung; gespeichert wird zusätzlich die
   * Folge (`dienste/bewertungAbgeben.ts`, Entscheidung vom 27.08.2026).
   */
  readonly klickabstaende?: readonly number[] | null | undefined;
  /**
   * Bewertungen aus demselben Browser in den letzten 24 Stunden.
   *
   * Klein gewichtet und mit Bedacht: In einer Familie, einem Computerraum oder
   * an einem geteilten Rechner ist das der Normalfall. Es soll auffallen, wenn
   * jemand zwanzig Bewertungen aus einem Fenster schreibt - nicht, wenn zwei
   * Geschwister dieselbe Schule bewerten.
   */
  readonly abgabenVonDiesemGeraet?: number | undefined;
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
  /** Welcher Haltezustand - Geo hat Vorrang, weil er die klarste Begründung trägt. */
  readonly grund: "geo" | "betrug" | null;
  /**
   * Die drei Kennzahlen aus dem Klickverhalten - das einzige, was davon
   * aufbewahrt wird. `null`, wenn nichts gemessen wurde oder die gemeldeten
   * Abstände nicht zur Serverzeit passten (`domain/klickmuster.ts`).
   */
  readonly klick: Klickauswertung | null;
}

/**
 * Grenzwerte als Vorgabe.
 *
 * Nachziehbar über `/moderation/einstellungen`; diese Werte gelten, solange dort
 * nichts anderes steht (siehe `domain/einstellungen.ts`).
 */
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
 *  - **Alles gleich** - jede Frage dieselbe Antwort. Häufig bei jemandem, der
 *    schnell fertig werden will, und bei koordinierten Abgaben.
 *  - **Nur Extremwerte** - ausschließlich 1 und 5, nichts dazwischen. Das gibt
 *    es bei echter Empörung, aber auch bei Manipulation.
 *
 * Beide sind für sich **kein Beweis**. Eine tatsächlich durchweg gute Schule
 * bekommt zu Recht überall Bestnoten. Deshalb tragen sie nur Gewicht 1 und 2 -
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

/**
 * Zählt die tatsächlich beantworteten Fragen.
 *
 * „Kann ich nicht beurteilen“ zählt mit: Es ist ein Klick wie jeder andere, und
 * für das Tempo geht es genau darum, wie viele Klicks in welcher Zeit fielen.
 */
function beantworteteFragen(antworten: Antworten): number {
  return FRAGEN.filter((f) => antworten[f.id] !== undefined).length;
}

/**
 * Zu schnell durchgeklickt.
 *
 * Die Dauer kommt vom Server (signierter Stempel), nicht aus dem Browser - sonst
 * schriebe jedes Skript, das den Fragebogen in zwei Sekunden ausfüllt, einfach
 * „acht Minuten“ in die Anfrage.
 */
export function pruefeTempo(
  dauerSekunden: number | null | undefined,
  antworten: Antworten,
  e: Einstellungen = VORGABEN,
): Signal[] {
  if (dauerSekunden === null || dauerSekunden === undefined) return [];

  const fragen = beantworteteFragen(antworten);
  if (fragen < zahl(e, "tempo_mindestfragen")) return [];

  const jeFrage = dauerSekunden / fragen;
  if (jeFrage >= zahl(e, "tempo_sekunden_je_frage")) return [];

  const gewicht = Math.min(3, Math.max(1, Math.round(zahl(e, "tempo_gewicht")))) as 1 | 2 | 3;
  return [
    {
      art: "zu_schnell",
      gewicht,
      erlaeuterung: `${fragen} Fragen in ${Math.round(dauerSekunden)} Sekunden - ${jeFrage.toFixed(1)} je Frage`,
    },
  ];
}

/**
 * Weit weg vom bisherigen Bild der Schule.
 *
 * Ausdrücklich **kein** Beweis für Missbrauch: Es kann die eine Person sein, die
 * etwas erlebt hat, das die anderen nicht sehen - genau die Bewertung, für die
 * es ein solches Portal gibt. Deshalb hält das Signal die Bewertung an, statt
 * sie abzulehnen, und deshalb wiegt es vorgabegemäß nur 1.
 */
export function pruefeAbweichung(
  eigenerScore: number | null | undefined,
  schulmittel: number | null | undefined,
  schulAnzahl: number,
  e: Einstellungen = VORGABEN,
): Signal[] {
  if (eigenerScore == null || schulmittel == null) return [];
  if (schulAnzahl < zahl(e, "abweichung_mindestbewertungen")) return [];

  const abstand = Math.abs(eigenerScore - schulmittel);
  if (abstand < zahl(e, "abweichung_punkte")) return [];

  const gewicht = Math.min(3, Math.max(1, Math.round(zahl(e, "abweichung_gewicht")))) as 1 | 2 | 3;
  const richtung = eigenerScore > schulmittel ? "über" : "unter";
  return [
    {
      art: "abweichung_vom_mittel",
      gewicht,
      erlaeuterung:
        `${abstand.toFixed(1)} Punkte ${richtung} dem Mittel dieser Schule ` +
        `(${eigenerScore.toFixed(1)} gegen ${schulmittel.toFixed(1)} aus ${schulAnzahl} Bewertungen)`,
    },
  ];
}

export function pruefe(k: Pruefkontext, e: Einstellungen = VORGABEN): Pruefergebnis {
  const signale: Signal[] = [];

  if (k.geo.haltenWegenEntfernung) {
    signale.push({
      art: k.geo.unbekannt ? "ort_unbekannt" : "entfernung",
      gewicht: 3,
      erlaeuterung: k.geo.begruendung ?? "Entfernungsprüfung nicht bestanden",
    });
  }

  if (k.abgabenLetzteZehnMinuten > zahl(e, "abgaben_je_zehn_minuten")) {
    signale.push({
      art: "zu_viele_von_einer_quelle",
      gewicht: 3,
      erlaeuterung: `${k.abgabenLetzteZehnMinuten} Abgaben in zehn Minuten`,
    });
  }

  if (k.schulenLetzte24Stunden > zahl(e, "schulen_je_tag")) {
    // Wer an einem Tag fünf verschiedene Schulen bewertet, kennt sie kaum alle.
    signale.push({
      art: "kontakt_mehrfach",
      gewicht: 2,
      erlaeuterung: `${k.schulenLetzte24Stunden} verschiedene Schulen an einem Tag`,
    });
  }

  if (k.bewertungenDieserSchuleLetzteStunde > zahl(e, "bewertungen_je_schule_und_stunde")) {
    // Kann auch eine Schulklasse im Unterricht sein - deshalb nur Gewicht 2.
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

  const vomGeraet = k.abgabenVonDiesemGeraet ?? 0;
  if (vomGeraet >= zahl(e, "geraet_hoechstzahl")) {
    signale.push({
      art: "geraet_mehrfach",
      gewicht: Math.min(3, Math.max(1, Math.round(zahl(e, "geraet_gewicht")))) as 1 | 2 | 3,
      erlaeuterung: `${vomGeraet} weitere Abgaben aus demselben Browser in 24 Stunden`,
    });
  }

  if (k.stempelFehlt === true) {
    signale.push({
      art: "ohne_formularstempel",
      gewicht: 2,
      erlaeuterung: "Abgabe ohne gültigen Formularstempel",
    });
  }

  signale.push(...pruefeAntwortmuster(k.antworten));
  signale.push(...pruefeTempo(k.dauerSekunden, k.antworten, e));
  const klick = pruefeKlickmuster(k.klickabstaende, k.dauerSekunden, e);
  signale.push(...klick.signale);
  signale.push(...pruefeAbweichung(k.eigenerScore, k.schulmittel, k.schulAnzahl ?? 0, e));

  const punkte = signale.reduce((summe, s) => summe + s.gewicht, 0);
  const halten = punkte >= zahl(e, "halteschwelle");
  const wegenGeo = signale.some((s) => s.art === "entfernung" || s.art === "ort_unbekannt");

  return {
    signale,
    punkte,
    halten,
    // Geo hat Vorrang: „zu weit entfernt“ lässt sich der bewertenden Person
    // erklären, „auffälliges Muster“ nicht, ohne die Prüfung zu verraten.
    grund: !halten ? null : wegenGeo ? "geo" : "betrug",
    klick: klick.auswertung,
  };
}


/**
 * Wie es nach der Bestätigung des Kontos weitergeht.
 *
 * Eine erste Bewertung wartet zunächst auf die Bestätigung des Kontos - der
 * Zustand `wartet_auf_verifizierung` sagt nichts darüber, ob sie auffällig war.
 * Die Signale sind zu diesem Zeitpunkt längst gespeichert; bei der Bestätigung
 * müssen sie **wieder gelesen** werden, sonst geht jede Erstabgabe ungeprüft
 * online - egal wie viele Punkte sie gesammelt hat. Genau das war hier einmal
 * der Fall.
 *
 * Gewertet wird gegen die **heutige** Halteschwelle, nicht gegen die von
 * gestern: Wird sie gesenkt, gilt die neue Regel auch für das, was noch wartet.
 */
export function ausloeserNachBestaetigung(
  signalpunkte: number | null,
  signale: readonly { readonly art: string }[],
  halteschwelle: number,
): "pruefung_bestanden" | "pruefung_geo" | "pruefung_betrug" {
  const punkte = signalpunkte ?? 0;
  if (punkte < halteschwelle) return "pruefung_bestanden";
  // Dieselbe Vorrangregel wie bei der Abgabe: „zu weit entfernt“ lässt sich
  // erklären, „auffälliges Muster“ nicht, ohne die Prüfung zu verraten.
  const wegenGeo = signale.some((s) => s.art === "entfernung" || s.art === "ort_unbekannt");
  return wegenGeo ? "pruefung_geo" : "pruefung_betrug";
}
