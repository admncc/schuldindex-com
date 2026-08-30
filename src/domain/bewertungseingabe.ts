/**
 * Prüfung einer eingereichten Bewertung.
 *
 * Bewusst getrennt vom Formular: dieselben Regeln müssen im Browser für die
 * sofortige Rückmeldung und auf dem Server für die Verbindlichkeit gelten. Ein
 * Formular lässt sich umgehen, diese Prüfung nicht.
 *
 * Die Datenbank hält dieselben Regeln noch einmal als Zusicherungen fest
 * (`0002_bewertungen.sql`). Doppelt geprüft ist hier richtig: das Formular
 * erklärt, die Prüfung entscheidet, die Datenbank verhindert.
 */

import {
  FRAGE_NACH_ID,
  KATEGORIEN,
  KEINE_ANGABE,
  fragenDerKategorie,
  type Ansprache,
  type Antwort,
  type KategorieId,
} from "./fragebogen";

export const ROLLEN = [
  "schueler_unter_16",
  "schueler_ab_16",
  "eltern",
  "lehrkraft",
  "ehemalig",
] as const;

export type Rolle = (typeof ROLLEN)[number];

export const ROLLE_LABEL: Readonly<Record<Rolle, string>> = {
  schueler_unter_16: "Schüler/in unter 16 Jahre",
  schueler_ab_16: "Schüler/in ab 16 Jahre",
  eltern: "Elternteil oder Erziehungsberechtigte:r",
  lehrkraft: "Lehrkraft oder Schulpersonal",
  ehemalig: "Ehemalige/r",
};

export const SCHUELERROLLEN: readonly Rolle[] = ["schueler_unter_16", "schueler_ab_16"];

export function istSchueler(rolle: Rolle): boolean {
  return SCHUELERROLLEN.includes(rolle);
}

/**
 * Welche Ansprache der Fragebogen für diese Rolle wählt.
 *
 * Beide Schülerrollen teilen sich eine Ansprache - der Unterschied zwischen
 * unter und ab 16 betrifft die Einwilligung, nicht die Frage. Ohne Rolle wird
 * die Schülerfassung gezeigt: Sie ist der kanonische Wortlaut, und im Formular
 * steht die Rollenwahl ohnehin vor der ersten Frage.
 */
export function ansprachefuer(rolle: Rolle | string | null): Ansprache {
  if (rolle === null) return "schueler";
  switch (rolle) {
    case "eltern":
      return "eltern";
    case "lehrkraft":
      return "lehrkraft";
    case "ehemalig":
      return "ehemalig";
    default:
      return "schueler";
  }
}

export type Kontaktart = "whatsapp" | "sms" | "email";

export interface Bewertungseingabe {
  readonly schulSlug: string;
  readonly rolle: Rolle | null;
  readonly klassenstufe: number | null;
  readonly abgangsjahr: number | null;
  readonly antworten: Readonly<Record<string, Antwort>>;
  readonly freitexte: Readonly<Partial<Record<KategorieId, string>>>;
  readonly kontaktart: Kontaktart | null;
  readonly kontakt: string;
  readonly datenschutzEinwilligung: boolean;
  readonly elternEinwilligung: boolean;
  readonly verlosungTeilnahme: boolean;
  /**
   * Wie lange das Formular offenstand, in Sekunden - **vom Server** aus dem
   * signierten Stempel errechnet, nicht vom Browser gemeldet
   * (`domain/formularstempel.ts`). Fehlt der Stempel oder ist er ungültig,
   * bleibt das Feld leer, und das Tempo-Signal entfällt.
   */
  readonly dauerSekunden?: number | null | undefined;
  /** Kam die Abgabe ohne gültigen Formularstempel an? Wird vom Server gesetzt. */
  readonly stempelFehlt?: boolean | undefined;
  /**
   * Abstände zwischen zwei Antwortklicks in Millisekunden, in der Reihenfolge
   * der Klicks. Kommen aus dem Browser und werden gegen `dauerSekunden`
   * plausibilisiert; gespeichert werden nur die drei Kennzahlen daraus
   * (`domain/klickmuster.ts`), nie die Folge selbst.
   */
  readonly klickabstaende?: readonly number[] | null | undefined;
}

/** Fehler mit dem Feld, zu dem er gehört - das Formular kann ihn dort anzeigen. */
export interface Eingabefehler {
  readonly feld: string;
  readonly meldung: string;
}

const JAHR_MIN = 1950;

/**
 * Prüft eine Telefonnummer grob auf Form.
 *
 * Absichtlich großzügig: Menschen schreiben Nummern mit Leerzeichen, Schrägstrich
 * oder Klammern. Wer hier zu streng prüft, weist echte Nummern ab - die
 * eigentliche Prüfung ist ohnehin, ob die Nachricht ankommt.
 */
export function sieht_aus_wie_telefonnummer(wert: string): boolean {
  const ziffern = wert.replace(/[^\d]/g, "");
  return ziffern.length >= 9 && ziffern.length <= 15;
}

