/**
 * Aufbewahrungsfristen.
 *
 * Die Datenschutzerklärung nennt Fristen - und eine Frist, die niemand
 * ausführt, ist eine Zusage, die wir brechen. Deshalb stehen die Regeln hier
 * als Daten und nicht als Prosa: derselbe Katalog steuert den Aufräumlauf und
 * füllt die Tabelle in der Datenschutzerklärung. Sie können nicht
 * auseinanderlaufen, weil es nur eine Quelle gibt.
 *
 * Die schwierigste Regel ist die erste, und sie steht so nicht im Brief des
 * Auftraggebers: Ein Konto verfällt nach 24 Monaten Ruhe, **die Bewertungen
 * bleiben**. Beides zusammen geht nur, wenn das Konto nicht gelöscht, sondern
 * seines Kontakts entledigt wird - sonst nähme es über den Fremdschlüssel die
 * Bewertungen mit. Was übrig bleibt, ist ein Anker ohne Person: die Bewertung
 * ist weiter anonym veröffentlicht, aber niemand kann sich mehr auf sie berufen,
 * auch wir nicht.
 */

export type Aufbewahrungsart =
  | "konto_stilllegen"
  | "token_loeschen"
  | "sitzungen_loeschen"
  | "abgelehnte_loeschen"
  | "meldungen_loeschen"
  | "zugaenge_loeschen"
  | "empfehlungen_loeschen"
  | "klickfolgen_loeschen";

export interface Aufbewahrungsregel {
  readonly art: Aufbewahrungsart;
  /** Was betroffen ist - Wortlaut für die Datenschutzerklärung. */
  readonly gegenstand: string;
  readonly tage: number;
  /** Woran die Frist hängt. */
  readonly ab: string;
  readonly begruendung: string;
}

const MONAT = 30;

export const REGELN: readonly Aufbewahrungsregel[] = [
  {
    art: "konto_stilllegen",
    gegenstand: "Konto und Kontaktdaten",
    tage: 24 * MONAT,
    ab: "der letzten Nutzung",
    begruendung:
      "Der Kontakt wird gelöscht, das Konto bleibt ohne ihn bestehen. Die abgegebenen Bewertungen sind davon nicht betroffen - sie waren nie personenbezogen veröffentlicht.",
  },
  {
    art: "token_loeschen",
    gegenstand: "Bestätigungs- und Anmeldelinks",
    tage: MONAT,
    ab: "dem Ablauf",
    begruendung: "Nach Ablauf haben sie keinen Zweck mehr; gespeichert war ohnehin nur ihr Prüfwert.",
  },
  {
    art: "sitzungen_loeschen",
    gegenstand: "Abgelaufene Anmeldungen",
    tage: MONAT,
    ab: "dem Ablauf",
    begruendung: "Betrifft Konten, Moderation und Schulzugänge gleichermaßen.",
  },
  {
    art: "abgelehnte_loeschen",
    gegenstand: "Abgelehnte Bewertungen",
    tage: 6 * MONAT,
    ab: "der Entscheidung",
    begruendung:
      "So lange bleiben sie nachvollziehbar, falls jemand die Ablehnung beanstandet (Art. 17 DSA). Danach werden sie samt aller Fassungen gelöscht.",
  },
  {
    art: "meldungen_loeschen",
    gegenstand: "Meldungen nach Art. 16 DSA",
    tage: 6 * MONAT,
    ab: "der Entscheidung",
    begruendung: "Dieselbe Frist wie bei den abgelehnten Bewertungen - sie gehören zum selben Vorgang.",
  },
  {
    art: "zugaenge_loeschen",
    gegenstand: "Abgelehnte und abgelaufene Schulzugänge",
    tage: 6 * MONAT,
    ab: "der Entscheidung oder dem Ablauf",
    begruendung: "Aktive Zugänge bleiben unberührt, solange sie gelten.",
  },
  {
    art: "empfehlungen_loeschen",
    gegenstand: "Empfehlungen",
    tage: 12 * MONAT,
    ab: "der Empfehlung",
    begruendung:
      "Die Verbindung zwischen zwei Konten wird für die Ziehung des betreffenden Monats gebraucht und danach nur noch für den Fall, dass jemand die Zuteilung beanstandet - ein Jahr reicht dafür. Die Loslisten und Gewinne der Ziehungen bleiben unberührt: Sie tragen keine Verbindung zwischen zwei Menschen, sondern Kontokennungen, und ohne sie liesse sich keine Ziehung mehr nachrechnen.",
  },
  {
    art: "klickfolgen_loeschen",
    gegenstand: "Klickfolgen der Bewertungen",
    tage: 12 * MONAT,
    ab: "der Abgabe",
    begruendung:
      "Die Bewertung selbst bleibt vollständig erhalten; geleert wird nur die Folge der Klickabstände. Sie wird für die Kalibrierung der Betrugserkennung aufbewahrt, und dafür genügt ein Jahr - danach ist sie eine Verhaltensspur ohne Zweck.",
  },
];

export function regel(art: Aufbewahrungsart): Aufbewahrungsregel {
  const gefunden = REGELN.find((r) => r.art === art);
  if (gefunden === undefined) throw new Error(`Keine Aufbewahrungsregel für ${art}`);
  return gefunden;
}

/** Der Stichtag einer Regel: alles davor ist fällig. */
export function stichtag(art: Aufbewahrungsart, jetzt = new Date()): Date {
  return new Date(jetzt.getTime() - regel(art).tage * 24 * 3600_000);
}

/** „24 Monate“ statt „720 Tage“ - für die Anzeige. */
export function fristtext(tage: number): string {
  if (tage % MONAT === 0) {
    const monate = tage / MONAT;
    return monate === 1 ? "einem Monat" : `${monate} Monaten`;
  }
  return tage === 1 ? "einem Tag" : `${tage} Tagen`;
}

export interface Aufraeumbilanz {
  readonly art: Aufbewahrungsart;
  readonly betroffen: number;
}

/**
 * Was der Lauf gemeldet hat, in einem Satz.
 *
 * Ein Aufräumlauf, der schweigt, ist von einem, der nicht lief, nicht zu
 * unterscheiden - und das ist genau der Fehler, der jahrelang unbemerkt bleibt.
 */
export function laufbericht(bilanzen: readonly Aufraeumbilanz[]): string {
  const gesamt = bilanzen.reduce((n, b) => n + b.betroffen, 0);
  if (gesamt === 0) return "Nichts fällig.";
  return bilanzen
    .filter((b) => b.betroffen > 0)
    .map((b) => `${regel(b.art).gegenstand}: ${b.betroffen.toLocaleString("de-DE")}`)
    .join(" · ");
}
