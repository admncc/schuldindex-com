/**
 * Gerätekennung und Empfehlungskennung im Browser.
 *
 * Zwei Speicher nebeneinander, mit Absicht:
 *
 *  - **Cookie.** Geht bei jeder Anfrage automatisch mit, ist für den
 *    Empfehlungscode `httpOnly` und damit für Skripte auf der Seite
 *    unsichtbar. Das ist die verbindliche Quelle.
 *  - **Local Storage.** Übersteht, was Cookies nicht überstehen: Safari kappt
 *    von Skripten gesetzte Cookies nach sieben Tagen, Aufräumwerkzeuge löschen
 *    sie, und wer den Link in der App von Instagram öffnet und später im
 *    richtigen Browser bewertet, hat ohnehin zwei getrennte Cookiespeicher.
 *
 * **Was das nicht ist: ein Beweis.** Beides lässt sich in zehn Sekunden
 * zurücksetzen - privates Fenster, Website-Daten löschen, anderes Gerät. Die
 * Gerätekennung ist deshalb ein **Signal** mit kleinem Gewicht und niemals ein
 * Grund, jemanden abzuweisen. Sie fängt den bequemen Fall: zwanzig
 * Bewertungen aus demselben Browser.
 *
 * **Datenschutz.** Die Kennung ist Zufall und sagt nichts über die Person; sie
 * ist trotzdem ein personenbezogenes Merkmal und steht deshalb in der
 * Datenschutzerklärung. Gespeichert wird sie zur Missbrauchsabwehr - dem
 * Zweck, ohne den dieses Portal seine eigene Zusage nicht halten kann.
 */

export const GERAETECOOKIE = "schulindex_geraet";
export const GERAETESCHLUESSEL = "schulindex_uuid";
export const REFSCHLUESSEL = "schulindex_refuuid";

/** Wie lange die Gerätekennung gilt. Ein Jahr - danach ist sie ohne Aussage. */
export const GERAET_TAGE = 365;

/** Sieht das nach einer Kennung aus? Erwartet wird eine UUID v4. */
export function istGeraetekennung(wert: unknown): wert is string {
  return (
    typeof wert === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(wert)
  );
}

/**
 * Welche der beiden Kennungen gilt.
 *
 * Der Cookie hat Vorrang: Er kommt vom Server und ist für Skripte auf der
 * Seite nicht zu setzen. Der Wert aus dem Local Storage springt nur ein, wenn
 * der Cookie fehlt - und wird dann vom Server als Cookie neu gesetzt, damit
 * beide wieder gleich sind.
 */
export function gueltigeKennung(
  ausCookie: string | null | undefined,
  ausSpeicher: string | null | undefined,
): string | null {
  if (istGeraetekennung(ausCookie)) return ausCookie;
  if (istGeraetekennung(ausSpeicher)) return ausSpeicher;
  return null;
}