export function sieht_aus_wie_email(wert: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(wert.trim());
}

/**
 * Zählt die beantworteten Fragen einer Kategorie.
 * „Kann ich nicht beurteilen“ zählt nicht mit - die Kategorie gilt damit nicht
 * als bearbeitet.
 */
export function beantwortet(kategorie: KategorieId, antworten: Bewertungseingabe["antworten"]): number {
  return fragenDerKategorie(kategorie).filter((f) => {
    const a = antworten[f.id];
    return a !== undefined && a !== KEINE_ANGABE;
  }).length;
}

/** Anteil beantworteter Fragen, für den Fortschrittsbalken im Formular. */
export function fortschritt(antworten: Bewertungseingabe["antworten"]): number {
  const pflicht = KATEGORIEN.filter((k) => k.pflicht);
  const gesamt = pflicht.reduce((n, k) => n + fragenDerKategorie(k.id).length, 0);
  const fertig = pflicht.reduce((n, k) => n + beantwortet(k.id, antworten), 0);
  return gesamt === 0 ? 1 : fertig / gesamt;
}

export interface Pruefoptionen {
  /**
   * Bei einer Änderung sind Kontakt und Einwilligung schon erteilt und stehen
   * gar nicht mehr im Formular. Sie noch einmal zu verlangen hieße, jemanden
   * bei jeder Korrektur erneut einwilligen zu lassen - und die Einwilligung
   * damit zur Formalität zu machen.
   */
  readonly kontaktNoetig?: boolean;
}

/** Höchstlänge eines Freitextes. Was länger ist, ist kein Kommentar mehr. */
export const FREITEXT_HOECHSTLAENGE = 2000;
/** Die längste E-Mail-Adresse nach RFC 5321. */
export const KONTAKT_HOECHSTLAENGE = 254;

/**
 * Ist das eine gültige Antwort auf eine Frage des Katalogs?
 *
 * Die Prüfung fehlte, und das war teuer: `antworten` kam als JSON aus dem
 * Browser, und **jeder** Wert außer `undefined` und „kann ich nicht
 * beurteilen“ zählte als beantwortet. Mit `D1 = 7` statt `5` sprang der
 * Gesamtscore auf glatte 10,0 - eine einzige Zahl, für die es sonst dreißig
 * zusätzliche Bestnoten gebraucht hätte. Die Datenbank fing nichts ab: 7 passt
 * in `numeric`, und 10,00 liegt im erlaubten Bereich.
 */
function istGueltigeAntwort(wert: unknown): wert is Antwort {
  if (wert === KEINE_ANGABE) return true;
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 1 && wert <= 5;
}

