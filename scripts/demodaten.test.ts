/**
 * Zählen und Löschen der Demodaten an der echten Datenbank.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/demodaten.test.ts
 *
 * Die eine Zusicherung, auf die es ankommt: Das Löschen nimmt **keine** echte
 * Bewertung mit. Deshalb legt der Test von beidem etwas an und sieht danach
 * nach, was übrig ist.
 *
 * **Der Test löscht den gesamten Demobestand.** Er ruft dieselbe Funktion auf
 * wie der Knopf im Panel, und die nimmt alles mit, was `ist_demo` trägt - auch
 * die 900 Bewertungen aus `scripts/demodaten.ts`.
 *
 * Deshalb läuft er nur auf ausdrückliche Aufforderung:
 *
 *   DEMODATEN_LOESCHTEST=1 DATABASE_URL=postgres://… npx vitest run scripts/demodaten.test.ts
 *
 * Ohne diese Angabe wird er übersprungen. Der Grund ist Erfahrung: Ein
 * gewöhnliches `npm test` gegen die Entwicklungsdatenbank räumte zweimal
 * hintereinander den ganzen Demobestand ab, und beide Male fiel es erst auf,
 * als Ranglisten und Karte leer waren. Ein Test, der als Nebenwirkung Daten
 * löscht, gehört nicht in den Standardlauf.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const URL = process.env["DATABASE_URL"] ?? "";
const vorhanden = URL !== "" && process.env["DEMODATEN_LOESCHTEST"] === "1";
const KENNUNG = "demotest";

let sql: postgres.Sql;
let schuleId: string;
let moderatorId: string;
const angelegteKonten: string[] = [];

async function raeumeTestdatenAuf(): Promise<void> {
  if (angelegteKonten.length > 0) {
    await sql`delete from konten where id = any(${angelegteKonten})`;
    angelegteKonten.length = 0;
  }
  await sql`delete from konten where kontakt_hash like ${KENNUNG + "%"}`;
  await sql`delete from moderationsprotokoll where moderator_id in (
              select id from moderatoren where kennung = ${KENNUNG})`;
  await sql`delete from moderatoren where kennung = ${KENNUNG}`;
  await sql`delete from schulen where slug = ${KENNUNG}`;
}

/** Legt eine Bewertung an - echt oder als Demo, sonst identisch. */
async function legeAn(name: string, demo: boolean): Promise<string> {
  const [konto] = await sql<{ id: string }[]>`
    insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, ist_demo)
    values (decode('00','hex'), ${`${KENNUNG}-${name}`}, 'sms', now(), ${demo})
    returning id
  `;
  angelegteKonten.push(konto!.id);

  const [bewertung] = await sql<{ id: string }[]>`
    insert into bewertungen (schule_id, konto_id, rolle, status, ist_demo)
    values (${schuleId}, ${konto!.id}, 'eltern', 'freigegeben', ${demo})
    returning id
  `;
  await sql`
    insert into bewertung_versionen (bewertung_id, version, antworten, freitexte)
    values (${bewertung!.id}, 1, '{}'::jsonb, '{}'::jsonb)
  `;
  return bewertung!.id;
}

beforeAll(async () => {
  if (!vorhanden) return;
  sql = postgres(URL, { onnotice: () => {} });
  await raeumeTestdatenAuf();

  const [schule] = await sql<{ id: string }[]>`
    insert into schulen (quell_id, slug, name, bundesland, suchtext)
    values (${KENNUNG}, ${KENNUNG}, 'Testschule Demodaten', 'HH', 'testschule demodaten')
    returning id
  `;
  schuleId = schule!.id;

  const [moderator] = await sql<{ id: string }[]>`
    insert into moderatoren (kennung, name, passwort_abdruck, totp_geheimnis, rolle)
    values (${KENNUNG}, 'Test Leitung', 'x', 'x', 'leitung')
    returning id
  `;
  moderatorId = moderator!.id;
}, 30_000);

afterAll(async () => {
  if (!vorhanden) return;
  await raeumeTestdatenAuf();
  await sql.end();
});

describe.skipIf(!vorhanden)("Demodaten", () => {
  it("löscht die Demobewertung und lässt die echte stehen", async () => {
    const echt = await legeAn("echt", false);
    const demo = await legeAn("demo", true);

    const { zaehleDemodaten, loescheDemodaten } = await import("../src/db/demodaten");

    const vorher = await zaehleDemodaten();
    expect(vorher.bewertungen).toBeGreaterThanOrEqual(1);

    await loescheDemodaten(moderatorId);

    const [demoDa] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${demo}`;
    const [echtDa] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${echt}`;
    expect(demoDa?.n).toBe(0);
    expect(echtDa?.n).toBe(1);

    // Auch das Demokonto ist weg, das echte nicht - sonst bleiben Karteileichen.
    const [konten] = await sql<{ demo: number; echt: number }[]>`
      select count(*) filter (where ist_demo)::int as demo,
             count(*) filter (where not ist_demo)::int as echt
      from konten where kontakt_hash like ${KENNUNG + "%"}
    `;
    expect(konten?.demo).toBe(0);
    expect(konten?.echt).toBe(1);
  }, 60_000);

  it("hält den Vorgang im Protokoll fest", async () => {
    await legeAn("protokoll", true);
    const { loescheDemodaten } = await import("../src/db/demodaten");
    await loescheDemodaten(moderatorId);

    const [eintrag] = await sql<{ begruendung: string }[]>`
      select begruendung from moderationsprotokoll
      where moderator_id = ${moderatorId} order by erstellt_am desc limit 1
    `;
    expect(eintrag?.begruendung).toContain("Demodaten entfernt");
  }, 60_000);

  it("meldet einen leeren Bestand, ohne etwas anzurichten", async () => {
    const { zaehleDemodaten, loescheDemodaten } = await import("../src/db/demodaten");
    const echt = await legeAn("nurecht", false);

    const bestand = await zaehleDemodaten();
    if (bestand.bewertungen === 0) {
      const ergebnis = await loescheDemodaten(moderatorId);
      expect(ergebnis.bewertungen).toBe(0);
    }

    const [da] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${echt}`;
    expect(da?.n).toBe(1);
  }, 60_000);
});
