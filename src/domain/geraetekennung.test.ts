import { describe, expect, it } from "vitest";
import { gueltigeKennung, istGeraetekennung } from "./geraetekennung";

const ECHT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("istGeraetekennung", () => {
  it("nimmt eine UUID v4 an", () => {
    expect(istGeraetekennung(ECHT)).toBe(true);
  });

  it("weist alles andere zurück", () => {
    for (const unsinn of ["", "abc", "3f2504e0-4f89-11d3-9a0c-0305e82c3301", null, 42, {}]) {
      expect(istGeraetekennung(unsinn), String(unsinn)).toBe(false);
    }
  });
});

describe("gueltigeKennung", () => {
  it("nimmt den Cookie, wenn beide da sind", () => {
    // Der Cookie kommt vom Server; der Speicherwert kommt aus dem Browser und
    // lässt sich in der Konsole beliebig setzen.
    const anderer = "11111111-2222-4333-8444-555555555555";
    expect(gueltigeKennung(ECHT, anderer)).toBe(ECHT);
  });

  it("springt auf den Speicherwert ein, wenn der Cookie fehlt", () => {
    expect(gueltigeKennung(null, ECHT)).toBe(ECHT);
    expect(gueltigeKennung("kaputt", ECHT)).toBe(ECHT);
  });

  it("gibt nichts zurück, wenn beide unbrauchbar sind", () => {
    expect(gueltigeKennung(null, null)).toBeNull();
    expect(gueltigeKennung("x", "y")).toBeNull();
  });
});
