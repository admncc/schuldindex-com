import { describe, expect, it } from "vitest";
import { bereichAusKopf } from "./kartendaten";

const GROESSE = 2_000_000_000;

describe("bereichAusKopf", () => {
  it("ohne Kopf die ganze Datei", () => {
    expect(bereichAusKopf(null, GROESSE)).toEqual({ art: "ganz" });
  });

  it("von-bis", () => {
    expect(bereichAusKopf("bytes=0-1023", GROESSE)).toEqual({ art: "teil", von: 0, bis: 1023 });
  });

  it("ab hier bis zum Ende", () => {
    expect(bereichAusKopf("bytes=1024-", GROESSE)).toEqual({
      art: "teil",
      von: 1024,
      bis: GROESSE - 1,
    });
  });

  // **Der Fehler, gegen den das steht.** `bytes=-500` heisst „die letzten
  // 500", nicht „von 0 bis 500". Genau diese Form benutzt der PMTiles-Client
  // für den Abschlussblock, mit dem er jedes Archiv beginnt - wird sie falsch
  // gelesen, bekommt er den Anfang der Datei und findet nichts.
  it("die letzten n Byte", () => {
    expect(bereichAusKopf("bytes=-500", GROESSE)).toEqual({
      art: "teil",
      von: GROESSE - 500,
      bis: GROESSE - 1,
    });
  });

  it("mehr als die Datei lang ist, ist die ganze Datei", () => {
    expect(bereichAusKopf("bytes=-99999", 1000)).toEqual({ art: "teil", von: 0, bis: 999 });
    expect(bereichAusKopf("bytes=0-99999", 1000)).toEqual({ art: "teil", von: 0, bis: 999 });
  });

  it("weist Unsinn ab, statt zu raten", () => {
    for (const kopf of ["bytes=-", "bytes=abc-def", "seiten=0-10", "bytes=500-100", "bytes=1000-", ""]) {
      expect(bereichAusKopf(kopf, 1000).art, kopf).toBe("ungueltig");
    }
  });

  it("verträgt mehrere Bereiche nicht und sagt das", () => {
    // Mehrteilige Antworten wären ein eigenes Format (multipart/byteranges).
    // Der Client fordert sie nie an; sie stillschweigend als ersten Bereich zu
    // beantworten wäre falsch.
    expect(bereichAusKopf("bytes=0-99,200-299", 1000).art).toBe("ungueltig");
  });
});
