/**
 * Jede Leseabfrage einmal gegen das echte Schema.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/abfragen.test.ts
 *
 * **Warum es diese Datei gibt.** Am 30.08.2026 lief im Betrieb keine einzige
 * Ziehung mehr durch, weil eine `on conflict`-Klausel das Prädikat ihres
 * partiellen Index nicht nannte - ein Fehler, den Postgres schon beim Planen
 * meldet und den kein Unit-Test finden kann. Zwei QA-Runden und über
 * siebenhundert Tests sind daran vorbeigelaufen.
 *
 * Der Grund war nicht Nachlässigkeit, sondern eine Lücke in der Aufstellung:
 * Die Domäne ist dicht geprüft, die Abfrageschicht war es nur dort, wo ein
 * Durchstich sie zufällig mitnahm. Diese Datei schliesst sie von der anderen
 * Seite - sie prüft **nichts Fachliches**, sondern nur, dass jede Abfrage
 * gegen das Schema läuft, das gerade da ist. Ein fehlender Spaltenname, ein
 * nicht nachgezogener Enum-Wert, eine Klausel, die zu keinem Index passt:
 * alles Fehler, die hier auffallen und sonst erst im Betrieb.
 *
 * Sie **verändert nichts** - keine Einfügung, keine Löschung. Wo eine Kennung
 * gebraucht wird, kommt sie aus dem Bestand oder ist eine ausgedachte UUID;
 * beides ist für die Frage, ob die Abfrage läuft, gleich gut.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

import * as analytik from "../src/db/analytik";
import * as einstellungen from "../src/db/einstellungen";
import * as empfehlungen from "../src/db/empfehlungen";
import * as fragewerte from "../src/db/fragewerte";
import * as geheimnisse from "../src/db/geheimnisse";
import * as karte from "../src/db/karte";
import * as konto from "../src/db/konto";
import * as meldungen from "../src/db/meldungen";
import * as moderation from "../src/db/moderation";
import * as ranglisten from "../src/db/ranglisten";
import * as schulen from "../src/db/schulen";
import * as schulsuche from "../src/db/schulsuche";
import * as schulverwaltung from "../src/db/schulverwaltung";
import * as schulzugang from "../src/db/schulzugang";
import * as verlosung from "../src/db/verlosung";
import * as vorschlaege from "../src/db/vorschlaege";
import * as zusammenfassungen from "../src/db/zusammenfassungen";
import * as demodaten from "../src/db/demodaten";
import * as aufraeumen from "../src/db/aufraeumen";
import { sql } from "../src/db/verbindung";
import type { SqlAusfuehrer } from "../src/db/schulsuche";
import { letzterMonat, monatszeitraum } from "../src/domain/verlosung";

const URL = process.env["DATABASE_URL"] ?? "";
const vorhanden = URL !== "";

/** Eine Kennung, die es garantiert nicht gibt - die Abfrage läuft trotzdem. */
const NIRGENDS = "00000000-0000-4000-8000-000000000000";

/** Wie in `db/vorschlaege.ts`: die Abfragen der Suche nehmen einen Ausführer. */
const ausfuehrer = (<T>(text: string, werte: readonly unknown[]) =>
  sql.unsafe(text, werte as never[]) as unknown as Promise<T[]>) as SqlAusfuehrer;

/**
 * Eine Sucheingabe mit den Zeichen, die `like` besonders behandelt.
 *
 * Drei Abfragen maskierten sie bis zum 30.08. nicht. Sie stehen hier nicht,
 * weil ein `_` gefährlich wäre, sondern weil eine Suche, die mehr trifft als
 * sie verspricht, niemandem auffällt.
 */
const HEIKEL = "schule_100%";

