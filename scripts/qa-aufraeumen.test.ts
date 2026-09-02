import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { verschluessele } from "../src/domain/kontakt";
import { waehleTestkonten } from "./qa-aufraeumen";

beforeAll(() => {
  process.env["KONTAKT_CHIFFRE_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

function konto(kontakt: string, freigegeben = 0, gewinne = 0) {
  return { kontakt_chiffre: verschluessele(kontakt), freigegeben, gewinne, kontakt };
}

describe("waehleTestkonten", () => {
  it("nimmt nur, was auf die Endung passt", () => {
    const { zuLoeschen } = waehleTestkonten(
      [konto("a@beispiel-test.de"), konto("b@schule.de"), konto("c@beispiel-test.de.example.com")],
      "@beispiel-test.de",
    );
    expect(zuLoeschen.map((k) => k.kontakt)).toEqual(["a@beispiel-test.de"]);
  });

  it("stört sich nicht an Groß- und Kleinschreibung", () => {
    const { zuLoeschen } = waehleTestkonten([konto("QA@Beispiel-Test.DE")], "@beispiel-test.de");
    expect(zuLoeschen).toHaveLength(1);
  });

  // **Der Fehler, gegen den das steht.** Eine freigegebene Bewertung steckt in
  // den veröffentlichten Mittelwerten ihrer Schule, ein Gewinn in einem
  // Vorgang, über den Rechenschaft zu geben ist. Beides darf ein Aufräumlauf
  // nicht still mitnehmen.
  it("lässt freigegebene Bewertungen und Gewinne stehen", () => {
    const auswahl = waehleTestkonten(
      [
        konto("frei@beispiel-test.de", 1, 0),
        konto("gewinn@beispiel-test.de", 0, 1),
        konto("harmlos@beispiel-test.de", 0, 0),
      ],
      "@beispiel-test.de",
    );
    expect(auswahl.zuLoeschen.map((k) => k.kontakt)).toEqual(["harmlos@beispiel-test.de"]);
    expect(auswahl.geschuetzt.map((k) => k.kontakt)).toEqual([
      "frei@beispiel-test.de",
      "gewinn@beispiel-test.de",
    ]);
  });

  // Nach einem Schlüsselwechsel ist ein Kontakt unlesbar. Dann ist unbekannt,
  // ob es ein Testkonto ist - und Unbekanntes wird nicht gelöscht.
  it("fasst unlesbare Kontakte nicht an", () => {
    const kaputt = { kontakt_chiffre: Buffer.alloc(40, 7), freigegeben: 0, gewinne: 0 };
    const auswahl = waehleTestkonten([kaputt], "@beispiel-test.de");
    expect(auswahl.zuLoeschen).toHaveLength(0);
    expect(auswahl.geschuetzt).toHaveLength(0);
  });
});
