import { afterEach, describe, expect, it } from "vitest";
import robots from "./robots";
import { basisadresse, darfIndexiert } from "./indexierung";

afterEach(() => {
  delete process.env["INDEXIERUNG"];
  delete process.env["BASIS_URL"];
});

describe("darfIndexiert", () => {
  it("bleibt ohne ausdrückliche Freigabe zu", () => {
    expect(darfIndexiert()).toBe(false);
  });

  // **Der Fehler, gegen den das steht.** Eine Freigabe, die auf jeden
  // gesetzten Wert anspringt, wird durch das Dokumentieren ausgelöst: Wer
  // `INDEXIERUNG=aus` in die `.env` schreibt, um es abzuschalten, schaltet es
  // damit ein.
  it("liest nur `an` als Freigabe", () => {
    for (const wert of ["aus", "", "0", "false", "nein", "an aus"]) {
      process.env["INDEXIERUNG"] = wert;
      expect(darfIndexiert(), wert).toBe(false);
    }
    for (const wert of ["an", "An", " AN "]) {
      process.env["INDEXIERUNG"] = wert;
      expect(darfIndexiert(), wert).toBe(true);
    }
  });
});

describe("robots.txt", () => {
  it("sperrt vor der Freigabe alles", () => {
    const regeln = robots().rules;
    expect(Array.isArray(regeln)).toBe(false);
    expect(regeln).toMatchObject({ userAgent: "*", disallow: "/" });
    expect(regeln).not.toHaveProperty("allow");
  });

  it("gibt nach der Freigabe frei, die Moderation aber nicht", () => {
    process.env["INDEXIERUNG"] = "an";
    const regeln = robots().rules as { allow?: string; disallow?: string[] };
    expect(regeln.allow).toBe("/");
    expect(regeln.disallow).toContain("/moderation");
    expect(regeln.disallow).toContain("/bestaetigen");
  });
});

describe("basisadresse", () => {
  it("nimmt die eingetragene Adresse", () => {
    process.env["BASIS_URL"] = "https://schulindex.com";
    expect(basisadresse().origin).toBe("https://schulindex.com");
  });

  // Ein Tippfehler in der `.env` darf nicht jede Seite auf einen Fehler
  // laufen lassen - `new URL` wirft, und das mitten im Aufbau des Layouts.
  it("hält einen unbrauchbaren Wert aus", () => {
    process.env["BASIS_URL"] = "schulindex.com";
    expect(basisadresse().origin).toBe("http://localhost:3000");
    process.env["BASIS_URL"] = "";
    expect(basisadresse().origin).toBe("http://localhost:3000");
  });
});
