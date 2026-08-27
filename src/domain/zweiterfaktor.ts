/**
 * Ist der zweite Faktor eingeschaltet?
 *
 * Eine einzige Stelle, an der die Umgebungsvariable gelesen wird — sonst
 * beantworten Anmeldeformular, Anmeldedienst und Hinweisleiste die Frage
 * womöglich verschieden, und das Formular verlangt einen Code, den niemand
 * prüft, oder umgekehrt.
 *
 * Vorgabe ist **an**. Ein vergessener Eintrag schaltet nichts ab; abgeschaltet
 * wird nur, wer `MODERATION_OHNE_2FA=1` ausdrücklich setzt.
 */
export function zweiterFaktorPflicht(): boolean {
  return process.env["MODERATION_OHNE_2FA"] !== "1";
}

/** Der Warnhinweis, wenn er aus ist — im Panel sichtbar, nicht nur im Log. */
export const OHNE_2FA_HINWEIS =
  "Zwei-Faktor-Anmeldung ist abgeschaltet (MODERATION_OHNE_2FA=1). " +
  "Dieses Panel entschlüsselt Kontaktdaten und gibt Bewertungen frei — " +
  "vor dem Echtbetrieb wieder einschalten.";
