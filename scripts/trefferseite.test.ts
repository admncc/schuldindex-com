/**
 * Die Suche der Ergebnisseite an den echten Daten.
 *
 *   DATABASE_URL=postgres://… npx vitest run scripts/trefferseite.test.ts
 *
 * Geprüft wird, was sich mit Attrappen nicht prüfen lässt: dass Filter,
 * Facetten und Sortierung auf demselben Bestand dasselbe meinen.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  bundeslandFacetten,
  istEingegrenzt,
  ortFacetten,
  schulzahlJeBundesland,
  sucheSchulen,
} from "../src/db/schulen";
import { sql } from "../src/db/verbindung";

const vorhanden = (process.env["DATABASE_URL"] ?? "") !== "";

describe("istEingegrenzt", () => {
  it("erkennt eine leere Eingrenzung", () => {
    expect(istEingegrenzt({})).toBe(false);
    expect(istEingegrenzt({ ort: "   " })).toBe(false);
    expect(istEingegrenzt({ nurBewertet: false })).toBe(false);
  });

  it("erkennt jede einzelne Eingrenzung", () => {
    expect(istEingegrenzt({ bundesland: "BY" })).toBe(true);
    expect(istEingegrenzt({ schulart: "gymnasium" })).toBe(true);
    expect(istEingegrenzt({ ort: "Öhringen" })).toBe(true);
    expect(istEingegrenzt({ nurBewertet: true })).toBe(true);
  });
});

describe.skipIf(!vorhanden)("Trefferseite", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("sucht ohne Begriff, wenn eingegrenzt wird", async () => {
    // „Alle Schulen in Bremen“ ist eine Anfrage, auch ohne Suchbegriff.
    const treffer = await sucheSchulen("", { bundesland: "HB" }, 5);
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.every((s) => s.bundesland === "HB")).toBe(true);
    expect(treffer[0]!.gesamt).toBeGreaterThanOrEqual(treffer.length);
  });

  it("bleibt ohne Begriff und ohne Eingrenzung stumm", async () => {
    expect(await sucheSchulen("", {})).toEqual([]);
    expect(await bundeslandFacetten("", {})).toEqual([]);
    expect(await ortFacetten("", {})).toEqual([]);
  });

  it("verbindet Begriff und Bundesland", async () => {
    const treffer = await sucheSchulen("grundschule", { bundesland: "HH" }, 10);
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.every((s) => s.bundesland === "HH")).toBe(true);
  });

  it("nimmt im Ortsfeld auch eine Postleitzahl", async () => {
    const [erste] = await sucheSchulen("", { bundesland: "HB" }, 1);
    const plz = erste?.plz ?? "";
    expect(plz).not.toBe("");
    const treffer = await sucheSchulen("", { ort: plz }, 20);
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.every((s) => s.plz?.startsWith(plz))).toBe(true);
  });

  it("zählt die Bundesländer ohne den eigenen Bundeslandfilter", async () => {
    // Sonst zeigte die Leiste nur das Land, in dem man schon steht - und man
    // käme nicht mehr heraus.
    const facetten = await bundeslandFacetten("grundschule", { bundesland: "HB" });
    expect(facetten.length).toBeGreaterThan(1);
  });

  it("zählt Orte innerhalb der übrigen Filter", async () => {
    const orte = await ortFacetten("", { bundesland: "HB" }, 5);
    expect(orte.length).toBeGreaterThan(0);
    expect(orte.every((f) => f.anzahl > 0)).toBe(true);
    // Absteigend sortiert: Das größte Angebot steht vorn.
    const zahlen = orte.map((f) => f.anzahl);
    expect([...zahlen].sort((a, b) => b - a)).toEqual(zahlen);
  });

  // Der teuer erkaufte Fehler: `escape '\'` wird im Template-Literal zu
  // `escape ''`, und Postgres schaltet damit das Fluchtzeichen ab. Die
  // Maskierung lief ins Leere, die Unterstriche blieben Platzhalter - und
  // eine Suche nach „__“ fand alle 31.770 Schulen.
  it("behandelt Unterstrich und Prozent als Zeichen, nicht als Platzhalter", async () => {
    const alle = await sucheSchulen("__", {}, 5);
    expect(alle).toHaveLength(0);
    const prozent = await sucheSchulen("%", { bundesland: "HB" }, 5);
    expect(prozent).toHaveLength(0);
  });

  it("maskiert auch im Ortsfeld", async () => {
    // `8_` traf vorher jede Postleitzahl, die mit 8 beginnt.
    const treffer = await sucheSchulen("", { ort: "8_" }, 5);
    expect(treffer).toHaveLength(0);
  });

  it("kennt den Bestand je Bundesland", async () => {
    const bestand = await schulzahlJeBundesland();
    expect(bestand.length).toBeGreaterThan(0);
    expect(bestand.every((f) => f.anzahl > 0)).toBe(true);
  });
});
