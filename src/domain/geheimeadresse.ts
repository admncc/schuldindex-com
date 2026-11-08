/**
 * Adressen, die ein Geheimnis in sich tragen.
 *
 * **Der Fund, der diese Datei nötig gemacht hat.** Eine Reichweitenmessung
 * schickt standardmäßig die vollständige Adresse der Seite an ihren Anbieter -
 * bei Google Analytics als `page_location`, mit Fragezeichen und allem, was
 * dahinter steht. Der Bestätigungslink des Portals lautet
 * `/bestaetigen?token=…`, und dieser Token ist das Geheimnis, mit dem sich eine
 * Bewertung freischalten lässt. Ein Messskript auf dieser Seite hätte ihn an
 * einen Dritten ausgeliefert, der ihn einlösen könnte - und zwar bevor die
 * Person ihn selbst benutzt hat.
 *
 * Der Weg, das zu verhindern, ist nicht ein Hinweis in der
 * Datenschutzerklärung und nicht eine Einstellung beim Anbieter. Es ist die
 * Entscheidung, auf solchen Seiten **nichts Fremdes zu laden**. Kein Banner,
 * keine Messung, nichts. Das kostet die Messung ein paar Seitenaufrufe; der
 * Bestätigungsschritt interessiert keinen Marketingbericht.
 *
 * Geprüft wird an einer Stelle - in `middleware.ts`, die jede öffentliche
 * Anfrage ohnehin sieht - und nicht in jeder Seite, weil die nächste Seite mit
 * einem Token in der Adresse sonst die eine wäre, die man vergisst.
 */

/**
 * Parameternamen, die ein Geheimnis tragen.
 *
 * Eine Positivliste der Geheimnisse, nicht der harmlosen Namen: Ein neuer
 * harmloser Parameter soll nicht stillschweigend dazu führen, dass nichts mehr
 * gemessen wird - ein neuer geheimer dagegen soll hier eingetragen werden
 * müssen, und das fällt beim Schreiben auf.
 */
const GEHEIME_PARAMETER: readonly string[] = [
  "token",
  "code",
  "schluessel",
  "geheim",
  "passwort",
  "auth",
];

/** Pfade, auf denen grundsätzlich nichts Fremdes läuft. */
const GEHEIME_PFADE: readonly string[] = ["/bestaetigen", "/konto/eintreten", "/schulsupport/eintreten"];

export const GEHEIMKOPFZEILE = "x-adresse-geheim";

export function adresseIstGeheim(pfad: string, parameter: URLSearchParams): boolean {
  if (GEHEIME_PFADE.some((p) => pfad === p || pfad.startsWith(`${p}/`))) return true;
  for (const name of parameter.keys()) {
    if (GEHEIME_PARAMETER.includes(name.toLowerCase())) return true;
  }
  return false;
}
