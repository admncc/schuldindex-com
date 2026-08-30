/**
 * Abgleich des gespeicherten Bestands gegen die Quellliste.
 *
 *   SCHULEN_JSON=schulen.json DATABASE_URL=postgres://… npx tsx scripts/abgleich.ts
 *
 * Der Import ist wiederholbar, aber er sagt nur, was er geschrieben hat - nicht,
 * was auseinandergelaufen ist. Diese Gegenprobe beantwortet drei Fragen:
 *
 *  1. **Fehlt etwas?** Schulen, die in der Quelle stehen und nicht im Bestand.
 *  2. **Ist etwas übrig?** Schulen im Bestand, die die Quelle nicht mehr kennt -
 *     Kandidaten für eine Stilllegung, keine Löschung.
 *  3. **Steht etwas doppelt?** Gleicher Name, gleiche Postleitzahl - dieselbe
 *     Regel wie beim Import (`src/import/dubletten.ts`).
 *
 * **Der Lauf ändert nichts.** Er liest und zählt. Was zu tun ist, entscheidet
 * ein Mensch im Panel unter „Schulen“.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { bereiteVor } from "./importiere";
import type { Rohschule } from "../src/import/normalisiere";

const quelle = process.env["SCHULEN_JSON"];
const datenbank = process.env["DATABASE_URL"];
if (!quelle || !datenbank) {
  console.error("SCHULEN_JSON und DATABASE_URL müssen gesetzt sein.");
  process.exitCode = 1;
  throw new Error("Umgebung unvollständig");
}

const rohdaten: Rohschule[] = JSON.parse(readFileSync(quelle, "utf8"));
const { schulen, bericht } = bereiteVor(rohdaten);

const sql = postgres(datenbank, { onnotice: () => {} });

try {
  const bestand = await sql<{ quell_id: string; ist_aktiv: boolean }[]>`
    select quell_id, ist_aktiv from schulen
  `;
  const imBestand = new Map(bestand.map((z) => [z.quell_id, z.ist_aktiv]));
  const inQuelle = new Set(schulen.map((s) => s.quellId));

  const fehlend = schulen.filter((s) => !imBestand.has(s.quellId));
  const stillgelegtObwohlInQuelle = schulen.filter((s) => imBestand.get(s.quellId) === false);
  const uebrig = bestand.filter((z) => z.ist_aktiv && !inQuelle.has(z.quell_id));

  const dubletten = await sql<{ name: string; plz: string | null; anzahl: number }[]>`
    select name, plz, count(*)::int as anzahl
    from schulen
    where ist_aktiv
    group by lower(regexp_replace(name, '\s+', ' ', 'g')), name, plz
    having count(*) > 1
    order by count(*) desc, name
    limit 20
  `;

  console.error("Quelle");
  console.error(`  Datensätze gelesen        ${bericht.gelesen}`);
  console.error(`  nach Zusammenführung      ${schulen.length}`);
  console.error(`  dabei zusammengeführt     ${bericht.gelesen - schulen.length}`);
  console.error("");
  console.error("Bestand");
  console.error(`  Zeilen gesamt             ${bestand.length}`);
  console.error(`  davon aktiv               ${bestand.filter((z) => z.ist_aktiv).length}`);
  console.error("");
  console.error("Abweichungen");
  console.error(`  in der Quelle, nicht im Bestand      ${fehlend.length}`);
  console.error(`  in der Quelle, aber stillgelegt      ${stillgelegtObwohlInQuelle.length}`);
  console.error(`  im Bestand, nicht mehr in der Quelle ${uebrig.length}`);
  console.error(`  Dublettengruppen (Name + PLZ)        ${dubletten.length}`);

  for (const s of fehlend.slice(0, 10)) {
    console.error(`    fehlt: ${s.name} (${s.plz ?? "ohne PLZ"}, ${s.quellId})`);
  }
  for (const d of dubletten.slice(0, 10)) {
    console.error(`    doppelt: ${d.name} (${d.plz ?? "ohne PLZ"}) - ${d.anzahl} Einträge`);
  }
} finally {
  await sql.end();
}
