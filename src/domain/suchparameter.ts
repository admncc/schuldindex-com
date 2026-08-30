/**
 * Ein Suchparameter kann doppelt vorkommen.
 *
 * `/schulen?q=abc&q=def` liefert in Next.js ein Array statt einer Zeichenkette.
 * Der Code darunter rief darauf `.trim()` auf - und aus einer harmlosen
 * doppelten Angabe in der Adresse wurde ein Serverfehler. Das ist kein
 * Sonderfall aus dem Labor: Er entsteht beim Zusammenkopieren von Links, in
 * Weiterleitungen und in jedem Werkzeug, das Parameter anhängt statt ersetzt.
 *
 * Genommen wird der **erste** Wert; die Adresse liest sich von links, und die
 * erste Angabe ist die, die jemand gemeint hat.
 */
export function einer(wert: string | string[] | undefined): string | undefined {
  if (Array.isArray(wert)) return wert[0];
  return wert;
}

/** Dasselbe mit leerer Zeichenkette statt `undefined` - spart das `?? ""`. */
export function text(wert: string | string[] | undefined): string {
  return einer(wert) ?? "";
}
