/**
 * Prüfung einer Kennung, bevor sie in eine Abfrage geht.
 *
 * Die Kennungen des Portals sind UUIDs und stehen in `uuid`-Spalten. Kommt
 * etwas anderes an - ein abgeschnittener Link, ein manipuliertes Formularfeld,
 * ein Scanner -, antwortet Postgres mit `22P02 invalid input syntax for type
 * uuid`. Aus einer Anfrage nach einer Bewertung, die es nicht gibt, wird so ein
 * Serverfehler statt eines „nicht gefunden“, und im öffentlichen Bereich eine
 * unbehandelte Ausnahme mitten in einer Server Action.
 *
 * Die Prüfung gehört deshalb in die **erste Zeile** jeder Funktion, die eine
 * Kennung von außen entgegennimmt - nicht in die Oberfläche darüber, denn dort
 * wird sie vergessen. Genau das war der Fall: Zwei Stellen prüften, fünf nicht.
 */

/**
 * Das Muster ist bewusst großzügig (Hexziffern und Bindestriche in der
 * richtigen Länge) statt streng nach RFC: Es soll den Datenbankfehler
 * verhindern, nicht die Version der UUID beurteilen. Was durchkommt und es
 * trotzdem nicht gibt, endet ordentlich in „nicht gefunden“.
 */
const MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istKennung(wert: unknown): wert is string {
  return typeof wert === "string" && MUSTER.test(wert);
}
