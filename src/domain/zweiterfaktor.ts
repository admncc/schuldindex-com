/**
 * Ist der zweite Faktor eingeschaltet?
 *
 * Der Schalter steht in den Einstellungen und damit im Super-Admin-Panel
 * (`/moderation/einstellungen`, Gruppe „Zugang zur Moderation“) - nicht in einer
 * Umgebungsvariablen. Der Unterschied ist praktisch: Wer ihn umlegen will, muss
 * nicht auf den Server, und jede Änderung steht mit Person und Zeitpunkt im
 * Verlauf. Eine Zeile in einer `.env` steht nirgends.
 *
 * Eine einzige Stelle, an der die Frage beantwortet wird - sonst verlangt das
 * Anmeldeformular einen Code, den der Dienst nicht prüft, oder umgekehrt.
 *
 * **Stand 27.08.2026: aus**, auf Entscheidung des Auftraggebers für den
 * Testbetrieb. Vor dem Echtbetrieb einzuschalten; wozu das Panel Zugang gibt,
 * steht in der Hilfe der Einstellung.
 */

import { zahl, type Einstellungen } from "./einstellungen";

export function zweiterFaktorPflicht(einstellungen: Einstellungen): boolean {
  return zahl(einstellungen, "zweiter_faktor") === 1;
}

/** Der Warnhinweis, wenn er aus ist - im Panel sichtbar, nicht nur im Protokoll. */
export const OHNE_2FA_HINWEIS =
  "Zwei-Faktor-Anmeldung ist abgeschaltet. Dieses Panel entschlüsselt Kontaktdaten " +
  "und gibt Bewertungen frei - vor dem Echtbetrieb unter „Betrugserkennung“ wieder einschalten.";
