/**
 * Durchstich der Verlosung: echte Datenbank, echte Ziehung, echte Empfehlungen.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/verlosung.test.ts
 *
 * **Warum es diese Datei gibt.** Am 30.08.2026 lief im Betrieb keine einzige
 * Ziehung mehr durch: Migration 0027 hatte die Eindeutigkeit an
 * `verlosungsgewinne` durch einen partiellen Index ersetzt, und die
 * `on conflict`-Klausel in `ziehen()` nannte dessen Prädikat nicht. Postgres
 * bricht das schon beim Planen ab. Zwei QA-Runden und über siebenhundert
 * Unit-Tests haben das nicht gefunden - und konnten es nicht, weil alle
 * Verlosungstests rein domänenseitig sind und niemand `ziehen()` je gegen
 * echtes SQL ausgeführt hat.
 *
 * Geprüft wird deshalb genau das, was Unit-Tests nicht können: dass die
 * Abfragen zum Schema passen, dass die drei Ziehungen unterschiedliche Töpfe
 * haben und dass die Missbrauchsabwehr in SQL dasselbe tut wie in der Domäne.
 *
 * Gezogen wird in einem Monat weit in der Vergangenheit, den kein echter Lauf
 * je anfasst; alles Angelegte wird am Ende wieder entfernt.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { teilnahmen, ziehen, gewinner, pruefeGespeicherteZiehung } from "../src/db/verlosung";
import { empfehlungsstand, empfehlungszahlen } from "../src/db/empfehlungen";
import { baueLose, monatszeitraum } from "../src/domain/verlosung";
import { GEWINNE } from "../src/domain/verlosungsgewinne";

const URL = process.env["DATABASE_URL"] ?? "";
const vorhanden = URL !== "";

/**
 * Der Monat, in dem gezogen wird: elf Monate zurück.
 *
 * Nicht weiter. Der erste Entwurf nahm März 2019 - „einen Monat, den kein
 * echter Lauf berührt" -, und genau das ging schief: `scripts/aufraeumen.test.ts`
 * lässt einen **echten** Aufräumlauf laufen, und der legt Konten still, deren
 * letzte Regung über zwei Jahre her ist (`kontakt_hash` wird geleert), und
 * löscht Empfehlungen, die älter als zwölf Monate sind. Beides traf die
 * Testdaten mitten im Lauf; danach fand das Aufräumen dieser Datei seine
 * eigenen Konten nicht mehr wieder, und der nächste Lauf zählte ein Los zu
 * viel. Elf Monate liegen innerhalb aller Fristen und trotzdem in keinem
 * Monat, für den je gezogen wurde.
 */
const HEUTE = new Date();
const RUECKBLICK = new Date(Date.UTC(HEUTE.getUTCFullYear(), HEUTE.getUTCMonth() - 11, 1));
const JAHR = RUECKBLICK.getUTCFullYear();
const MONAT = RUECKBLICK.getUTCMonth() + 1;
const ZEITRAUM = monatszeitraum(JAHR, MONAT);
const KENNUNG = "verlosung-durchstich";

