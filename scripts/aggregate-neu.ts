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
  // Nur Schulen mit freigegebenen Bewertungen: Für alle anderen gibt es nichts
  // zu rechnen, und 34.000 leere Durchläufe kosten nur Zeit.
  const schulen = await sql<{ id: string; name: string }[]>`
    select distinct s.id, s.name
    from schulen s
    join bewertungen b on b.schule_id = s.id and b.status = 'freigegeben'
    order by s.name
  `;

  console.error(`${schulen.length} Schulen mit freigegebenen Bewertungen.`);

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
