/**
 * Rechnet die Schulaggregate neu.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/aggregate-neu.ts
 *
 * Nötig nach jeder Änderung, die in die Rechnung eingeht - allen voran nach
 * einer geänderten Kategoriegewichtung (`domain/fragebogen.ts`). Die Aggregate
 * werden sonst erst beim nächsten Freigeben einer Bewertung nachgezogen, und bis
 * dahin stünden auf den Schulprofilen Werte nach der alten Formel neben Werten
 * nach der neuen. Das fällt niemandem auf und ist trotzdem falsch.
 *
 * Der Lauf ist gefahrlos wiederholbar: Er rechnet nur aus dem, was gespeichert
 * ist, und löscht nichts.
 */

import postgres from "postgres";
import { aktualisiereAggregat } from "../src/db/aggregate";

const sql = postgres(process.env["DATABASE_URL"] ?? "", { onnotice: () => {} });

try {
  // Schulen mit freigegebenen Bewertungen **und** Schulen, die schon ein
  // Aggregat haben. Die zweite Hälfte ist nicht überflüssig: Wird die letzte
  // Bewertung einer Schule gelöscht oder abgelehnt, bleibt ihr altes Aggregat
  // stehen. Ohne diesen Lauf zeigte das Profil weiter „6,6 von 10 · 12
  // Bewertungen“, obwohl keine einzige mehr da ist. 34.000 leere Durchläufe
  // wären trotzdem verschwendet, deshalb nicht einfach alle Schulen.
  const schulen = await sql<{ id: string; name: string }[]>`
    select s.id, s.name
    from schulen s
    where exists (select 1 from bewertungen b where b.schule_id = s.id and b.status = 'freigegeben')
       or exists (select 1 from schul_aggregate a where a.schule_id = s.id)
    order by s.name
  `;

  console.error(`${schulen.length} Schulen mit Bewertungen oder bestehendem Aggregat.`);

  let fertig = 0;
  for (const schule of schulen) {
    await aktualisiereAggregat(schule.id);
    fertig += 1;
    if (fertig % 100 === 0) console.error(`  ${fertig} …`);
  }

  console.error(`Fertig: ${fertig} Aggregate neu berechnet.`);
} finally {
  await sql.end();
}
