/**
 * Demodaten zählen und entfernen.
 *
 * Erzeugt werden sie von `scripts/demodaten.ts`, entfernt hier - und zwar über
 * die Kennzeichnung `ist_demo`, nie über Verdachtsmerkmale. Der Unterschied ist
 * der ganze Sinn der Spalte: Eine Löschung „alles mit erfundener Nummer“ oder
 * „alles aus diesem Zeitraum“ nähme früher oder später eine echte Bewertung mit,
 * und niemand käme dem auf die Spur.
 *
 * Nach dem Löschen werden die Aggregate der betroffenen Schulen neu gerechnet.
 * Ohne das stünden auf den Profilen weiterhin Scores, die auf gelöschten
 * Bewertungen beruhen - der Fehler, der beim Freigeben schon einmal auftrat.
 */

import { sql } from "./verbindung";
import { aktualisiereAggregat } from "./aggregate";

export interface Demobestand {
  readonly bewertungen: number;
  readonly konten: number;
  readonly schulen: number;
}

export async function zaehleDemodaten(): Promise<Demobestand> {
  const [zeile] = await sql<{ bewertungen: number; schulen: number; konten: number }[]>`
    select
      (select count(*)::int from bewertungen where ist_demo) as bewertungen,
      (select count(distinct schule_id)::int from bewertungen where ist_demo) as schulen,
      (select count(*)::int from konten where ist_demo) as konten
  `;
  return {
    bewertungen: zeile?.bewertungen ?? 0,
    konten: zeile?.konten ?? 0,
    schulen: zeile?.schulen ?? 0,
  };
}

/**
 * Entfernt alle Demodaten.
 *
 * Die betroffenen Schulen werden **vor** dem Löschen ermittelt - danach gibt es
 * keine Zeilen mehr, aus denen sich ablesen ließe, welche Aggregate falsch
 * geworden sind.
 */
export async function loescheDemodaten(moderatorId: string): Promise<Demobestand> {
  const schulen = await sql<{ schule_id: string }[]>`
    select distinct schule_id from bewertungen where ist_demo
  `;

  const geloescht = await sql.begin(async (tx) => {
    // Die Versionen hängen per Fremdschlüssel an der Bewertung und gehen mit;
    // dasselbe gilt für Bewertungen an einem Demokonto.
    const bewertungen = await tx`delete from bewertungen where ist_demo`;
    const konten = await tx`delete from konten where ist_demo`;

    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('aufbewahrung_ausgefuehrt', ${moderatorId}, '',
              ${`Demodaten entfernt: ${bewertungen.count} Bewertungen, ${konten.count} Konten`})
    `;

    return { bewertungen: bewertungen.count, konten: konten.count, schulen: schulen.length };
  });

  for (const { schule_id } of schulen) await aktualisiereAggregat(schule_id);

  return geloescht;
}
