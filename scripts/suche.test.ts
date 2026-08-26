/**
 * Prüft die Suche an den echten Daten.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/suche.test.ts
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { autovervollstaendige, imUmkreis, suche, type SqlAusfuehrer } from "../src/db/schulsuche";

const URL = process.env.DATABASE_URL ?? "";
const vorhanden = URL !== "";

describe.skipIf(!vorhanden)("Schulsuche", () => {
  let verbindung: postgres.Sql;
  let sql: SqlAusfuehrer;

  beforeAll(() => {
    verbindung = postgres(URL, { onnotice: () => {} });
    sql = (<T>(text: string, werte: readonly unknown[]) =>
      verbindung.unsafe(text, werte as never[]) as unknown as Promise<T[]>) as SqlAusfuehrer;
  });
  afterAll(async () => {
    await verbindung.end();
  });

  describe("Autovervollständigung", () => {
    it("liefert Treffer schon nach wenigen Zeichen", async () => {
      const treffer = await autovervollstaendige(sql, "gymn");
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.every((t) => t.name.length > 0)).toBe(true);
    });

    it("stellt Präfixtreffer nach vorn", async () => {
      // Wer „gymn“ tippt, meint Gymnasien — nicht die „gymnasiale Oberstufe“
      // am Ende eines langen Namens.
      const treffer = await autovervollstaendige(sql, "gymnasium", {}, 5);
      expect(treffer[0]?.name.toLowerCase().startsWith("gymnasium")).toBe(true);
    });

    it("schweigt bei zu kurzer Eingabe", async () => {
      expect(await autovervollstaendige(sql, "g")).toEqual([]);
    });

    it("findet über die Postleitzahl", async () => {
      // Eine echte Postleitzahl aus dem Bestand nehmen statt eine ausgedachte:
      // 20095 gibt es in Hamburg, aber keine Schule trägt sie.
      const [zeile] = await sql<{ plz: string }>(
        "select plz from schulen where plz is not null group by plz order by count(*) desc limit 1",
        [],
      );
      const treffer = await autovervollstaendige(sql, zeile!.plz);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.some((t) => t.plz === zeile!.plz)).toBe(true);
    });
  });

  describe("Umlaute", () => {
    it("findet dieselbe Schule mit „ü“ und mit „ue“", async () => {
      const mitUmlaut = await suche(sql, "münchen gymnasium", {}, 50);
      const ausgeschrieben = await suche(sql, "muenchen gymnasium", {}, 50);
      expect(mitUmlaut.length).toBeGreaterThan(0);
      expect(ausgeschrieben.length).toBeGreaterThan(0);

      const gemeinsam = new Set(mitUmlaut.map((t) => t.id));
      const schnittmenge = ausgeschrieben.filter((t) => gemeinsam.has(t.id)).length;
      expect(schnittmenge).toBeGreaterThan(0);
    });

    it("findet „Straße“ auch als „Strasse“", async () => {
      const a = await suche(sql, "straßenschule", {}, 10);
      const b = await suche(sql, "strassenschule", {}, 10);
      // Beide Schreibweisen dürfen nicht unterschiedlich ins Leere laufen.
      expect(a.length === 0).toBe(b.length === 0);
    });
  });

  describe("Filter", () => {
    it("grenzt auf ein Bundesland ein", async () => {
      const treffer = await suche(sql, "gymnasium", { bundesland: "HH" }, 20);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.every((t) => t.bundesland === "HH")).toBe(true);
    });

    it("grenzt auf eine Schulart ein", async () => {
      const treffer = await suche(sql, "schule", { schulart: "grundschule" }, 20);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.every((t) => t.schularten.includes("grundschule"))).toBe(true);
    });

    it("grenzt auf einen Ort ein", async () => {
      const treffer = await suche(sql, "schule", { ort: "Kiel" }, 20);
      expect(treffer.length).toBeGreaterThan(0);
      expect(treffer.every((t) => (t.ort ?? "").toLowerCase().includes("kiel"))).toBe(true);
    });

    it("kombiniert mehrere Filter", async () => {
      const treffer = await suche(sql, "schule", { bundesland: "BY", schulart: "gymnasium" }, 20);
      expect(treffer.every((t) => t.bundesland === "BY" && t.schularten.includes("gymnasium"))).toBe(true);
    });
  });

  describe("Umkreissuche", () => {
    it("findet Schulen um das Hamburger Rathaus und sortiert nach Entfernung", async () => {
      const treffer = await imUmkreis(sql, 53.5503, 9.992, 3, {}, 20);
      expect(treffer.length).toBeGreaterThan(0);

      const entfernungen = treffer.map((t) => t.entfernungKm!);
      expect(entfernungen).toEqual([...entfernungen].sort((a, b) => a - b));
      expect(Math.max(...entfernungen)).toBeLessThanOrEqual(3);
    });

    it("hält den Umkreis auch an den Ecken des Suchkastens ein", async () => {
      // `earth_box` grenzt quadratisch ein und wäre an den Ecken zu großzügig;
      // die genaue Entfernungsprüfung muss das auffangen.
      const treffer = await imUmkreis(sql, 52.52, 13.405, 10, {}, 200);
      expect(treffer.every((t) => t.entfernungKm! <= 10)).toBe(true);
    });

    it("lässt sich mit Filtern kombinieren", async () => {
      const treffer = await imUmkreis(sql, 53.5503, 9.992, 10, { schulart: "gymnasium" }, 20);
      expect(treffer.every((t) => t.schularten.includes("gymnasium"))).toBe(true);
    });
  });
});
