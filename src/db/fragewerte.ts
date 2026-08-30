/**
 * Die Mittelwerte der einzelnen Fragen einer Schule.
 *
 * Gerechnet wird bei jedem Aufruf, nicht fortgeschrieben. Das ist eine bewusste
 * Entscheidung gegen eine weitere Aggregattabelle: Es geht um die Antworten
 * **einer** Schule - bei der größten im Bestand sind das ein paar hundert
 * Zeilen, und der Index auf `(schule_id, status)` holt sie in einem Zug. Eine
 * Tabelle daneben müsste bei jeder Freigabe, jeder Ablehnung und jeder
 * Änderung mitgezogen werden; genau daran hing der Fehler, den
 * `aktualisiereAggregat` beheben musste.
 *
 * Ausgewertet wird nur die **aktuelle** Fassung jeder freigegebenen Bewertung.
 * Wer seine Bewertung ändert, soll nicht zweimal zählen.
 */

import { sql } from "./verbindung";
import type { Frageangabe } from "../domain/fragewertung";

interface Zeile {
  frage: string;
  mittel: string;
  anzahl: number;
}

/**
 * Rohmittel und Zahl der Angaben je Frage.
 *
 * `jsonb_typeof(...) = 'number'` schließt „Kann ich nicht beurteilen" aus: Das
 * steht als Zeichenkette in den Antworten und ist keine Wertung, sondern deren
 * Verweigerung. Mitgezählt verschöbe es jeden Mittelwert Richtung Mitte.
 */
export async function frageMittelwerte(schuleId: string): Promise<readonly Frageangabe[]> {
  const zeilen = await sql<Zeile[]>`
    select a.key as frage,
           avg((a.value #>> '{}')::numeric) as mittel,
           count(*)::int as anzahl
    from bewertungen b
    join bewertung_versionen v
      on v.bewertung_id = b.id and v.version = b.aktuelle_version
    cross join lateral jsonb_each(v.antworten) as a(key, value)
    where b.schule_id = ${schuleId}
      and b.status = 'freigegeben'
      and jsonb_typeof(a.value) = 'number'
    group by a.key
  `;

  return zeilen.map((z) => ({ frage: z.frage, mittel: Number(z.mittel), anzahl: z.anzahl }));
}
