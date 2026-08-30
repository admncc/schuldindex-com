import { describe, expect, it } from "vitest";
import { istKennung } from "./kennung";

describe("istKennung", () => {
  it("nimmt eine echte Kennung an", () => {
    expect(istKennung("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(istKennung("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("weist alles zurück, was Postgres als Fehler zurückgäbe", () => {
    // Diese Werte haben 500er ausgelöst, statt „nicht gefunden“ zu ergeben.
    for (const wert of ["", "abc", "0", "constructor", "3f2504e0-4f89-41d3-9a0c", "'; drop table"]) {
      expect(istKennung(wert), `„${wert}“ kam durch`).toBe(false);
    }
  });

  it("weist alles zurück, was keine Zeichenkette ist", () => {
    for (const wert of [null, undefined, 42, {}, []]) {
      expect(istKennung(wert)).toBe(false);
    }
  });

  it("lässt sich von Bindestrichen an falscher Stelle nicht täuschen", () => {
    // Das frühere Muster `/^[0-9a-f-]{36}$/i` nahm auch das hier an.
    expect(istKennung("------------------------------------")).toBe(false);
  });
});
