/**
 * Der Aufräumlauf an der echten Datenbank.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/aufraeumen.test.ts
 *
 * Prüft das, was an einer Aufbewahrungsfrist wirklich schiefgehen kann: dass sie
 * zu viel löscht. Der Kern ist die erste Zusicherung — ein stillgelegtes Konto
 * darf seine Bewertungen **nicht** mitnehmen.
 *
 * Die Testdaten tragen eine eigene Kennung und werden am Ende entfernt.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const URL = process.env["DATABASE_URL"] ?? "";
const vorhanden = URL !== "";
const KENNUNG = "aufraeum-test";

let sql: postgres.Sql;
let schuleId: string;

/**
 * Die angelegten Konten, mitgeführt.
 *
 * Nicht über den Kontakt-Hash zu finden: die Stilllegung löscht ihn — also
 * genau das Merkmal, an dem der erste Entwurf dieses Tests seine eigenen Daten
 * wiedererkannte. Übrig blieben Karteileichen, die einen anderen Test
 * durcheinanderbrachten.
 */
const angelegteKonten: string[] = [];

async function aufraeumenTestdaten(): Promise<void> {
  if (angelegteKonten.length > 0) {
    await sql`delete from konten where id = any(${angelegteKonten})`;
    angelegteKonten.length = 0;
  }
  await sql`delete from konten where kontakt_hash like ${KENNUNG + "%"}`;
  await sql`delete from meldungen where erlaeuterung like ${KENNUNG + "%"}`;
  await sql`delete from schulen where slug = ${KENNUNG}`;
}

beforeAll(async () => {
  if (!vorhanden) return;
  sql = postgres(URL, { onnotice: () => {} });
  await aufraeumenTestdaten();

  // Eine eigene Schule statt der ersten besten: der Durchstichtest zählt die
  // Bewertungen seiner Schule und schlug fehl, als hier Zeilen dazukamen.
  const [schule] = await sql<{ id: string }[]>`
    insert into schulen (quell_id, slug, name, bundesland, suchtext)
    values (${KENNUNG}, ${KENNUNG}, 'Testschule Aufräumlauf', 'HH', 'testschule aufraeumlauf')
    returning id
  `;
  schuleId = schule!.id;
}, 30_000);

afterAll(async () => {
  if (!vorhanden) return;
  await aufraeumenTestdaten();
  await sql.end();
});

/** Legt ein Konto samt Bewertung an, beide auf ein Alter in Tagen gesetzt. */
async function legeAn(name: string, alterTage: number, status = "freigegeben"): Promise<{ kontoId: string; bewertungId: string }> {
  const alt = `${alterTage} days`;
  const [konto] = await sql<{ id: string }[]>`
    insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, erstellt_am, letzte_anmeldung)
    values (decode('00','hex'), ${`${KENNUNG}-${name}`}, 'sms', now() - ${alt}::interval,
            now() - ${alt}::interval, now() - ${alt}::interval)
    returning id
  `;
  angelegteKonten.push(konto!.id);

  const [bewertung] = await sql<{ id: string }[]>`
    insert into bewertungen (schule_id, konto_id, rolle, status, erstellt_am, aktualisiert_am, moderiert_am, ablehnungsgrund)
    values (${schuleId}, ${konto!.id}, 'eltern', ${status}::bewertungsstatus,
            now() - ${alt}::interval, now() - ${alt}::interval,
            ${status === "abgelehnt" ? sql`now() - ${alt}::interval` : null},
            ${status === "abgelehnt" ? "Testgrund" : null})
    returning id
  `;
  await sql`
    insert into bewertung_versionen (bewertung_id, version, antworten, freitexte)
    values (${bewertung!.id}, 1, '{}'::jsonb, '{}'::jsonb)
  `;
  return { kontoId: konto!.id, bewertungId: bewertung!.id };
}

