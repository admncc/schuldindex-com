/**
 * Ratenbegrenzung im Arbeitsspeicher.
 *
 * Das Portal hatte keine: Ein Skript konnte `POST /api/bewertungen`,
 * `/inhalt-melden`, den Anmeldelink und die Schulzugangsanfrage beliebig oft
 * aufrufen. Jede dieser Anfragen legt einen Datensatz an oder verschickt eine
 * Nachricht - die Warteschlange läuft voll, und die Menschen dahinter arbeiten
 * an Müll.
 *
 * **Warum im Speicher und nicht in der Datenbank?** Weil der Zähler die
 * Absenderadresse braucht und die nirgends stehen bleiben darf (Entscheidung
 * E3). Ein Eintrag hier lebt bis zum Ende seines Zeitfensters und übersteht
 * keinen Neustart; das ist gewollt. Für einen zweiten Server müsste ein
 * gemeinsamer Speicher her - dann wäre der Schlüssel ein Hash der Adresse mit
 * einem Serverschlüssel, nie die Adresse selbst.
 *
 * **Was hier nicht hingehört:** Diese Drosselung ist kein Betrugssignal. Sie
 * begrenzt die Last, sie beurteilt keine Bewertung. Wer die Grenze erreicht,
 * bekommt „später noch einmal“ zu hören - und dieselbe Auskunft wie jeder
 * andere auch, damit sie nichts verrät.
 */

interface Fenster {
  /** Wann das Fenster begonnen hat, in Millisekunden. */
  start: number;
  anzahl: number;
}

const ZAEHLER = new Map<string, Fenster>();

/**
 * Wie viele Einträge höchstens im Speicher stehen.
 *
 * Ohne Obergrenze wäre die Drosselung selbst der Angriffspunkt: Ein Skript mit
 * wechselnden Adressen ließe die Karte wachsen, bis der Speicher voll ist.
 */
const HOECHSTZAHL_SCHLUESSEL = 20_000;

/** Entfernt abgelaufene Fenster - und im Notfall die Hälfte der Karte. */
function raeumeAuf(jetzt: number): void {
  for (const [schluessel, fenster] of ZAEHLER) {
    if (jetzt - fenster.start > 3_600_000) ZAEHLER.delete(schluessel);
  }
  if (ZAEHLER.size <= HOECHSTZAHL_SCHLUESSEL) return;
  let weg = ZAEHLER.size - HOECHSTZAHL_SCHLUESSEL / 2;
  for (const schluessel of ZAEHLER.keys()) {
    ZAEHLER.delete(schluessel);
    if (--weg <= 0) break;
  }
}

export interface Drosselergebnis {
  readonly erlaubt: boolean;
  /** Wie viele Anfragen im laufenden Fenster noch offen sind. */
  readonly verbleibend: number;
}

/**
 * Zählt eine Anfrage und sagt, ob sie noch erlaubt ist.
 *
 * `kennung` ist die Absenderadresse oder, wenn es keine gibt, ein fester Wert -
 * dann teilen sich alle dasselbe Kontingent, was ohne Proxy hinter dem Portal
 * die ehrlichste Annahme ist.
 */
export function zaehle(
  bereich: string,
  kennung: string | null,
  grenze: number,
  fensterMs: number,
  jetzt = Date.now(),
): Drosselergebnis {
  raeumeAuf(jetzt);

  const schluessel = `${bereich}:${kennung ?? "ohne-adresse"}`;
  const vorhanden = ZAEHLER.get(schluessel);

  if (vorhanden === undefined || jetzt - vorhanden.start >= fensterMs) {
    ZAEHLER.set(schluessel, { start: jetzt, anzahl: 1 });
    return { erlaubt: true, verbleibend: grenze - 1 };
  }

  vorhanden.anzahl += 1;
  return { erlaubt: vorhanden.anzahl <= grenze, verbleibend: Math.max(0, grenze - vorhanden.anzahl) };
}

/** Nur für Tests: setzt alle Zähler zurück. */
export function vergissAlles(): void {
  ZAEHLER.clear();
}