describe.skipIf(!vorhanden)("Durchstich Verlosung", () => {
  let sql: postgres.Sql;
  let schuleId: string;
  let werber: string;
  let werberBewertung: string;
  /** Die Konten dieses Laufs - gegen sie wird geprüft, nicht gegen Gesamtzahlen. */
  const eigene: string[] = [];

  /** Legt Konto und teilnehmende, freigegebene Bewertung an. */
  async function teilnehmer(
    nr: number,
    optionen: { geraet?: string | null; freigegeben?: boolean } = {},
  ): Promise<{ kontoId: string; bewertungId: string }> {
    // Das Konto ist **frisch**, nur seine Bewertung liegt im Ziehungsmonat: Ein
    // Konto, dessen letzte Regung elf Monate her ist, wäre zwar nicht fällig,
    // aber die Grenze ist näher, als sie sein muss.
    const [konto] = await sql<{ id: string }[]>`
      insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, letzte_anmeldung)
      values (decode('00','hex'), ${`${KENNUNG}-${nr}`}, 'sms', now(), now())
      returning id
    `;
    const [bewertung] = await sql<{ id: string }[]>`
      insert into bewertungen (
        schule_id, konto_id, rolle, klassenstufe, status, verlosung_teilnahme,
        geraet_hash, datenschutz_einwilligung_am, einwilligung_fassung, erstellt_am
      ) values (
        ${schuleId}, ${konto!.id}, 'schueler_ab_16', 10,
        ${optionen.freigegeben === false ? "in_pruefung_betrug" : "freigegeben"}::bewertungsstatus,
        true, ${optionen.geraet === undefined ? `geraet-${nr}` : optionen.geraet},
        ${ZEITRAUM.von}, 'v1', ${ZEITRAUM.von}
      )
      returning id
    `;
    return { kontoId: konto!.id, bewertungId: bewertung!.id };
  }

  async function wirb(geworben: { kontoId: string; bewertungId: string }): Promise<void> {
    await sql`
      insert into empfehlungen (werber_konto_id, geworbenes_konto_id, bewertung_id, erstellt_am)
      values (${werber}, ${geworben.kontoId}, ${geworben.bewertungId}, ${ZEITRAUM.von})
    `;
  }

  beforeAll(async () => {
    sql = postgres(URL, { onnotice: () => {} });
    // Eine Schule ohne jede Bewertung, deterministisch gewählt: `limit 1` ohne
    // Sortierung traf dieselbe Schule wie `scripts/durchstich.test.ts`, und
    // dessen Zählung ging um diese Bewertungen daneben.
    const [schule] = await sql<{ id: string }[]>`
      select s.id from schulen s
      left join schul_aggregate a on a.schule_id = s.id
      where coalesce(a.anzahl, 0) = 0
      order by s.id desc limit 1
    `;
    schuleId = schule!.id;

    await aufraeumen();

    const w = await teilnehmer(0);
    werber = w.kontoId;
    werberBewertung = w.bewertungId;
    eigene.length = 0;
    eigene.push(werber);
  });

  /**
   * Räumt auf - auch, was seine Kennung verloren hat.
   *
   * Der Griff über die Bewertungen im Ziehungsmonat ist der wichtigere: Ein
   * stillgelegtes Konto trägt keinen `kontakt_hash` mehr, und ein Aufräumen,
   * das nur danach sucht, lässt genau die Zeilen stehen, die den nächsten Lauf
   * verfälschen.
   */
  async function aufraeumen(): Promise<void> {
    await sql`delete from verlosungen where jahr = ${JAHR} and monat = ${MONAT}`;
    await sql`
      delete from konten k
      where k.kontakt_hash like ${KENNUNG + "%"}
         or exists (
           select 1 from bewertungen b
           where b.konto_id = k.id
             and b.schule_id = ${schuleId}
             and b.erstellt_am >= ${ZEITRAUM.von} and b.erstellt_am < ${ZEITRAUM.bis}
         )
    `;
  }

  afterAll(async () => {
    await aufraeumen();
    await sql.end();
  });

  it("zieht wirklich - und schreibt die Gewinne fort", async () => {
    // Der Fehler, gegen den diese Datei geschrieben ist: `ziehen()` brach mit
    // 42P10 ab, die ganze Transaktion rollte zurück, und weil nie etwas in
    // `verlosungsgewinne` landete, griff der Ausschluss früherer Gewinner nie.
    for (let i = 1; i <= 4; i++) eigene.push((await teilnehmer(i)).kontoId);

    // **Zugehörigkeit prüfen, nicht die Gesamtzahl.** Der Ziehungsmonat liegt
    // elf Monate zurück, und in einem Testbestand mit Demodaten fallen dort
    // andere Teilnahmen hinein. Eine feste Zahl ginge daneben, sobald jemand
    // den Bestand neu erzeugt.
    const lose = baueLose(await teilnahmen(JAHR, MONAT, "normal"));
    const imTopf = new Set(lose.map((l) => l.kontoId));
    for (const k of eigene) expect(imTopf.has(k), k).toBe(true);

    const ergebnis = await ziehen(JAHR, MONAT, null, "normal");
    expect(ergebnis.ok).toBe(true);

    const gezogene = ergebnis.ok ? await gewinner(ergebnis.ziehung.id) : [];
    expect(gezogene.length).toBe(Math.min(GEWINNE.normal.anzahl, lose.length));
    // Ein Konto gewinnt in derselben Ziehung nur einmal.
    expect(new Set(gezogene.map((g) => g.kontoId)).size).toBe(gezogene.length);
  });

  it("rechnet die gespeicherte Ziehung nach", async () => {
    expect(await pruefeGespeicherteZiehung(JAHR, MONAT, "normal")).toBe("stimmt");
  });

  it("lässt keine zweite Ziehung desselben Monats zu", async () => {
    const zweite = await ziehen(JAHR, MONAT, null, "normal");
    expect(zweite.ok).toBe(false);
    expect(zweite.ok === false && zweite.grund).toBe("schon_gezogen");
  });

  it("nimmt frühere Gewinner der normalen Ziehung nicht wieder auf", async () => {
    // Erst jetzt prüfbar: Der Ausschluss liest `verlosungsgewinne`, und die
    // war vor dem Fehler von oben immer leer.
    const nachher = new Set((await teilnahmen(JAHR, MONAT, "normal")).map((t) => t.kontoId));
    for (const k of eigene) expect(nachher.has(k), k).toBe(false);
  });

  it("baut den Topf der Super-Ziehung aus den Empfehlungen, nicht aus den Bewertungen", async () => {
    // Ohne Empfehlung ist der Werber nicht dabei, obwohl er teilnimmt.
    const ohne = (await teilnahmen(JAHR, MONAT, "super")).map((t) => t.kontoId);
    expect(ohne).not.toContain(werber);

    await wirb(await teilnehmer(10));
    const mitEiner = await teilnahmen(JAHR, MONAT, "super");
    expect(mitEiner.map((t) => t.kontoId)).toContain(werber);
    // Genau ein Los je Konto, auch wenn der Werber mehrere Bewertungen hätte.
    const lose = baueLose(mitEiner);
    expect(lose.filter((l) => l.kontoId === werber).length).toBe(1);
  });

  it("zählt eine gehaltene Bewertung nicht als geworbene Person", async () => {
    const vorher = (await empfehlungsstand(werber, ZEITRAUM)).zaehlend;
    await wirb(await teilnehmer(11, { freigegeben: false }));

    const stand = await empfehlungsstand(werber, ZEITRAUM);
    expect(stand.geworben).toBe(vorher + 1);
    expect(stand.zaehlend).toBe(vorher);
  });

  it("zählt eine Empfehlung aus dem Browser des Werbers nicht", async () => {
    const vorher = (await empfehlungsstand(werber, ZEITRAUM)).zaehlend;
    const [eigenes] = await sql<{ geraet_hash: string }[]>`
      select geraet_hash from bewertungen where id = ${werberBewertung}
    `;
    await wirb(await teilnehmer(12, { geraet: eigenes!.geraet_hash }));

    expect((await empfehlungsstand(werber, ZEITRAUM)).zaehlend).toBe(vorher);
  });

  it("zählt eine Bewertung ohne Gerätekennung nicht", async () => {
    // Sie lässt sich herbeiführen, indem man das Gerätecookie weglässt - und
    // hob damit die Prüfung darüber ganz auf.
    const vorher = (await empfehlungsstand(werber, ZEITRAUM)).zaehlend;
    await wirb(await teilnehmer(13, { geraet: null }));

    expect((await empfehlungsstand(werber, ZEITRAUM)).zaehlend).toBe(vorher);
  });

  it("zählt höchstens zwei Empfehlungen je Browser", async () => {
    const vorher = (await empfehlungsstand(werber, ZEITRAUM)).zaehlend;
    for (const nr of [20, 21, 22, 23]) await wirb(await teilnehmer(nr, { geraet: "ein-laptop" }));

    // Vier geworben, zwei gezählt: der Weg, auf dem hundert Strohkonten aus
    // einem einzigen Browser in die Mega-Ziehung gekommen wären.
    const stand = await empfehlungsstand(werber, ZEITRAUM);
    expect(stand.geworben).toBe(vorher + 4 + 3); // die drei aus den Tests davor
    expect(stand.zaehlend).toBe(vorher + 2);
  });

  it("rechnet im Panel dieselbe Zahl wie am Konto", async () => {
    // Die drei Zahlen liefen einmal auseinander: Im Panel stand die Plakette
    // „Mega-Verlosung“ an einem Konto, das die Ziehung nicht aufnahm.
    const zahlen = await empfehlungszahlen(ZEITRAUM);
    const stand = await empfehlungsstand(werber, ZEITRAUM);
    expect(zahlen.zaehlend).toBeGreaterThanOrEqual(stand.zaehlend);
    expect(zahlen.werber).toBeGreaterThanOrEqual(1);

    // Und die Probe aufs Exempel: Ist der Werber der einzige im Monat, müssen
    // beide Zahlen gleich sein.
    if (zahlen.werber === 1) expect(zahlen.zaehlend).toBe(stand.zaehlend);
  });

  it("verlangt für die Mega-Ziehung die volle Schwelle", async () => {
    expect(GEWINNE.mega.mindestEmpfehlungen).toBeGreaterThan(1);
    const topf = (await teilnahmen(JAHR, MONAT, "mega")).map((t) => t.kontoId);
    expect(topf).not.toContain(werber);
  });
});
