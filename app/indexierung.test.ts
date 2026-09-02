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
    const regeln = robots().rules as { userAgent?: string | string[]; allow?: string; disallow?: string | string[] }[];
    const alle = regeln.find((r) => r.userAgent === "*");
    expect(alle?.allow).toBe("/");
    expect(alle?.disallow).toContain("/moderation");
    expect(alle?.disallow).toContain("/bestaetigen");
  });

  // **Der Fehler, gegen den das steht.** Cloudflare schiebt vor unsere Datei
  // eine eigene mit Sperren für KI-Sammler. Wer die abschaltet, damit unsere
  // Datei die maßgebliche ist, darf diese Sperren nicht dabei verlieren.
  it("hält KI-Sammler auch nach der Freigabe draußen", () => {
    process.env["INDEXIERUNG"] = "an";
    const regeln = robots().rules as { userAgent?: string | string[]; disallow?: string | string[] }[];
    const ki = regeln.find((r) => Array.isArray(r.userAgent));
    expect(ki?.disallow).toBe("/");
    for (const sammler of ["GPTBot", "Google-Extended", "ClaudeBot", "Bytespider", "meta-externalagent"]) {
      expect(ki?.userAgent).toContain(sammler);
    }
    // Suchmaschinen gehören nicht dazu - gefunden zu werden ist der Zweck.
    expect(ki?.userAgent).not.toContain("Googlebot");
    expect(ki?.userAgent).not.toContain("bingbot");
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
