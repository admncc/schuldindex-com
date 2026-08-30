/**
 * Die Mittelwerte der einzelnen Fragen einer Schule.
 *
 * Gerechnet wird bei jedem Aufruf, nicht fortgeschrieben. Das ist eine bewusste
 * Entscheidung gegen eine weitere Aggregattabelle: Es geht um die Antworten
 * **einer** Schule - bei der größten im Bestand sind das ein paar hundert
 * Zeilen, gemessen 1,9 ms über den Teilindex auf `bewertungen (schule_id)
 * where status = 'freigegeben'`. Eine Tabelle daneben müsste bei jeder
 * Freigabe, jeder Ablehnung und jeder Änderung mitgezogen werden; genau daran
 * hing der Fehler, den `aktualisiereAggregat` beheben musste.
 *
 * Ausgewertet wird nur die **aktuelle** Fassung jeder freigegebenen Bewertung.
 * Wer seine Bewertung ändert, soll nicht zweimal zählen.
 *
 * ## Warum in Blöcken gerechnet wird
 *
 * Der teuerste Fehler dieser Datei stand nicht darin, sondern fehlte: Eine
 * Auskunft, die sich bei **jeder** neuen Bewertung ändert, verrät die neue
 * Bewertung.
 *
 * Der Angriff braucht kein Wissen und keinen Zugang. Man ruft das Schulprofil
 * ab, wartet, ruft es wieder ab - die Zahl der Angaben sagt einem selbst, wann
 * sich etwas getan hat - und rechnet aus Mittelwert mal Anzahl vorher und
 * nachher die Antwort der neuen Person zurück. Je Frage. Gemessen war das bei
 * bis zu 24 vorhandenen Bewertungen in 100 % der Fälle eindeutig, bei 30 noch
 * in der Hälfte; die grösste Schule im Bestand hat 32. Es träfe auch die
 * beiden Fragen, um die es hier am meisten geht: „Wie häufig erlebst du
 * Mobbing …" steht in einer Pflichtkategorie und damit auf jedem sichtbaren
 * Profil.
 *
 * Die Antwort darauf ist nicht eine höhere Untergrenze - die schützt gegen zu
 * dünne Auskunft, nicht gegen den Vergleich zweier Auskünfte. Die Antwort ist,
 * dass die Auskunft **nicht bei jeder Bewertung weiterrückt**: Ausgewertet
 * werden immer nur volle Blöcke zu {@link BLOCKGROESSE}, die ältesten zuerst.
 * Zwischen zwei Blöcken ändert sich nichts, und wenn sich etwas ändert,
 * kommen fünf Personen auf einmal hinzu. Aus einer Differenz lässt sich dann
 * ihre Summe ablesen, aber keine einzelne Antwort.
 *
 * Der Preis: Die jüngsten bis zu vier Bewertungen sind in der Aufschlüsselung
 * noch nicht enthalten. In der Kategoriewertung und in der Gesamtzahl sind sie
 * es sehr wohl - dort geht es um einen Schnitt über elf Fragen, aus dem sich
 * keine einzelne Antwort zurückrechnen lässt.
 */

import { sql } from "./verbindung";
import { BLOCKGROESSE, type Frageangabe } from "../domain/fragewertung";

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
    with veroeffentlicht as (
      select v.antworten,
             row_number() over (order by b.erstellt_am, b.id) as lfd,
             count(*) over () as gesamt
      from bewertungen b
      join bewertung_versionen v
        on v.bewertung_id = b.id and v.version = b.aktuelle_version
      where b.schule_id = ${schuleId}
        and b.status = 'freigegeben'
    )
    select a.key as frage,
           avg((a.value #>> '{}')::numeric) as mittel,
           count(*)::int as anzahl
    from veroeffentlicht p
    cross join lateral jsonb_each(p.antworten) as a(key, value)
    -- Nur volle Bloecke, die aeltesten zuerst. Ganzzahlige Division.
    where p.lfd <= (p.gesamt / ${BLOCKGROESSE}) * ${BLOCKGROESSE}
      and jsonb_typeof(a.value) = 'number'
    group by a.key
  `;

  return zeilen.map((z) => ({ frage: z.frage, mittel: Number(z.mittel), anzahl: z.anzahl }));
}
