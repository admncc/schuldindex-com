/**
 * Hervorhebung des Suchbegriffs in einem Vorschlag.
 *
 * Die Autovervollständigung zeigt zehn Schulnamen, die einander oft ähneln
 * („Grundschule Am Park“, „Grundschule Am Parkring“). Wer sucht, will sehen,
 * *warum* ein Treffer da steht — deshalb wird die Fundstelle markiert.
 *
 * Zwei Fallstricke, die den ersten Entwurf unbrauchbar gemacht hätten:
 *
 *  - **Die Fundstelle muss nicht existieren.** Die Datenbank sucht über
 *    `suchtext`, der jeden Begriff zusätzlich in umlautbereinigter Schreibweise
 *    führt: „gruenewald“ findet „Grünewald“, im angezeigten Namen kommt der
 *    getippte Begriff aber gar nicht vor. Dann wird nichts markiert, statt zu
 *    raten.
 *  - **Kein regulärer Ausdruck aus Nutzereingabe.** Wer `(((` tippt, bekäme
 *    sonst einen Fehler statt einer Trefferliste.
 */

export interface Textstueck {
  readonly text: string;
  readonly treffer: boolean;
}

/**
 * Zerlegt einen Text an der ersten Fundstelle des Begriffs.
 *
 * Nur die erste: Ein Name, in dem „schule“ dreimal vorkommt, wird sonst zum
 * Flickenteppich, und für die Frage „warum steht das hier?“ genügt die erste
 * Stelle.
 */
export function zerlegeNachTreffer(text: string, begriff: string): readonly Textstueck[] {
  const gesucht = begriff.trim().toLowerCase();
  if (gesucht === "") return [{ text, treffer: false }];

  const stelle = text.toLowerCase().indexOf(gesucht);
  if (stelle === -1) return [{ text, treffer: false }];

  const stuecke: Textstueck[] = [];
  if (stelle > 0) stuecke.push({ text: text.slice(0, stelle), treffer: false });
  stuecke.push({ text: text.slice(stelle, stelle + gesucht.length), treffer: true });
  if (stelle + gesucht.length < text.length) {
    stuecke.push({ text: text.slice(stelle + gesucht.length), treffer: false });
  }
  return stuecke;
}

/** Die Zeile unter dem Namen: Ort, Postleitzahl, Schulart — was davon vorliegt. */
export function beiwerk(teile: readonly (string | null | undefined)[]): string {
  return teile.filter((t): t is string => !!t && t.trim() !== "").join(" · ");
}
