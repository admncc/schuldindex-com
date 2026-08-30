/**
 * Wie riskant sieht eine Bewertung aus?
 *
 * Aus der Punktsumme der Betrugssignale wird eine von drei Stufen. Das ist
 * keine neue Prüfung, sondern eine Lesehilfe: Dieselben Punkte, die über das
 * Anhalten entscheiden, sollen in einer Liste mit zweihundert Zeilen sofort ins
 * Auge fallen.
 *
 * Die Stufen hängen an der eingestellten Halteschwelle, nicht an festen Zahlen -
 * sonst hieße „hohes Risiko“ nach jeder Änderung im Panel etwas anderes als das,
 * was das Portal tatsächlich anhält.
 *
 *  - **gering** - unter der Halteschwelle. Läuft durch.
 *  - **auffaellig** - ab der Halteschwelle. Wird angehalten und angesehen.
 *  - **hoch** - doppelte Halteschwelle. Mehrere schwere Signale zugleich; das
 *    ist der Fall, den man in einer langen Liste zuerst sehen will.
 *
 * Auch „hoch“ ist **kein Beweis**. Es ist der Grund, genau hinzusehen - die
 * Entscheidung trifft weiterhin ein Mensch, und die Begründung muss aus dem
 * Vorgang kommen, nicht aus der Farbe der Zeile.
 */

export type Risikostufe = "unbekannt" | "gering" | "auffaellig" | "hoch";

export const RISIKO_LABEL: Readonly<Record<Risikostufe, string>> = {
  // „Nicht gemessen“ ist etwas anderes als „unauffällig“. Bewertungen aus der
  // Zeit vor der Signalaufzeichnung trugen sonst eine grüne Plakette, die eine
  // Prüfung behauptete, die es nie gegeben hat.
  unbekannt: "nicht gemessen",
  gering: "unauffällig",
  auffaellig: "auffällig",
  hoch: "hohes Risiko",
};

export function risikostufe(punkte: number | null, halteschwelle: number): Risikostufe {
  if (punkte === null) return "unbekannt";
  if (punkte >= halteschwelle * 2) return "hoch";
  if (punkte >= halteschwelle) return "auffaellig";
  return "gering";
}

/** Für die Farbgebung: dieselben Klassen wie bei den Ampelstufen. */
export function risikoklasse(stufe: Risikostufe): string {
  if (stufe === "hoch") return "schlecht";
  if (stufe === "auffaellig") return "mittel";
  // Ohne Messung keine Farbe: neutral, nicht grün.
  return stufe === "unbekannt" ? "neutral" : "gut";
}
