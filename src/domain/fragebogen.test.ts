import { describe, expect, it } from "vitest";
import {
  AGGRESSIONSFRAGEN,
  FRAGEN,
  KATEGORIEN,
  SKALEN,
  fragenDerKategorie,
} from "./fragebogen.js";

describe("Fragebogen — Struktur", () => {
  it("enthält 61 Fragen in sechs Kategorien", () => {
    expect(FRAGEN).toHaveLength(61);
    expect(KATEGORIEN).toHaveLength(6);
  });

  it("verteilt die Fragen wie spezifiziert: A hat 11, alle übrigen 10", () => {
    expect(fragenDerKategorie("A")).toHaveLength(11);
    for (const id of ["B", "C", "D", "E", "F"] as const) {
      expect(fragenDerKategorie(id)).toHaveLength(10);
    }
  });

  it("vergibt jede Frage-ID genau einmal", () => {
    const ids = FRAGEN.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gewichtet A mit 3, B/C/D mit 2 und E/F mit 1", () => {
    const gewichte = Object.fromEntries(KATEGORIEN.map((k) => [k.id, k.gewichtung]));
    expect(gewichte).toEqual({ A: 3, B: 2, C: 2, D: 2, E: 1, F: 1 });
  });

  it("macht A, B und C zur Pflicht, D, E und F optional", () => {
    const pflicht = KATEGORIEN.filter((k) => k.pflicht).map((k) => k.id);
    expect(pflicht).toEqual(["A", "B", "C"]);
  });

  it("teilt Kategorie A in genau zwei Aggressions- und neun Klimafragen", () => {
    const a = fragenDerKategorie("A");
    expect(a.filter((f) => f.teilbereich === "aggression")).toHaveLength(2);
    expect(a.filter((f) => f.teilbereich === "klima")).toHaveLength(9);
    expect(a.every((f) => f.teilbereich !== undefined)).toBe(true);
  });

  it("wertet ausschließlich die beiden Aggressionsfragen invertiert", () => {
    const invertiert = FRAGEN.filter((f) => f.wertung === "invertiert").map((f) => f.id);
    expect(invertiert).toEqual(["A2", "A3"]);
    expect(AGGRESSIONSFRAGEN.map((f) => f.id)).toEqual(["A2", "A3"]);
  });

  it("weist jeder Frage eine Kategorie zu, die es auch gibt", () => {
    const bekannt = new Set(KATEGORIEN.map((k) => k.id));
    expect(FRAGEN.every((f) => bekannt.has(f.kategorie))).toBe(true);
  });
});

describe("Fragebogen — Sprache", () => {
  it("liefert für jede Skala fünf Optionen mit den Werten 1 bis 5", () => {
    for (const optionen of Object.values(SKALEN)) {
      expect(optionen).toHaveLength(5);
      expect([...optionen].map((o) => o.wert).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("kodiert die Häufigkeitsskala roh: Nie ist 1, Sehr häufig ist 5", () => {
    expect(SKALEN.haeufigkeit[0]).toEqual({ label: "Nie", wert: 1 });
    expect(SKALEN.haeufigkeit[4]).toEqual({ label: "Sehr häufig", wert: 5 });
  });

  it("stellt bei Qualität und Sicherheit den besten Wert nach vorn", () => {
    expect(SKALEN.qualitaet[0]?.wert).toBe(5);
    expect(SKALEN.sicherheit[0]?.wert).toBe(5);
  });

  it("formuliert jede Frage auf Deutsch und als Frage", () => {
    for (const frage of FRAGEN) {
      expect(frage.text.endsWith("?"), `${frage.id} endet nicht mit Fragezeichen`).toBe(true);
      expect(frage.text.length).toBeGreaterThan(20);
    }
  });

  it("hinterlegt eine Du-Variante genau dort, wo die Sie-Form direkt anspricht", () => {
    for (const frage of FRAGEN) {
      const sprichtAn = /\b(Sie|Ihnen|Ihre[rnms]?)\b/.test(frage.text);
      expect(
        frage.textDu !== undefined,
        `${frage.id}: Anrede ${sprichtAn ? "vorhanden" : "fehlt"}, Du-Variante ${
          frage.textDu ? "gesetzt" : "fehlt"
        }`,
      ).toBe(sprichtAn);
    }
  });

  it("siezt in der Sie-Form und duzt in der Du-Variante", () => {
    for (const frage of FRAGEN) {
      if (frage.textDu === undefined) continue;
      expect(/\b(du|dich|dir|deine)\b/i.test(frage.textDu), `${frage.id}`).toBe(true);
      expect(/\bSie\b/.test(frage.textDu), `${frage.id} siezt in der Du-Variante`).toBe(false);
    }
  });
});
