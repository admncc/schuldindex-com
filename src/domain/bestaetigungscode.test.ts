import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  CODE_STELLEN,
  codeGleich,
  codeGueltigBis,
  erzeugeCode,
  hasheCode,
  istCodeform,
  normalisiereCode,
} from "./bestaetigungscode";

beforeAll(() => {
  process.env["TOKEN_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

describe("erzeugeCode", () => {
  it("liefert immer sechs Ziffern, auch mit führender Null", () => {
    for (let i = 0; i < 2000; i++) {
      const c = erzeugeCode();
      expect(c).toMatch(/^\d{6}$/);
      expect(c).toHaveLength(CODE_STELLEN);
    }
  });

  it("streut über den ganzen Bereich", () => {
    // Ein Code, der nie mit 0 beginnt, hätte nur 900 000 Möglichkeiten statt
    // einer Million - und genau das passiert, wenn jemand ihn als Zahl führt.
    const codes = Array.from({ length: 3000 }, erzeugeCode);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(2500);
  });
});

describe("hasheCode", () => {
  /**
   * **Die Bindung ans Konto ist die eigentliche Sicherheitsleistung.** Ohne sie
   * liesse sich ein geratener Code gegen alle offenen Bestätigungen zugleich
   * prüfen - aus 5 zu 1.000.000 würde bei tausend wartenden Konten 5 zu 1.000.
   */
  it("ergibt für dasselbe Kennwort je Konto einen anderen Abdruck", () => {
    expect(hasheCode("konto-a", "043912")).not.toBe(hasheCode("konto-b", "043912"));
  });

  it("ist für dasselbe Paar stabil und unempfindlich gegen Schreibweise", () => {
    expect(hasheCode("k1", "043912")).toBe(hasheCode("k1", "043 912"));
    expect(hasheCode("k1", "043912")).toBe(hasheCode("k1", "043-912"));
  });

  it("speichert den Code nicht im Klartext", () => {
    expect(hasheCode("k1", "043912")).not.toContain("043912");
  });
});

describe("codeGleich", () => {
  it("vergleicht zeitkonstant und richtig", () => {
    const a = hasheCode("k1", "043912");
    expect(codeGleich(a, hasheCode("k1", "043912"))).toBe(true);
    expect(codeGleich(a, hasheCode("k1", "043913"))).toBe(false);
    expect(codeGleich(a, "")).toBe(false);
  });
});

describe("Eingabeformate", () => {
  it("nimmt an, was Menschen tippen und kopieren", () => {
    for (const eingabe of ["043912", "043 912", "043-912", " 043912 ", "0 4 3 9 1 2"]) {
      expect(istCodeform(eingabe)).toBe(true);
      expect(normalisiereCode(eingabe)).toBe("043912");
    }
  });

  it("weist ab, was keiner ist", () => {
    for (const eingabe of ["", "12345", "1234567", "abcdef", "04391a"]) {
      expect(istCodeform(eingabe)).toBe(false);
    }
  });
});

describe("codeGueltigBis", () => {
  it("gilt zehn Minuten", () => {
    const jetzt = new Date("2026-11-08T20:00:00Z");
    expect(codeGueltigBis(jetzt).toISOString()).toBe("2026-11-08T20:10:00.000Z");
  });
});
