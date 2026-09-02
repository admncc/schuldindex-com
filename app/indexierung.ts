/**
 * Darf das Portal in einen Suchindex?
 *
 * Die Frage hat einen konkreten Anlass. Ein Schulportal, das noch keine
 * Bestätigungsnachrichten verschicken kann, sammelt keine Bewertungen, sondern
 * Sackgassen: Wer abgibt, wartet auf eine Nachricht, die nie kommt. Solange
 * das so ist, richtet jede Besucherin aus einer Trefferliste mehr Schaden an
 * als Nutzen - sie verbraucht ihren einen Versuch und geht mit dem Eindruck,
 * die Seite sei kaputt.
 *
 * Deshalb ist die Freigabe eine ausdrückliche Angabe des Betreibers und keine
 * Voreinstellung. Fehlt sie, bleibt die Seite draußen. Das ist die richtige
 * Richtung für den Irrtum: Eine Seite, die zu spät in den Index kommt,
 * verliert ein paar Wochen Sichtbarkeit; eine, die zu früh hineingerät,
 * verliert die Menschen, die zuerst da waren, und mit ihnen den Ruf.
 *
 * Ein Wert wie `an` schaltet frei - bewusst kein `true`/`1`, damit in der
 * `.env` steht, was gemeint ist.
 */
export function darfIndexiert(): boolean {
  return (process.env["INDEXIERUNG"] ?? "").trim().toLowerCase() === "an";
}

/**
 * Die Adresse, unter der das Portal öffentlich erreichbar ist.
 *
 * Next braucht sie, um aus den relativen Adressen der Seiten absolute zu
 * machen: `canonical`, Open-Graph-Bilder, `alternates`. Ohne sie warnt der
 * Build und setzt `http://localhost:3000` ein - was in geteilten Links und in
 * der Vorschau von Messengern landet.
 */
export function basisadresse(): URL {
  const roh = (process.env["BASIS_URL"] ?? "").trim();
  try {
    return new URL(roh === "" ? "http://localhost:3000" : roh);
  } catch {
    // Eine unbrauchbare Angabe darf den Seitenaufbau nicht anhalten. Der
    // Fehler wäre sonst ein leerer Server statt einer falschen Adresse in
    // einer Vorschau.
    return new URL("http://localhost:3000");
  }
}
