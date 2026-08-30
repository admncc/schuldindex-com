/**
 * Die Wertung der einzelnen Fragen.
 *
 * Die Kategoriewertung sagt, dass es an einer Schule mit der Ausstattung
 * hapert. Sie sagt nicht, **woran** - ob am WLAN, an den Räumen oder an den
 * Toiletten. Genau das ist die Frage, mit der jemand auf ein Schulprofil kommt,
 * und sie steht in den Antworten längst drin: Jede Bewertung beantwortet die
 * Fragen einzeln, gespeichert wird jede einzeln, und bis hierher wurden sie nur
 * zu Kategoriemitteln zusammengezogen.
 *
 * Zwei Dinge, die diese Aufschlüsselung von einer bloßen Zahlenliste trennen:
 *
 *  - **Die Wertungsrichtung.** „Wie häufig erlebst du Mobbing?" ist invertiert:
 *    Rohwert 1 ist die beste Antwort. Ungedreht stünde an der sichersten Schule
 *    der niedrigste Balken - eine Anzeige, die das Gegenteil dessen behauptet,
 *    was die Daten sagen.
 *  - **Eine Untergrenze je Frage.** Die freiwilligen Bereiche beantwortet nur
 *    ein Teil der Bewertenden. Aus zwei Kreuzen einen Balken zu zeichnen, der
 *    neben einem aus dreißig steht, wäre eine Genauigkeit, die es nicht gibt.
 */

import {
  FRAGEN,
  type Frage,
  type KategorieId,
} from "./fragebogen";
import { aufZehnerskala } from "./scoring";

/**
 * Ab wie vielen Angaben eine einzelne Frage ausgewiesen wird.
 *
 * Niedriger als die Profilschwelle von zehn, und das mit Absicht: Die Schwelle
 * dort entscheidet, ob eine Schule überhaupt eine öffentliche Wertung bekommt.
 * Ist sie einmal überschritten, geht es hier nur noch um die Frage, ob eine
 * einzelne Zeile belastbar genug für einen Balken ist.
 */
export const MINDESTZAHL_FRAGE = 5;

/**
 * In welchen Schritten die Aufschlüsselung weiterrückt.
 *
 * Dieselbe Zahl wie die Untergrenze, und aus demselben Grund. Die Untergrenze
 * schützt gegen eine Auskunft aus zu dünner Basis; die Blockgrösse schützt
 * gegen den **Vergleich zweier Auskünfte**. Rückte die Aufschlüsselung bei
 * jeder einzelnen Bewertung weiter, liesse sich aus zwei Abrufen die Antwort
 * der dazwischen veröffentlichten Person zurückrechnen - je Frage, exakt.
 * Näheres in `db/fragewerte.ts`.
 */
export const BLOCKGROESSE = 5;

/** Was aus der Datenbank kommt: Rohmittel auf der Skala 1-5 je Frage-Kennung. */
export interface Frageangabe {
  readonly frage: string;
  readonly mittel: number;
  readonly anzahl: number;
}

/** Was angezeigt wird: der Wortlaut und der gedrehte Wert auf 0-10. */
export interface Fragewertung {
  readonly id: string;
  readonly text: string;
  readonly anzeige: number;
  readonly anzahl: number;
  /**
   * Läuft die Frage andersherum?
   *
   * Die Anzeige braucht das. „Wie häufig erlebst du Mobbing … ▇▇▇▇▇ 10,0" ist
   * gerechnet richtig und gelesen das Gegenteil: In einer Liste, in der jede
   * andere Zeile „Wie gut" oder „Wie sicher" fragt, liest sich die 10 als
   * höchste Häufigkeit. Ausgerechnet an den beiden folgenreichsten Zeilen.
   */
  readonly invertiert: boolean;
}

/** Der Rohwert in Wertungsrichtung - invertierte Fragen andersherum. */
export function gewertet(frage: Frage, mittel: number): number {
  return frage.wertung === "invertiert" ? 6 - mittel : mittel;
}

/**
 * Die auswertbaren Fragen einer Kategorie, in der Reihenfolge des Katalogs.
 *
 * Die Reihenfolge kommt aus `FRAGEN` und nicht aus den Daten: Sie ist dieselbe
 * wie im Fragebogen, und wer beides nebeneinanderlegt, findet sich wieder.
 */
export function fragewertungen(
  kategorie: KategorieId,
  angaben: readonly Frageangabe[],
): readonly Fragewertung[] {
  const nachId = new Map(angaben.map((a) => [a.frage, a]));

  return FRAGEN.filter((f) => f.kategorie === kategorie).flatMap((frage) => {
    const angabe = nachId.get(frage.id);
    if (angabe === undefined || angabe.anzahl < MINDESTZAHL_FRAGE) return [];
    return [
      {
        id: frage.id,
        text: frage.text,
        anzeige: aufZehnerskala(gewertet(frage, angabe.mittel)),
        anzahl: angabe.anzahl,
        invertiert: frage.wertung === "invertiert",
      },
    ];
  });
}

/** Wie viele Fragen der Kategorie es überhaupt gibt - für „x von y ausgewertet". */
export function fragenzahl(kategorie: KategorieId): number {
  return FRAGEN.filter((f) => f.kategorie === kategorie).length;
}
