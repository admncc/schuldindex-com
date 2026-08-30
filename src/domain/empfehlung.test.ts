import { describe, expect, it } from "vitest";
import {
  empfehlungslink,
  istEmpfehlungscode,
  kurzerEmpfehlungslink,
  teilentext,
} from "./empfehlung";
import { erzeugeEmpfehlungscode } from "./empfehlungscode";

describe("Empfehlungscode", () => {
  it("hat immer dieselbe Länge und besteht aus dem erlaubten Vorrat", () => {
    for (let i = 0; i < 200; i++) {
      const code = erzeugeEmpfehlungscode();
      expect(code).toHaveLength(10);
      expect(istEmpfehlungscode(code), code).toBe(true);
    }
  });

  it("enthält keine verwechselbaren Zeichen", () => {
    // Der Code wird abgetippt und vorgelesen. I/1/l und O/0 wären Fehlerquellen.
    for (let i = 0; i < 200; i++) {
      expect(erzeugeEmpfehlungscode()).not.toMatch(/[il1o0]/);
    }
  });

  it("wiederholt sich nicht", () => {
    const menge = new Set(Array.from({ length: 500 }, () => erzeugeEmpfehlungscode()));
    expect(menge.size).toBe(500);
  });

  it("weist alles zurück, was kein Code ist", () => {
    for (const unsinn of ["", "kurz", "ABCDEFGHIJ", "abcdefghi1", null, 42, "abcdefghijk"]) {
      expect(istEmpfehlungscode(unsinn), String(unsinn)).toBe(false);
    }
  });
});

describe("Empfehlungslink", () => {
  it("hängt den Code als Parameter an", () => {
    expect(empfehlungslink("https://schulindex.com", "abcdefghjk")).toBe(
      "https://schulindex.com/?freund=abcdefghjk",
    );
  });

  it("nimmt auch ein anderes Ziel", () => {
    // Ein Landeplatz für eine Kampagne hat seine eigene Adresse.
    expect(empfehlungslink("https://schulindex.com", "abcdefghjk", "/lp1")).toBe(
      "https://schulindex.com/lp1?freund=abcdefghjk",
    );
  });

  it("verträgt einen Schrägstrich am Ende", () => {
    expect(empfehlungslink("https://schulindex.com/", "abcdefghjk")).toBe(
      "https://schulindex.com/?freund=abcdefghjk",
    );
  });

  it("bietet daneben die kurze Form zum Vorlesen", () => {
    expect(kurzerEmpfehlungslink("https://schulindex.com", "abcdefghjk")).toBe(
      "https://schulindex.com/e/abcdefghjk",
    );
  });

  it("nennt im Teilentext Schule und Link", () => {
    const text = teilentext("Gymnasium Nord", "https://schulindex.com/e/abcdefghjk");
    expect(text).toContain("Gymnasium Nord");
    expect(text).toContain("https://schulindex.com/e/abcdefghjk");
    expect(text).toContain("Superverlosung");
  });
});