describe.skipIf(!vorhanden)("Aufräumlauf an der Datenbank", () => {
  it("legt ein ruhendes Konto still, ohne seine Bewertung zu löschen", async () => {
    // Die Zusicherung, an der die ganze Konstruktion hängt: die
    // Datenschutzerklärung verspricht beides — Konto weg nach 24 Monaten,
    // Bewertungen bleiben, solange sie veröffentlicht sind.
    const { kontoId, bewertungId } = await legeAn("ruhend", 800);
    const { raeumeAuf } = await import("../src/db/aufraeumen");

    await raeumeAuf(false);

    const [konto] = await sql<{ kontakt_hash: string | null; stillgelegt_am: Date | null }[]>`
      select kontakt_hash, stillgelegt_am from konten where id = ${kontoId}
    `;
    expect(konto?.stillgelegt_am).not.toBeNull();
    expect(konto?.kontakt_hash).toBeNull();

    const [bewertung] = await sql<{ status: string }[]>`
      select status::text as status from bewertungen where id = ${bewertungId}
    `;
    expect(bewertung?.status).toBe("freigegeben");
  }, 60_000);

  it("lässt ein Konto in Benutzung unberührt", async () => {
    const { kontoId } = await legeAn("frisch", 10);
    const { raeumeAuf } = await import("../src/db/aufraeumen");
    await raeumeAuf(false);

    const [konto] = await sql<{ stillgelegt_am: Date | null }[]>`
      select stillgelegt_am from konten where id = ${kontoId}
    `;
    expect(konto?.stillgelegt_am).toBeNull();
  }, 60_000);

  it("zählt eine Bewertung als Nutzung, auch ohne Anmeldung", async () => {
    // Wer bewertet und sich nie anmeldet, benutzt das Portal trotzdem.
    const [konto] = await sql<{ id: string }[]>`
      insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, erstellt_am, letzte_anmeldung)
      values (decode('00','hex'), ${`${KENNUNG}-nurbewertet`}, 'sms', now() - interval '800 days',
              now() - interval '800 days', null)
      returning id
    `;
    angelegteKonten.push(konto!.id);

    const [bewertung] = await sql<{ id: string }[]>`
      insert into bewertungen (schule_id, konto_id, rolle, status, erstellt_am, aktualisiert_am)
      values (${schuleId}, ${konto!.id}, 'eltern', 'freigegeben', now() - interval '800 days', now())
      returning id
    `;
    await sql`
      insert into bewertung_versionen (bewertung_id, version, antworten, freitexte)
      values (${bewertung!.id}, 1, '{}'::jsonb, '{}'::jsonb)
    `;

    const { raeumeAuf } = await import("../src/db/aufraeumen");
    await raeumeAuf(false);

    const [danach] = await sql<{ stillgelegt_am: Date | null }[]>`
      select stillgelegt_am from konten where id = ${konto!.id}
    `;
    expect(danach?.stillgelegt_am).toBeNull();
  }, 60_000);

  it("löscht eine alte abgelehnte Bewertung, eine junge nicht", async () => {
    const alt = await legeAn("abgelehnt-alt", 200, "abgelehnt");
    const jung = await legeAn("abgelehnt-jung", 30, "abgelehnt");

    const { raeumeAuf } = await import("../src/db/aufraeumen");
    await raeumeAuf(false);

    const [a] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${alt.bewertungId}`;
    const [j] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${jung.bewertungId}`;
    expect(a?.n).toBe(0);
    expect(j?.n).toBe(1);
  }, 60_000);

  it("löscht abgelaufene Token, aber keine gültigen", async () => {
    const { kontoId } = await legeAn("token", 5);
    await sql`
      insert into verifizierungstoken (konto_id, token_hash, zweck, gueltig_bis)
      values (${kontoId}, ${`${KENNUNG}-alt`}, 'bestaetigung', now() - interval '90 days'),
             (${kontoId}, ${`${KENNUNG}-neu`}, 'bestaetigung', now() + interval '1 day')
    `;

    const { raeumeAuf } = await import("../src/db/aufraeumen");
    await raeumeAuf(false);

    const [zeile] = await sql<{ n: number }[]>`
      select count(*)::int as n from verifizierungstoken where token_hash like ${KENNUNG + "%"}
    `;
    expect(zeile?.n).toBe(1);
  }, 60_000);

  it("leert alte Klickfolgen, ohne die Bewertung anzutasten", async () => {
    // Die Klickfolge ist die einzige Spalte, die für sich allein geleert wird.
    // Ginge dabei die Bewertung mit, wäre der Schaden erheblich und fiele erst
    // beim ersten scharfen Lauf auf.
    const alt = await legeAn("klickfolge-alt", 400);
    const jung = await legeAn("klickfolge-jung", 30);
    await sql`
      update bewertungen set klickfolge = ${sql.json([200, 300, 400] as never)}
      where id in (${alt.bewertungId}, ${jung.bewertungId})
    `;

    const { raeumeAuf } = await import("../src/db/aufraeumen");
    await raeumeAuf(false);

    const [a] = await sql<{ klickfolge: number[] | null; status: string }[]>`
      select klickfolge, status::text as status from bewertungen where id = ${alt.bewertungId}
    `;
    const [j] = await sql<{ klickfolge: number[] | null }[]>`
      select klickfolge from bewertungen where id = ${jung.bewertungId}
    `;
    expect(a?.klickfolge).toBeNull();
    expect(a?.status).toBe("freigegeben");
    expect(j?.klickfolge).toEqual([200, 300, 400]);
  }, 60_000);

  it("zählt im Trockenlauf, ohne zu löschen", async () => {
    const { bewertungId } = await legeAn("trocken", 200, "abgelehnt");
    const { raeumeAuf } = await import("../src/db/aufraeumen");

    const ergebnis = await raeumeAuf(true);
    expect(ergebnis.trocken).toBe(true);
    expect(ergebnis.bilanzen.find((b) => b.art === "abgelehnte_loeschen")?.betroffen).toBeGreaterThan(0);

    const [zeile] = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where id = ${bewertungId}`;
    expect(zeile?.n).toBe(1);
  }, 60_000);

  it("hinterlässt für jeden Lauf eine Spur", async () => {
    // Ein Lauf, der seit Monaten mit einem Fehler abbricht, wäre sonst von
    // einem, bei dem nichts fällig war, nicht zu unterscheiden.
    const { raeumeAuf, letzteLaeufe } = await import("../src/db/aufraeumen");
    await raeumeAuf(true);

    const laeufe = await letzteLaeufe(1);
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0]?.bilanz.length).toBeGreaterThan(0);
    expect(laeufe[0]?.dauer_ms).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
