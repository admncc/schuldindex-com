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
import { normalisiere, type Rohschule, type Schule } from "../src/import/normalisiere";
import { vergebeSlugs } from "../src/import/slug";
import { fuehreZusammen, type Standort } from "../src/import/dubletten";

export interface Importbericht {
  gelesen: number;
  uebernommen: number;
  verworfen: Record<string, number>;
  ohneKoordinaten: number;
  koordinateRepariert: number;
  koordinateUnbrauchbar: number;
  koordinateFalschesLand: number;
  zusammengefuehrt: number;
}

export type Importschule = Schule & { slug: string; standorte: readonly Standort[] };

export function bereiteVor(rohdaten: readonly Rohschule[]): {
  schulen: Importschule[];
  bericht: Importbericht;
} {
  const bericht: Importbericht = {
    gelesen: rohdaten.length,
    uebernommen: 0,
    verworfen: {},
    ohneKoordinaten: 0,
    koordinateRepariert: 0,
    koordinateUnbrauchbar: 0,
    koordinateFalschesLand: 0,
    zusammengefuehrt: 0,
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
    if (ergebnis.schule.koordinatenbefund === "falsches_bundesland") bericht.koordinateFalschesLand++;
  }

  // Mehrfach gelieferte Schulen zusammenführen, bevor Slugs vergeben werden -
  // sonst bekämen Standorte derselben Schule unterschiedliche URLs.
  const zusammengefuehrt = fuehreZusammen(
    gueltig.map((s) => ({
      quellId: s.quellId,
      name: s.name,
      plz: s.plz,
      strasse: s.strasse,
      lat: s.lat,
      website: s.website,
      telefon: s.telefon,
      email: s.email,
      traeger: s.traeger,
      schule: s,
    })),
  );
  bericht.zusammengefuehrt = zusammengefuehrt.reduce((n, z) => n + z.aufgegangen.length, 0);
  const eindeutig = zusammengefuehrt.map((z) => ({
    ...z.haupt.schule,
    standorte: z.standorte,
  }));

  const slugs = vergebeSlugs(
    eindeutig.map((s) => ({ name: s.name, ort: s.ort, plz: s.plz, quellId: s.quellId })),
  );

  const schulen = eindeutig.map((s) => ({ ...s, slug: slugs.get(s.quellId)! }));
  bericht.uebernommen = schulen.length;
  return { schulen, bericht };
}

async function schreibe(sql: postgres.Sql, schulen: readonly Importschule[]) {
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
      standorte: sql.json(s.standorte as unknown as postgres.JSONValue),
    }));

    await sql`
      insert into schulen ${sql(teil)}
      -- Von Hand gepflegte Schulen bleiben, wie die Redaktion sie hinterlassen
      -- hat: Ohne diese Bedingung wäre jede Korrektur im Panel bis zum nächsten
      -- Import haltbar (Migration 0019).
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
        standorte         = excluded.standorte,
        quelle_stand      = excluded.quelle_stand,
        aktualisiert_am   = now()
      -- Koordinaten und Slug bleiben bewusst unangetastet: eine nachgeocodierte
      -- Koordinate ist wertvoller als das erneute Nichts aus der Quelle, und ein
      -- geänderter Slug bräche alle geteilten Links.
      where not schulen.manuell_gepflegt
    `;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quelle = process.env["SCHULEN_JSON"];
  if (!quelle) {
    console.error("SCHULEN_JSON ist nicht gesetzt - erwartet wird der Pfad zur Rohdatei.");
    process.exitCode = 1;
    throw new Error("SCHULEN_JSON fehlt");
  }
  const rohdaten: Rohschule[] = JSON.parse(readFileSync(quelle, "utf8"));
  const { schulen, bericht } = bereiteVor(rohdaten);

  const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
  try {
    await schreibe(sql, schulen);
    console.error(`  gelesen        ${bericht.gelesen}`);
    console.error(`  übernommen     ${bericht.uebernommen}`);
    console.error(`  ohne Koordinate ${bericht.ohneKoordinaten}`);
    console.error(`    davon unbrauchbar geliefert  ${bericht.koordinateUnbrauchbar}`);
    console.error(`    davon im falschen Bundesland ${bericht.koordinateFalschesLand}`);
    console.error(`  Koordinate repariert (vertauscht) ${bericht.koordinateRepariert}`);
    console.error(`  Dubletten zusammengefuehrt  ${bericht.zusammengefuehrt}`);
    for (const [grund, n] of Object.entries(bericht.verworfen)) {
      console.error(`  verworfen: ${grund.padEnd(32)} ${n}`);
    }
  } finally {
    await sql.end();
  }
}
