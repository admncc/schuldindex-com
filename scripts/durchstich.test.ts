/**
 * Durchstich: echte Schulen, echte Bewertungen, echte Aggregation.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/durchstich.test.ts
 *
 * Prüft, was Unit-Tests nicht können: dass Schema, Domänenlogik und Datenbank
 * zusammenpassen. Die Testdaten werden am Ende wieder entfernt.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { FRAGEN, type Antwort, type Skalenwert } from "../src/domain/fragebogen.js";
import { bewerte } from "../src/domain/scoring.js";
import { aggregiere, type EinzelneBewertung } from "../src/domain/aggregation.js";
import { pruefeEinreichung } from "../src/domain/geopruefung.js";

const URL = process.env.DATABASE_URL ?? "";
const vorhanden = URL !== "";
const KENNUNG = "durchstich-test";

function antwortenMit(wert: Skalenwert, kategorien: readonly string[]): Record<string, Antwort> {
  const a: Record<string, Antwort> = {};
  for (const frage of FRAGEN) if (kategorien.includes(frage.kategorie)) a[frage.id] = wert;
  return a;
}

describe.skipIf(!vorhanden)("Durchstich", () => {
  let sql: postgres.Sql;
  let schuleId: string;
  let schule: { lat: number; lon: number; name: string };

  beforeAll(async () => {
    sql = postgres(URL, { onnotice: () => {} });
    const [gefunden] = await sql<{ id: string; lat: number; lon: number; name: string }[]>`
      select id, lat, lon, name from schulen where lat is not null limit 1
    `;
    schuleId = gefunden!.id;
    schule = gefunden!;
  });

  afterAll(async () => {
    await sql`delete from konten where kontakt_hash like ${KENNUNG + "%"}`;
    await sql.end();
  });

  it("legt Bewertungen an und rechnet sie zum Schulaggregat zusammen", async () => {
    const bewertungen: EinzelneBewertung[] = [];

    for (let i = 0; i < 12; i++) {
      const [konto] = await sql<{ id: string }[]>`
        insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am)
        values (${Buffer.from("test")}, ${`${KENNUNG}-${i}`}, 'whatsapp', now())
        returning id
      `;

      // Abwechselnd gute und mittelmäßige Bewertungen, jede zweite auch mit D.
      const wert: Skalenwert = i % 2 === 0 ? 5 : 3;
      const kategorien = i % 2 === 0 ? ["A", "B", "C"] : ["A", "B", "C", "D"];
      const antworten = antwortenMit(wert, kategorien);
      const ergebnis = bewerte(antworten);

      const [bewertung] = await sql<{ id: string }[]>`
        insert into bewertungen
          (schule_id, konto_id, rolle, klassenstufe, status,
           datenschutz_einwilligung_am, einwilligung_fassung, geo_entfernung_km)
        values (${schuleId}, ${konto!.id}, 'schueler_ab_16', 10, 'freigegeben',
                now(), 'v1', 12.5)
        returning id
      `;
      await sql`
        insert into bewertung_versionen
          (bewertung_id, version, antworten, freitexte, gesamtscore, aggressionsindex)
        values (${bewertung!.id}, 1, ${sql.json(antworten)}, ${sql.json({})},
                ${ergebnis.gesamtscore}, ${ergebnis.aggression?.index ?? null})
      `;

      bewertungen.push({
        ergebnis,
        rolle: "schueler_ab_16",
        hatFreitext: i < 10,
        erstelltAm: new Date(),
      });
    }

    const [zeile] = await sql<{ n: number }[]>`
      select count(*)::int as n from bewertungen
      where schule_id = ${schuleId} and status = 'freigegeben'
    `;
    expect(zeile?.n).toBe(12);

    const aggregat = aggregiere(bewertungen);
    expect(aggregat.anzahl).toBe(12);
    expect(aggregat.sichtbar).toBe(true);
    expect(aggregat.ranglistenfaehig).toBe(false); // 12 < 20
    expect(aggregat.zusammenfassungMoeglich).toBe(true); // 10 Freitexte
    expect(aggregat.gesamtscore).toBeGreaterThan(0);
    expect(aggregat.gesamtscore).toBeLessThanOrEqual(10);

    await sql`
      insert into schul_aggregate
        (schule_id, gesamtscore, aggressionsindex, anzahl, anzahl_je_rolle, anzahl_mit_freitext)
      values (${schuleId}, ${aggregat.gesamtscore}, ${aggregat.aggressionsindex},
              ${aggregat.anzahl}, ${sql.json(aggregat.anzahlJeRolle)}, ${aggregat.anzahlMitFreitext})
      on conflict (schule_id) do update set
        gesamtscore = excluded.gesamtscore, anzahl = excluded.anzahl
    `;
    const [gespeichert] = await sql<{ gesamtscore: string; anzahl: number }[]>`
      select gesamtscore, anzahl from schul_aggregate where schule_id = ${schuleId}
    `;
    expect(Number(gespeichert!.gesamtscore)).toBeCloseTo(aggregat.gesamtscore!, 2);
  });

  it("erzwingt eine Bewertung je Schule und Konto", async () => {
    const [konto] = await sql<{ id: string }[]>`
      insert into konten (kontakt_chiffre, kontakt_hash, kontaktart)
      values (${Buffer.from("x")}, ${`${KENNUNG}-doppelt`}, 'whatsapp') returning id
    `;
    const anlegen = () => sql`
      insert into bewertungen (schule_id, konto_id, rolle, status)
      values (${schuleId}, ${konto!.id}, 'eltern', 'freigegeben')
    `;
    await anlegen();
    await expect(anlegen()).rejects.toThrow(/eine_bewertung_je_schule/);
  });

  it("lässt unter 16-Jährige nicht ohne Elterneinwilligung zu", async () => {
    const [konto] = await sql<{ id: string }[]>`
      insert into konten (kontakt_chiffre, kontakt_hash, kontaktart)
      values (${Buffer.from("x")}, ${`${KENNUNG}-minderjaehrig`}, 'whatsapp') returning id
    `;
    await expect(sql`
      insert into bewertungen (schule_id, konto_id, rolle, klassenstufe, status)
      values (${schuleId}, ${konto!.id}, 'schueler_unter_16', 8, 'freigegeben')
    `).rejects.toThrow(/eltern_einwilligung_unter_16/);
  });

  it("verweigert eine Klassenstufe bei Rollen, die keine haben", async () => {
    const [konto] = await sql<{ id: string }[]>`
      insert into konten (kontakt_chiffre, kontakt_hash, kontaktart)
      values (${Buffer.from("x")}, ${`${KENNUNG}-rolle`}, 'whatsapp') returning id
    `;
    await expect(sql`
      insert into bewertungen (schule_id, konto_id, rolle, klassenstufe, status)
      values (${schuleId}, ${konto!.id}, 'lehrkraft', 9, 'freigegeben')
    `).rejects.toThrow(/klassenstufe_nur_bei_schuelern/);
  });

  it("prüft die Entfernung gegen eine echte Schule", async () => {
    // Nachbarschaft: gut einen Kilometer entfernt → geht durch.
    const nah = pruefeEinreichung({
      absender: { lat: schule.lat + 0.01, lon: schule.lon },
      schule,
    });
    expect(nah.haltenWegenEntfernung).toBe(false);
    expect(nah.entfernungKm).toBeLessThan(2);

    // Eine Schule am anderen Ende Deutschlands → in die Moderation.
    const [fern] = await sql<{ lat: number; lon: number }[]>`
      select lat, lon from schulen
      where lat is not null
      order by earth_distance(ll_to_earth(${schule.lat}, ${schule.lon}), ll_to_earth(lat, lon)) desc
      limit 1
    `;
    const weit = pruefeEinreichung({ absender: fern!, schule });
    expect(weit.haltenWegenEntfernung).toBe(true);
    expect(weit.entfernungKm).toBeGreaterThan(150);
  });
});
