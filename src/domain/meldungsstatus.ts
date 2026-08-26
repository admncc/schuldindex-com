/**
 * Zustände einer Meldung nach Art. 16 DSA.
 *
 * Klein, aber eigenständig: die Moderationsoberfläche und die Datenbankschicht
 * brauchen dieselben Bezeichnungen, und die Texte gehen an die meldende Person
 * hinaus.
 */

export const MELDESTATUS = ["eingegangen", "in_bearbeitung", "erledigt", "abgelehnt"] as const;

export type Meldestatus = (typeof MELDESTATUS)[number];

export const MELDESTATUS_LABEL: Readonly<Record<Meldestatus, string>> = {
  eingegangen: "Eingegangen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Inhalt entfernt",
  abgelehnt: "Kein Verstoß festgestellt",
};

/**
 * Was die meldende Person zur Entscheidung erfährt.
 *
 * Art. 16 Abs. 5 verlangt die Mitteilung der Entscheidung **und** den Hinweis
 * auf Rechtsbehelfe — deshalb steht der zweite Satz da, auch wenn er unbequem
 * ist: Er sagt der Person, wie sie gegen uns vorgehen kann.
 */
export const RECHTSBEHELFSHINWEIS =
  "Bist du mit dieser Entscheidung nicht einverstanden, kannst du sie innerhalb von sechs " +
  "Monaten bei uns überprüfen lassen, dich an eine anerkannte außergerichtliche " +
  "Streitbeilegungsstelle nach Art. 21 DSA wenden oder gerichtlich vorgehen.";
