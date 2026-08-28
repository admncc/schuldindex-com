/**
 * Erzeugung einer Freitext-Zusammenfassung.
 *
 * Der Ablauf, ohne Netz und ohne Datenbank: prüfen, ob genug Grundlage da ist →
 * Auftrag bauen → Modell fragen → Ausgabe nachprüfen → entscheiden, ob
 * veröffentlicht oder eskaliert wird.
 *
 * Das Modell kommt als Schnittstelle herein. Deshalb lässt sich hier auch das
 * prüfen, was bei einem echten Aufruf kaum herzustellen ist: das Modell fällt
 * auf eine eingeschleuste Anweisung herein, es nennt eine Lehrkraft beim Namen,
 * es antwortet gar nicht.
 */

import { baueBlock, SYSTEMANWEISUNG } from "./vorlage";
import {
  darfVeroeffentlicht,
  MINDESTZAHL_FREITEXTE,
  pruefeZusammenfassung,
  type Beanstandung,
} from "./pruefung";

/** Was das Modell zurückgibt (Structured Output, siehe `anthropic.ts`). */
export interface Rohzusammenfassung {
  readonly text: string;
  readonly positive_themen: readonly string[];
  readonly kritische_themen: readonly string[];
  readonly enthaelt_personenbezug: boolean;
  readonly ausreichend_datenbasis: boolean;
}

export interface Modell {
  /** `null`, wenn keine gültige Antwort zustande kam. */
  fasseZusammen(systemanweisung: string, block: string): Promise<Rohzusammenfassung | null>;
  /** Für das Protokoll: welches Modell geantwortet hat. */
  readonly bezeichnung: string;
}

export interface Auftrag {
  readonly texte: readonly string[];
  /** Zahl der freigegebenen Bewertungen mit Freitext - Grundlage der Mindestmenge. */
  readonly anzahlBewertungen: number;
}

export type Ergebnis =
  | {
      readonly status: "veroeffentlicht";
      readonly text: string;
      readonly positiveThemen: readonly string[];
      readonly kritischeThemen: readonly string[];
      readonly beanstandungen: readonly Beanstandung[]; // nur Hinweise
      readonly modell: string;
    }
  | {
      readonly status: "eskaliert";
      readonly text: string;
      readonly beanstandungen: readonly Beanstandung[];
      readonly modell: string;
    }
  | { readonly status: "zu_wenig_grundlage"; readonly anzahlBewertungen: number }
  | { readonly status: "fehlgeschlagen"; readonly grund: string };

/**
 * Fasst zusammen - oder eskaliert.
 *
 * Was hier **nicht** passiert: stillschweigend nichts veröffentlichen. Fällt
 * die Ausgabe durch die Nachprüfung, kommt sie mit ihren Beanstandungen zurück
 * und gehört in die Moderation. Sonst wäre eine Schule ohne Zusammenfassung
 * nicht von einer zu unterscheiden, bei der die Prüfung dreimal angeschlagen hat.
 */
export async function erzeugeZusammenfassung(auftrag: Auftrag, modell: Modell): Promise<Ergebnis> {
  if (auftrag.anzahlBewertungen < MINDESTZAHL_FREITEXTE) {
    return { status: "zu_wenig_grundlage", anzahlBewertungen: auftrag.anzahlBewertungen };
  }

  let roh: Rohzusammenfassung | null;
  try {
    roh = await modell.fasseZusammen(SYSTEMANWEISUNG, baueBlock(auftrag.texte));
  } catch (fehler) {
    return { status: "fehlgeschlagen", grund: fehler instanceof Error ? fehler.message : String(fehler) };
  }

  if (roh === null) {
    return { status: "fehlgeschlagen", grund: "Das Modell lieferte keine gültige Antwort." };
  }

  const beanstandungen = pruefeZusammenfassung(roh.text, {
    anzahlBewertungen: auftrag.anzahlBewertungen,
    enthaeltPersonenbezug: roh.enthaelt_personenbezug,
    ausreichendDatenbasis: roh.ausreichend_datenbasis,
  });

  if (!darfVeroeffentlicht(beanstandungen)) {
    return { status: "eskaliert", text: roh.text, beanstandungen, modell: modell.bezeichnung };
  }

  return {
    status: "veroeffentlicht",
    text: roh.text.trim(),
    positiveThemen: roh.positive_themen,
    kritischeThemen: roh.kritische_themen,
    beanstandungen,
    modell: modell.bezeichnung,
  };
}

/** Seit so vielen neuen Bewertungen lohnt eine Neuberechnung. */
export const NEUE_BEWERTUNGEN_BIS_NEUBERECHNUNG = 5;

/** Spätestens nach so vielen Tagen ohnehin. */
export const TAGE_BIS_NEUBERECHNUNG = 30;

export interface Stand {
  readonly anzahlMitFreitext: number;
  /** Stand der letzten erzeugten Zusammenfassung. `null`, wenn es keine gibt. */
  readonly zuletztAm: Date | null;
  readonly zuletztAusAnzahl: number | null;
}

/**
 * Ist eine neue Zusammenfassung fällig?
 *
 * Nicht bei jeder einzelnen Bewertung: eine Zusammenfassung aus 80 Texten
 * ändert sich durch die einundachtzigste nicht, und jeder Lauf kostet Geld.
 */
export function istFaellig(stand: Stand, jetzt = new Date()): boolean {
  if (stand.anzahlMitFreitext < MINDESTZAHL_FREITEXTE) return false;
  if (stand.zuletztAm === null || stand.zuletztAusAnzahl === null) return true;

  const neue = stand.anzahlMitFreitext - stand.zuletztAusAnzahl;
  if (neue >= NEUE_BEWERTUNGEN_BIS_NEUBERECHNUNG) return true;

  // Auch ohne neue Bewertungen altert der Text: Löschungen nach Art. 17 DSGVO
  // verkleinern die Grundlage, ohne dass die Zahl steigt.
  const tage = (jetzt.getTime() - stand.zuletztAm.getTime()) / (24 * 3600_000);
  return tage >= TAGE_BIS_NEUBERECHNUNG || neue < 0;
}

/** Die Kennzeichnung unter dem Text - Regel 6 aus Abschnitt 10.2. */
export function kennzeichnung(anzahl: number, stand: Date): string {
  const datum = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(stand);
  return `Automatisch aus ${anzahl.toLocaleString("de-DE")} Bewertungen zusammengefasst · Stand ${datum}.`;
}
