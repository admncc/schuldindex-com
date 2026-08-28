import { describe, expect, it } from "vitest";
import { fristtext, laufbericht, REGELN, regel, stichtag } from "./aufbewahrung";

describe("REGELN", () => {
  it("hat für jede Art genau eine Regel", () => {
    const arten = REGELN.map((r) => r.art);
    expect(new Set(arten).size).toBe(arten.length);
  });

  it("begründet jede Frist - die Begründung geht in die Datenschutzerklärung", () => {
    for (const r of REGELN) {
      expect(r.begruendung.length, r.art).toBeGreaterThan(40);
      expect(r.gegenstand.length, r.art).toBeGreaterThan(5);
      expect(r.tage, r.art).toBeGreaterThan(0);
    }
  });

  it("hält die Bewertungsfrist kürzer als die Kontofrist", () => {
    // Abgelehnte Bewertungen sechs Monate, Konten 24 - andersherum ergäbe es
    // keinen Sinn: die Ablehnung ist der abgeschlossene Vorgang.
    expect(regel("abgelehnte_loeschen").tage).toBeLessThan(regel("konto_stilllegen").tage);
  });

  it("kennt keine erfundene Art", () => {
    expect(() => regel("gibtsnicht" as never)).toThrow(/Keine Aufbewahrungsregel/);
  });
});

describe("stichtag", () => {
  const jetzt = new Date("2026-08-27T12:00:00Z");

  it("liegt um die Frist in der Vergangenheit", () => {
    const s = stichtag("token_loeschen", jetzt);
    expect(jetzt.getTime() - s.getTime()).toBe(30 * 24 * 3600_000);
  });

  it("liegt für Konten am weitesten zurück", () => {
    const konto = stichtag("konto_stilllegen", jetzt);
    for (const r of REGELN.filter((x) => x.art !== "konto_stilllegen")) {
      expect(konto.getTime(), r.art).toBeLessThan(stichtag(r.art, jetzt).getTime());
    }
  });
});

describe("fristtext", () => {
  it("rechnet Tage in Monate um, wo es aufgeht", () => {
    expect(fristtext(30)).toBe("einem Monat");
    expect(fristtext(180)).toBe("6 Monaten");
    expect(fristtext(720)).toBe("24 Monaten");
  });

  it("bleibt bei Tagen, wo es nicht aufgeht", () => {
    expect(fristtext(1)).toBe("einem Tag");
    expect(fristtext(45)).toBe("45 Tagen");
  });
});

describe("laufbericht", () => {
  it("sagt es ausdrücklich, wenn nichts fällig war", () => {
    // Ein schweigender Lauf ist von einem, der nicht lief, nicht zu unterscheiden.
    expect(laufbericht([{ art: "token_loeschen", betroffen: 0 }])).toBe("Nichts fällig.");
    expect(laufbericht([])).toBe("Nichts fällig.");
  });

  it("nennt nur, was tatsächlich betroffen war", () => {
    const text = laufbericht([
      { art: "token_loeschen", betroffen: 1234 },
      { art: "meldungen_loeschen", betroffen: 0 },
    ]);
    expect(text).toContain("1.234");
    expect(text).not.toContain("Meldungen");
  });
});