describe.skipIf(!vorhanden)("Jede Leseabfrage läuft gegen das Schema", () => {
  let db: postgres.Sql;
  let schuleId: string;
  /** Eine Schule **mit** Bewertungen - sonst prüft die Formprobe an Leere. */
  let bewerteteSchule: string;
  let bewertungId: string | null;
  let kontoId: string | null;
  const zeitraum = monatszeitraum(letzterMonat().jahr, letzterMonat().monat);

  beforeAll(async () => {
    db = postgres(URL, { onnotice: () => {} });
    const [s] = await db<{ id: string }[]>`select id from schulen order by id limit 1`;
    schuleId = s!.id;
    const [b2] = await db<{ schule_id: string }[]>`
      select schule_id from schul_aggregate where anzahl > 0 order by anzahl desc limit 1
    `;
    bewerteteSchule = b2?.schule_id ?? schuleId;
    const [b] = await db<{ id: string; konto_id: string }[]>`
      select id, konto_id from bewertungen order by erstellt_am desc limit 1
    `;
    bewertungId = b?.id ?? null;
    kontoId = b?.konto_id ?? null;
  });

  afterAll(async () => {
    await db.end();
    await sql.end();
  });

  /** Läuft die Abfrage? Was sie liefert, ist hier gleichgültig. */
  async function laeuft(name: string, ruf: () => Promise<unknown>): Promise<void> {
    await expect(ruf(), name).resolves.not.toThrow();
  }

  it("Schulen, Suche und Vorschläge", async () => {
    await laeuft("holeSchule", () => schulen.holeSchule("gibt-es-nicht"));
    await laeuft("sucheSchulen", () => schulen.sucheSchulen(HEIKEL, {}, 5));
    await laeuft("bundeslandFacetten", () => schulen.bundeslandFacetten(HEIKEL, {}));
    await laeuft("ortFacetten", () => schulen.ortFacetten(HEIKEL, {}, 8));
    await laeuft("schulzahlJeBundesland", () => schulen.schulzahlJeBundesland());
    await laeuft("zaehleSchulen", () => schulen.zaehleSchulen());
    await laeuft("zaehleVeroeffentlichte", () => schulen.zaehleVeroeffentlichte());
    await laeuft("vorschlaege", () => vorschlaege.vorschlaege(HEIKEL));
    await laeuft("autovervollstaendige", () => schulsuche.autovervollstaendige(ausfuehrer, HEIKEL, {}, 5));
    await laeuft("suche", () => schulsuche.suche(ausfuehrer, HEIKEL, {}, 5));
    await laeuft("imUmkreis", () => schulsuche.imUmkreis(ausfuehrer, 52.5, 13.4, 25, {}, 5));
  });

  it("Profil, Ranglisten und Karte", async () => {
    await laeuft("frageMittelwerte", () => fragewerte.frageMittelwerte(schuleId));
    await laeuft("frageMittelwerte (unbekannt)", () => fragewerte.frageMittelwerte(NIRGENDS));
    await laeuft("zusammenfassung", () => zusammenfassungen.holeZusammenfassung(schuleId));
    await laeuft("rangliste beste", () => ranglisten.rangliste("beste", { limit: 10 }));
    await laeuft("rangliste bedarf", () =>
      ranglisten.rangliste("verbesserungsbedarf", { limit: 10 }),
    );
    await laeuft("ranglistenlage", () => ranglisten.ranglistenlage());
    await laeuft("ranglistenlage (gefiltert)", () => ranglisten.ranglistenlage("BY"));
    const ausschnitt = { west: 5.8, ost: 15.1, sued: 47.2, nord: 55.1 };
    await laeuft("rasterpunkte", () => karte.rasterpunkte(ausschnitt, 0.5));
    await laeuft("rasterpunkte (Land)", () => karte.rasterpunkte(ausschnitt, 0.5, "BY"));
    await laeuft("bewerteteSchulen", () => karte.bewerteteSchulen(ausschnitt, 50));
    await laeuft("kartenzahlen", () => karte.kartenzahlen(ausschnitt, null));
  });

  it("Moderation", async () => {
    await laeuft("warteschlange", () => moderation.warteschlange({ suche: HEIKEL }));
    await laeuft("warteschlangenlage", () => moderation.warteschlangenlage());
    await laeuft("holeVorgang", () => moderation.holeVorgang(NIRGENDS));
    await laeuft("protokollZurBewertung", () => moderation.protokollZurBewertung(NIRGENDS));
    await laeuft("weitereBewertungenDesKontos", () =>
      moderation.weitereBewertungenDesKontos(NIRGENDS, NIRGENDS),
    );
    await laeuft("offeneMeldungen", () => meldungen.offeneMeldungen(10));
    await laeuft("melderadresse", () => meldungen.melderadresse(NIRGENDS));
    await laeuft("offeneAnfragen", () => schulzugang.offeneAnfragen(10));
    await laeuft("eskalierteZusammenfassungen", () => zusammenfassungen.eskalierteZusammenfassungen(10));
    await laeuft("faelligeSchulen", () => zusammenfassungen.faelligeSchulen(new Date(), 5));
    await laeuft("holeFreitexte", () => zusammenfassungen.holeFreitexte(schuleId, 10));
  });

  it("Auswertung und Schulbestand", async () => {
    await laeuft("gesamtlage", () => analytik.gesamtlage());
    await laeuft("signalhaeufigkeit", () => analytik.signalhaeufigkeit());
    await laeuft("verlaufNachMonat", () => analytik.verlaufNachMonat(3));
    await laeuft("sucheSchulenFuerAnalyse", () => analytik.sucheSchulenFuerAnalyse(HEIKEL, 5));
    await laeuft("analysiereSchule", () => analytik.analysiereSchule(schuleId));
    await laeuft("grundlageFuerAnalyse", () => analytik.grundlageFuerAnalyse(schuleId, 10));
    await laeuft("importlage", () => schulverwaltung.importlage());
    await laeuft("listeSchulen", () => schulverwaltung.listeSchulen({ suche: HEIKEL }));
    await laeuft("holeSchuldatensatz", () => schulverwaltung.holeSchuldatensatz(schuleId));
    await laeuft("dublettenbericht", () => schulverwaltung.dublettenbericht(10));
    await laeuft("letzteAenderungen", () => schulverwaltung.letzteAenderungen(5));
  });

  it("Verlosung und Empfehlungen", async () => {
    for (const art of ["normal", "super", "mega"] as const) {
      await laeuft(`teilnahmen ${art}`, () =>
        verlosung.teilnahmen(letzterMonat().jahr, letzterMonat().monat, art),
      );
    }
    await laeuft("letzteZiehungen", () => verlosung.letzteZiehungen(5));
    await laeuft("gewinner", () => verlosung.gewinner(NIRGENDS));
    await laeuft("gewinnerkontakt", () => verlosung.gewinnerkontakt(NIRGENDS, null));
    await laeuft("pruefeGespeicherteZiehung", () =>
      verlosung.pruefeGespeicherteZiehung(letzterMonat().jahr, letzterMonat().monat, "normal"),
    );
    await laeuft("empfehlungszahlen", () => empfehlungen.empfehlungszahlen(zeitraum));
    await laeuft("empfehlungsliste", () => empfehlungen.empfehlungsliste(zeitraum, {}));
    await laeuft("empfehlungsliste (gefiltert)", () =>
      empfehlungen.empfehlungsliste(zeitraum, { nurAuffaellig: true }),
    );
    await laeuft("topWerber", () => empfehlungen.topWerber(zeitraum, 10));
    await laeuft("empfehlungsstand", () => empfehlungen.empfehlungsstand(NIRGENDS, zeitraum));
    await laeuft("kontoZuCode", () => empfehlungen.kontoZuCode("aaaaaaaaaa"));
  });

  it("Konto, Einstellungen, Aufbewahrung", async () => {
    await laeuft("eigeneBewertungen", () => konto.eigeneBewertungen(kontoId ?? NIRGENDS));
    await laeuft("holeFassungZumAendern", () =>
      konto.holeFassungZumAendern(NIRGENDS, NIRGENDS, NIRGENDS),
    );
    await laeuft("holeKontositzung", () => konto.holeKontositzung("kein-token"));
    await laeuft("holeSchulsitzung", () => schulzugang.holeSchulsitzung("kein-token"));
    await laeuft("holeSitzung", () => moderation.holeSitzung("kein-token"));
    await laeuft("holeEinstellungen", () => einstellungen.holeEinstellungen());
    await laeuft("einstellungsverlauf", () => einstellungen.verlauf(10));
    await laeuft("geheimnislage", () => geheimnisse.lage("anthropic_api_key", "ANTHROPIC_API_KEY"));
    await laeuft("zaehleDemodaten", () => demodaten.zaehleDemodaten());
    await laeuft("letzteLaeufe", () => aufraeumen.letzteLaeufe());
    // Trocken: zählt nur, löscht nichts. Genau der Lauf, der jede Frist einmal
    // gegen das Schema hält.
    await laeuft("raeumeAuf (trocken)", () => aufraeumen.raeumeAuf(true));
  });

  it("kennt jede Protokollart, die der Code schreibt", async () => {
    // Vier Arten kamen mit Migration 0029 dazu. Fehlt sie auf einem Server,
    // brechen Ziehung, Schulzugang und Meldungsentscheidung erst im Moment der
    // Entscheidung ab - also nach der Arbeit, nicht davor.
    const [zeile] = await db<{ arten: string[] }[]>`
      select array_agg(enumlabel::text) as arten
      from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'protokollaktion'
    `;
    for (const art of [
      "einsicht_kontakt",
      "verlosung_gezogen",
      "schulzugang_entschieden",
      "meldung_entschieden",
      "gewinn_benachrichtigt",
    ]) {
      expect(zeile!.arten, art).toContain(art);
    }
  });

  it("liefert die Felder, die der Code ausliest", async () => {
    /**
     * **Was der Rauchtest darüber nicht kann.** Er prüft, ob Postgres die
     * Abfrage annimmt - eine umbenannte Ausgabespalte nimmt es klaglos an, und
     * das Feld kommt danach als `undefined` zurück. Aus `Number(undefined)`
     * wird `NaN`, aus einer Zahl im Panel eine leere Zelle, und nichts wirft.
     * Gegengeprüft: Benennt man `mittel` in `frageMittelwerte` um, bleiben alle
     * acht Fälle oben grün.
     *
     * Deshalb hier für die Abfragen, bei denen ein stilles `undefined` am
     * teuersten wäre, die Probe auf den Wert selbst. Nicht auf den Inhalt - der
     * hängt am Bestand -, sondern darauf, dass überhaupt eine Zahl herauskommt.
     */
    const angaben = await fragewerte.frageMittelwerte(bewerteteSchule);
    // Ohne diese Zeile prüfte die Schleife darunter an einer leeren Liste - und
    // eine leere Liste besteht jede Probe. Genau daran ist der erste Versuch
    // vorbeigelaufen: Die umbenannte Spalte blieb unbemerkt.
    expect(angaben.length, "Angaben zur bewertetsten Schule").toBeGreaterThan(0);
    for (const a of angaben.slice(0, 5)) {
      expect(Number.isFinite(a.mittel), `mittel zu ${a.frage}`).toBe(true);
      expect(Number.isInteger(a.anzahl), `anzahl zu ${a.frage}`).toBe(true);
    }

    const zahlen = await empfehlungen.empfehlungszahlen(zeitraum);
    for (const [name, wert] of Object.entries(zahlen)) {
      expect(Number.isInteger(wert), `empfehlungszahlen.${name}`).toBe(true);
    }

    const lage = await ranglisten.ranglistenlage();
    for (const [name, wert] of Object.entries(lage)) {
      expect(Number.isInteger(wert), `ranglistenlage.${name}`).toBe(true);
    }

    const warteschlange = await moderation.warteschlangenlage();
    for (const [name, wert] of Object.entries(warteschlange)) {
      if (typeof wert === "number") {
        expect(Number.isFinite(wert), `warteschlangenlage.${name}`).toBe(true);
      }
    }
  });

  it("hat zu jeder Bewertung eine aktuelle Fassung", async () => {
    // Die Annahme, auf der die halbe Abfrageschicht steht: `join
    // bewertung_versionen on version = aktuelle_version`. Stimmt sie nicht,
    // verschwindet eine Bewertung stillschweigend aus jeder Auswertung.
    const [zeile] = await db<{ n: number }[]>`
      select count(*)::int as n from bewertungen b
      where not exists (
        select 1 from bewertung_versionen v
        where v.bewertung_id = b.id and v.version = b.aktuelle_version
      )
    `;
    expect(zeile!.n, "Bewertungen ohne aktuelle Fassung").toBe(0);
  });
});
