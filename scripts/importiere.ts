/**
 * Importiert den Schulbestand in die Datenbank.
 *
 *   SCHULEN_JSON=schulen.json DATABASE_URL=postgres://… npx tsx scripts/importiere.ts
 *
 * Der Lauf ist wiederholbar: bestehende Schulen werden über `quell_id`
 * aktualisiert, nicht doppelt angelegt. Slugs bleiben dabei erhalten, weil sie
 * aus den Daten der Schule abgeleitet und nicht durchgezählt werden.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { normalisiere, type Rohschule, type Schule } from "../src/import/normalisiere.js";
import { vergebeSlugs } from "../src/import/slug.js";

export interface Importbericht {
  gelesen: number;
  uebernommen: number;
  verworfen: Record<string, number>;
  ohneKoordinaten: number;
  koordinateRepariert: number;
  koordinateUnbrauchbar: number;
}

export function bereiteVor(rohdaten: readonly Rohschule[]): {
  schulen: Array<Schule & { slug: string }>;
  bericht: Importbericht;
} {
  const bericht: Importbericht = {
    gelesen: rohdaten.length,
    uebernommen: 0,
    verworfen: {},
    ohneKoordinaten: 0,
    koordinateRepariert: 0,
    koordinateUnbrauchbar: 0,
  };

  const gueltig: Schule[] = [];
  for (const roh of rohdaten) {
    const ergebnis = normalisiere(roh);
    if (!ergebnis.ok) {
      bericht.verworfen[ergebnis.grund] = (bericht.verworfen[ergebnis.grund] ?? 0) + 1;
      continue;
    }
    gueltig.push(ergebnis.schule);
    if (ergebnis.schule.lat === null) bericht.ohneKoordinaten++;
    if (ergebnis.schule.koordinatenbefund === "vertauscht") bericht.koordinateRepariert++;
    if (ergebnis.schule.koordinatenbefund === "unbrauchbar") bericht.koordinateUnbrauchbar++;
  }

  const slugs = vergebeSlugs(
    gueltig.map((s) => ({ name: s.name, ort: s.ort, plz: s.plz, quellId: s.quellId })),
  );

  const schulen = gueltig.map((s) => ({ ...s, slug: slugs.get(s.quellId)! }));
  bericht.uebernommen = schulen.length;
  return { schulen, bericht };
}

async function schreibe(sql: postgres.Sql, schulen: ReadonlyArray<Schule & { slug: string }>) {
  const STAPEL = 500;
  for (let i = 0; i < schulen.length; i += STAPEL) {
    const teil = schulen.slice(i, i + STAPEL).map((s) => ({
      quell_id: s.quellId,
      slug: s.slug,
      name: s.name,
      schularten: s.schularten as string[],
      schulart_original: s.schulartOriginal,
      bundesland: s.bundesland,
      strasse: s.strasse,
      plz: s.plz,
      ort: s.ort,
      traeger: s.traeger,
      website: s.website,
      telefon: s.telefon,
      email: s.email,
      lat: s.lat,
      lon: s.lon,
      genauigkeit: s.genauigkeit,
      suchtext: s.suchtext,
      quelle_stand: s.quelleStand,
    }));

    await sql`
      insert into schulen ${sql(teil)}
      on conflict (quell_id) do update set
        name              = excluded.name,
        schularten        = excluded.schularten,
        schulart_original = excluded.schulart_original,
        bundesland        = excluded.bundesland,
        strasse           = excluded.strasse,
        plz               = excluded.plz,
        ort               = excluded.ort,
        traeger           = excluded.traeger,
        website           = excluded.website,
        telefon           = excluded.telefon,
        email             = excluded.email,
        suchtext          = excluded.suchtext,
        quelle_stand      = excluded.quelle_stand,
        aktualisiert_am   = now()
      -- Koordinaten und Slug bleiben bewusst unangetastet: eine nachgeocodierte
      -- Koordinate ist wertvoller als das erneute Nichts aus der Quelle, und ein
      -- geänderter Slug bräche alle geteilten Links.
    `;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rohdaten: Rohschule[] = JSON.parse(readFileSync(process.env.SCHULEN_JSON!, "utf8"));
  const { schulen, bericht } = bereiteVor(rohdaten);

  const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
  try {
    await schreibe(sql, schulen);
    console.error(`  gelesen        ${bericht.gelesen}`);
    console.error(`  übernommen     ${bericht.uebernommen}`);
    console.error(`  ohne Koordinate ${bericht.ohneKoordinaten}`);
    console.error(`    davon unbrauchbar geliefert  ${bericht.koordinateUnbrauchbar}`);
    console.error(`  Koordinate repariert (vertauscht) ${bericht.koordinateRepariert}`);
    for (const [grund, n] of Object.entries(bericht.verworfen)) {
      console.error(`  verworfen: ${grund.padEnd(32)} ${n}`);
    }
  } finally {
    await sql.end();
  }
}
