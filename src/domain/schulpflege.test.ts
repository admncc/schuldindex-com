import { describe, expect, it } from "vitest";
import { aenderungstext, pruefeSchulangaben, uebernimm, type Schulangaben } from "./schulpflege";

function angaben(teil: Partial<Schulangaben> = {}): Schulangaben {
  return {
    name: "Gymnasium am Park",
    bundesland: "HH",
    schularten: ["gymnasium"],
    schulartOriginal: "Gymnasium",
    strasse: "Parkweg 1",
    plz: "20095",
    ort: "Hamburg",
    traeger: "Freie und Hansestadt Hamburg",
    website: "https://beispiel.de",
    telefon: "040 123456",
    email: "info@beispiel.de",
    lat: "53.5503",
    lon: "9.9920",
    istAktiv: true,
    ...teil,
  };
}

const feldnamen = (a: Schulangaben) => pruefeSchulangaben(a).map((f) => f.feld);

describe("pruefeSchulangaben", () => {
  it("lässt einen vollständigen Datensatz durch", () => {
    expect(pruefeSchulangaben(angaben())).toEqual([]);
  });

  it("verlangt einen Namen", () => {
    expect(feldnamen(angaben({ name: "AB" }))).toContain("name");
  });

  it("verlangt ein gültiges Bundesland", () => {
    expect(feldnamen(angaben({ bundesland: "XX" }))).toContain("bundesland");
  });

  it("nimmt eine leere Adresse hin", () => {
    // Nicht jede Schule liefert eine vollständige Anschrift, und eine halbe
    // Adresse ist besser als gar kein Datensatz.
    expect(pruefeSchulangaben(angaben({ strasse: "", plz: "", ort: "", traeger: "" }))).toEqual([]);
  });

  it("prüft die Postleitzahl auf fünf Ziffern", () => {
    expect(feldnamen(angaben({ plz: "2009" }))).toContain("plz");
    expect(feldnamen(angaben({ plz: "20095" }))).not.toContain("plz");
  });

  it("verlangt bei der Website ein Schema", () => {
    expect(feldnamen(angaben({ website: "beispiel.de" }))).toContain("website");
    expect(feldnamen(angaben({ website: "" }))).not.toContain("website");
  });

  it("erkennt vertauschte Koordinaten und sagt es", () => {
    // Der häufigste Tippfehler bei Koordinaten - und ohne Prüfung stünde die
    // Schule danach im Indischen Ozean.
    const fehler = pruefeSchulangaben(angaben({ lat: "9.992", lon: "53.5503" }));
    expect(fehler[0]?.meldung).toContain("vertauscht");
  });

  it("weist Koordinaten außerhalb Deutschlands ab", () => {
    expect(feldnamen(angaben({ lat: "40.7", lon: "-74.0" }))).toContain("lat");
  });

  it("verlangt beide Koordinaten oder keine", () => {
    expect(feldnamen(angaben({ lat: "53.55", lon: "" }))).toContain("lat");
    expect(pruefeSchulangaben(angaben({ lat: "", lon: "" }))).toEqual([]);
  });

  it("versteht das deutsche Komma in Koordinaten", () => {
    expect(pruefeSchulangaben(angaben({ lat: "53,5503", lon: "9,992" }))).toEqual([]);
    expect(uebernimm(angaben({ lat: "53,5503", lon: "9,992" })).lat).toBeCloseTo(53.5503, 4);
  });
});

describe("uebernimm", () => {
  it("macht aus leeren Feldern null statt leerer Zeichenketten", () => {
    const g = uebernimm(angaben({ strasse: "  ", telefon: "", traeger: " " }));
    expect(g.strasse).toBeNull();
    expect(g.telefon).toBeNull();
    expect(g.traeger).toBeNull();
  });

  it("übergeht unbekannte Schularten, statt sie zu speichern", () => {
    expect(uebernimm(angaben({ schularten: ["gymnasium", "zauberschule"] })).schularten).toEqual([
      "gymnasium",
    ]);
  });
});

describe("aenderungstext", () => {
  it("nennt nur, was sich geändert hat", () => {
    const text = aenderungstext(
      { name: "Alt", ort: "Hamburg", lat: 53.5 },
      { name: "Neu", ort: "Hamburg", lat: 53.5 },
    );
    expect(text).toBe("name: Alt → Neu");
  });

  it("schreibt fehlende Werte als Strich", () => {
    expect(aenderungstext({ ort: null }, { ort: "Hamburg" })).toBe("ort: - → Hamburg");
  });

  it("vergleicht Listen über ihren Inhalt", () => {
    expect(aenderungstext({ schularten: ["a", "b"] }, { schularten: ["a", "b"] })).toBe(
      "keine Änderung",
    );
    expect(aenderungstext({ schularten: ["a"] }, { schularten: ["a", "b"] })).toBe(
      "schularten: a → a/b",
    );
  });
});
