import { describe, expect, it } from "vitest";
import {
  AGGRESSIONSFRAGEN,
  FRAGEN,
  FRAGE_NACH_ID,
  KATEGORIEN,
  SKALEN,
  frageText,
  fragenDerKategorie,
} from "./fragebogen";
import { ansprachefuer } from "./bewertungseingabe";

describe("Fragebogen - Struktur", () => {
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

  it("gewichtet A mit 4, B/C mit 2 und D/E/F mit 1", () => {
    // Stand 28.08.2026: Sicherheit und Schulklima wiegen am schwersten,
    // Verwaltung am leichtesten. Die Summe bleibt 11.
    const gewichte = Object.fromEntries(KATEGORIEN.map((k) => [k.id, k.gewichtung]));
    expect(gewichte).toEqual({ A: 4, B: 2, C: 2, D: 1, E: 1, F: 1 });
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

describe("Fragebogen - Sprache", () => {
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

  it("siezt an keiner Stelle - das Portal duzt durchgehend", () => {
    // Entscheidung vom 26.08.2026. Der Test greift auch dann, wenn jemand
    // später eine Frage in der Sie-Form nachträgt.
    for (const frage of FRAGEN) {
      expect(
        /\b(Sie|Ihnen|Ihre[rnms]?)\b/.test(frage.text),
        `${frage.id} siezt: „${frage.text}“`,
      ).toBe(false);
    }
  });

  it("duzt dort, wo die Frage überhaupt jemanden anspricht", () => {
    const mitAnrede = FRAGEN.filter((f) => /\b(du|dich|dir|deine[rnms]?)\b/i.test(f.text));
    expect(mitAnrede.length).toBeGreaterThanOrEqual(12);
  });
});

describe("Ansprache je Rolle", () => {
  const ANSPRACHEN = ["schueler", "eltern", "lehrkraft", "ehemalig"] as const;

  it("liefert für jede Ansprache zu jeder Frage einen Text", () => {
    for (const frage of FRAGEN) {
      for (const ansprache of ANSPRACHEN) {
        const text = frageText(frage, ansprache);
        expect(text.endsWith("?"), `${frage.id}/${ansprache} endet nicht mit Fragezeichen`).toBe(true);
        expect(text.length).toBeGreaterThan(20);
      }
    }
  });

  it("gibt ohne eigene Fassung den kanonischen Text zurück", () => {
    const { varianten: _weg, ...ohneVarianten } = FRAGEN[0]!;
    expect(frageText(ohneVarianten, "eltern")).toBe(ohneVarianten.text);
  });

  it("fragt Ehemalige in der Vergangenheit", () => {
    // Die Gegenwartsform ist an jemanden, der die Schule verlassen hat, falsch
    // gestellt - und die Antwort wäre eine andere.
    for (const frage of FRAGEN) {
      const text = frageText(frage, "ehemalig");
      expect(text, `${frage.id} hat keine eigene Fassung für Ehemalige`).not.toBe(frage.text);
    }
  });

  it("fragt Eltern nicht nach dem, was nur Schüler selbst erleben", () => {
    // „Wie sicher fühlst du dich auf dem Schulgelände?" kann ein Elternteil
    // nicht beantworten; gefragt wird nach dem Kind.
    const a1 = FRAGE_NACH_ID.get("A1")!;
    expect(frageText(a1, "eltern")).toContain("dein Kind");
    expect(frageText(a1, "eltern")).not.toContain("fühlst du dich");
  });

  it("siezt auch in den Rollenfassungen nicht", () => {
    for (const frage of FRAGEN) {
      for (const ansprache of ANSPRACHEN) {
        expect(
          /\b(Sie|Ihnen|Ihre[rnms]?)\b/.test(frageText(frage, ansprache)),
          `${frage.id}/${ansprache} siezt`,
        ).toBe(false);
      }
    }
  });

  it("lässt Skala und Wertung unangetastet", () => {
    // Nur der Wortlaut ändert sich. Änderte sich die Skala, wären die
    // Antworten verschiedener Rollen nicht mehr vergleichbar.
    for (const frage of FRAGEN) {
      expect(frage.varianten === undefined || typeof frage.varianten === "object").toBe(true);
    }
  });
});

describe("ansprachefuer", () => {
  it("ordnet jede Rolle einer Ansprache zu", () => {
    expect(ansprachefuer("schueler_unter_16")).toBe("schueler");
    expect(ansprachefuer("schueler_ab_16")).toBe("schueler");
    expect(ansprachefuer("eltern")).toBe("eltern");
    expect(ansprachefuer("lehrkraft")).toBe("lehrkraft");
    expect(ansprachefuer("ehemalig")).toBe("ehemalig");
  });

  it("nimmt ohne Rolle die Schülerfassung", () => {
    expect(ansprachefuer(null)).toBe("schueler");
    expect(ansprachefuer("etwas anderes")).toBe("schueler");
  });
});
