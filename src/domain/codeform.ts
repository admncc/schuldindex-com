/**
 * Die Form des Bestätigungscodes - ohne Krypto, damit der Browser sie laden kann.
 *
 * **Warum getrennt von `bestaetigungscode.ts`.** Dort stehen Erzeugung und
 * Abdruck, und beide brauchen `node:crypto`. Das Eingabefeld im Browser
 * braucht nur zu wissen, wie viele Ziffern es sind und was als Eingabe zählt -
 * zöge es dafür das ganze Modul herein, scheiterte der Bau mit
 * „UnhandledSchemeError: node:crypto". Dieselbe Trennung gibt es aus demselben
 * Grund schon beim Diagnosetoken.
 */

export const CODE_STELLEN = 6;

/**
 * Räumt eine Eingabe auf, bevor sie geprüft wird.
 *
 * Leerzeichen und Bindestriche fliegen raus: Wer „043 912" tippt oder den Code
 * aus der Nachricht kopiert, hat ihn richtig - und soll nicht an einer
 * Formatfrage scheitern.
 */
export function normalisiereCode(wert: string): string {
  return wert.replace(/[^\d]/g, "");
}

export function istCodeform(wert: string): boolean {
  return new RegExp(`^\\d{${CODE_STELLEN}}$`).test(normalisiereCode(wert));
}