export function pruefeEingabe(
  e: Bewertungseingabe,
  jetzt = new Date(),
  optionen: Pruefoptionen = {},
): Eingabefehler[] {
  const kontaktNoetig = optionen.kontaktNoetig ?? true;
  const fehler: Eingabefehler[] = [];

  // **Vor allem anderen**: Sind Antworten und Freitexte überhaupt das, was sie
  // zu sein vorgeben? Alles Folgende rechnet mit ihnen.
  if (typeof e.antworten !== "object" || e.antworten === null || Array.isArray(e.antworten)) {
    fehler.push({ feld: "antworten", meldung: "Die Antworten sind unvollständig angekommen." });
    return fehler;
  }
  for (const [id, wert] of Object.entries(e.antworten)) {
    if (!FRAGE_NACH_ID.has(id)) {
      fehler.push({ feld: "antworten", meldung: "Die Antworten passen nicht zum Fragebogen." });
      break;
    }
    if (!istGueltigeAntwort(wert)) {
      fehler.push({ feld: "antworten", meldung: "Eine der Antworten liegt außerhalb der Skala." });
      break;
    }
  }

  if (typeof e.freitexte !== "object" || e.freitexte === null || Array.isArray(e.freitexte)) {
    fehler.push({ feld: "freitexte", meldung: "Die Anmerkungen sind unvollständig angekommen." });
    return fehler;
  }
  for (const [id, text] of Object.entries(e.freitexte)) {
    if (!KATEGORIEN.some((k) => k.id === id) || typeof text !== "string") {
      fehler.push({ feld: "freitexte", meldung: "Die Anmerkungen passen nicht zum Fragebogen." });
      break;
    }
    if (text.length > FREITEXT_HOECHSTLAENGE) {
      fehler.push({
        feld: `kategorie.${id}`,
        meldung: `Bitte fasse dich kürzer - höchstens ${FREITEXT_HOECHSTLAENGE} Zeichen.`,
      });
    }
  }

  if (typeof e.kontakt !== "string" || e.kontakt.length > KONTAKT_HOECHSTLAENGE) {
    fehler.push({ feld: "kontakt", meldung: "Diese Angabe können wir nicht annehmen." });
    return fehler;
  }

  if (e.klassenstufe !== null && !Number.isInteger(e.klassenstufe)) {
    // Ohne diese Zeile bestand „sieben“ die Prüfung: `"sieben" < 1` und
    // `"sieben" > 13` sind beide falsch.
    fehler.push({ feld: "klassenstufe", meldung: "Bitte wähle deine Klassenstufe." });
    return fehler;
  }
  if (e.abgangsjahr !== null && !Number.isInteger(e.abgangsjahr)) {
    fehler.push({ feld: "abgangsjahr", meldung: "Bitte gib ein Jahr an." });
    return fehler;
  }

  if (e.rolle === null) {
    fehler.push({ feld: "rolle", meldung: "Bitte gib an, in welcher Rolle du bewertest." });
    return fehler; // Ohne Rolle sind die Folgefelder nicht zu beurteilen.
  }

  if (istSchueler(e.rolle)) {
    if (e.klassenstufe === null) {
      fehler.push({ feld: "klassenstufe", meldung: "Bitte wähle deine Klassenstufe." });
    } else if (e.klassenstufe < 1 || e.klassenstufe > 13) {
      fehler.push({ feld: "klassenstufe", meldung: "Die Klassenstufe muss zwischen 1 und 13 liegen." });
    }
  } else if (e.klassenstufe !== null) {
    fehler.push({ feld: "klassenstufe", meldung: "Eine Klassenstufe gibt es nur für Schülerinnen und Schüler." });
  }

  if (e.rolle === "ehemalig") {
    const jahr = jetzt.getFullYear();
    if (e.abgangsjahr === null) {
      fehler.push({ feld: "abgangsjahr", meldung: "Bitte gib an, wann du die Schule verlassen hast." });
    } else if (e.abgangsjahr < JAHR_MIN || e.abgangsjahr > jahr) {
      fehler.push({ feld: "abgangsjahr", meldung: `Bitte gib ein Jahr zwischen ${JAHR_MIN} und ${jahr} an.` });
    }
  } else if (e.abgangsjahr !== null) {
    fehler.push({ feld: "abgangsjahr", meldung: "Ein Abgangsjahr gibt es nur für Ehemalige." });
  }

  // Entscheidung E11: unter 16 nur mit Einwilligung der Eltern.
  if (e.rolle === "schueler_unter_16" && !e.elternEinwilligung) {
    fehler.push({
      feld: "elternEinwilligung",
      meldung: "Ohne das Einverständnis deiner Eltern können wir die Bewertung nicht annehmen.",
    });
  }

  for (const kategorie of KATEGORIEN.filter((k) => k.pflicht)) {
    const fragen = fragenDerKategorie(kategorie.id).length;
    const fertig = beantwortet(kategorie.id, e.antworten);
    if (fertig < fragen) {
      fehler.push({
        feld: `kategorie.${kategorie.id}`,
        meldung: `In „${kategorie.titel}“ fehlen noch ${fragen - fertig} von ${fragen} Fragen.`,
      });
    }
  }

  if (!kontaktNoetig) {
    // Bei einer Änderung endet die Prüfung hier: was folgt, ist die Abgabe.
  } else if (e.kontaktart === null) {
    fehler.push({ feld: "kontaktart", meldung: "Bitte wähle, wie wir dich bestätigen sollen." });
  } else if (e.kontakt.trim() === "") {
    fehler.push({
      feld: "kontakt",
      meldung: e.kontaktart === "email" ? "Bitte gib deine E-Mail-Adresse an." : "Bitte gib deine Mobilnummer an.",
    });
  } else if (e.kontaktart === "email" && !sieht_aus_wie_email(e.kontakt)) {
    fehler.push({ feld: "kontakt", meldung: "Diese E-Mail-Adresse sieht nicht vollständig aus." });
  } else if (e.kontaktart !== "email" && !sieht_aus_wie_telefonnummer(e.kontakt)) {
    fehler.push({ feld: "kontakt", meldung: "Diese Mobilnummer sieht nicht vollständig aus." });
  }

  if (kontaktNoetig && !e.datenschutzEinwilligung) {
    fehler.push({
      feld: "datenschutzEinwilligung",
      meldung: "Ohne deine Einwilligung dürfen wir die Bewertung nicht verarbeiten.",
    });
  }

  // Entscheidung E9: Verlosung nur für Schülerrollen.
  if (e.verlosungTeilnahme && !istSchueler(e.rolle)) {
    fehler.push({
      feld: "verlosungTeilnahme",
      meldung: "An der Verlosung können nur Schülerinnen und Schüler teilnehmen.",
    });
  }

  return fehler;
}

export function istGueltig(e: Bewertungseingabe, jetzt = new Date()): boolean {
  return pruefeEingabe(e, jetzt).length === 0;
}

/** Prüfung einer Änderung: alles außer Kontakt und Einwilligung. */
export function pruefeAenderung(e: Bewertungseingabe, jetzt = new Date()): Eingabefehler[] {
  return pruefeEingabe(e, jetzt, { kontaktNoetig: false });
}
