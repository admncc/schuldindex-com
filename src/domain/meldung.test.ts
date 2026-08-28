import { describe, expect, it } from "vitest";
import {
  deuteAdresse,
  istMeldegrund,
  MELDEGRUENDE,
  MELDEGRUND_TEXT,
  MIN_ERLAEUTERUNG,
  pruefeMeldung,
  type Meldeeingabe,
} from "./meldung";

const GUELTIG: Meldeeingabe = {
  url: "https://schulindex.com/schule/gymnasium-beispiel",
  grund: "personenbezug",
  erlaeuterung: "Im dritten Absatz werde ich als Klassenlehrerin namentlich genannt und kritisiert.",
  name: "A. Beispiel",
  kontakt: "a.beispiel@schule-beispiel.de",
  gutglauben: true,
};

describe("Meldegründe", () => {
  it("sind vollständig beschrieben", () => {
    expect(MELDEGRUND_TEXT.map((g) => g.id).sort()).toEqual([...MELDEGRUENDE].sort());
    for (const g of MELDEGRUND_TEXT) expect(g.hilfe.length).toBeGreaterThan(30);
  });

  it("weisen bei Drohungen zuerst auf die Polizei hin", () => {
    // Ein Meldeformular ist kein Notruf, und es wäre falsch, so zu tun.
    expect(MELDEGRUND_TEXT.find((g) => g.id === "straftat")?.hilfe).toMatch(/110/);
  });

  it("kennt keine erfundenen Gründe", () => {
    expect(istMeldegrund("mag ich nicht")).toBe(false);
  });
});

describe("pruefeMeldung", () => {
  it("lässt eine vollständige Meldung durch", () => {
    expect(pruefeMeldung(GUELTIG)).toEqual([]);
  });

  it("verlangt eine Adresse", () => {
    expect(pruefeMeldung({ ...GUELTIG, url: "" }).map((f) => f.feld)).toEqual(["url"]);
    expect(pruefeMeldung({ ...GUELTIG, url: "irgendwas" }).map((f) => f.feld)).toEqual(["url"]);
  });

  it("nimmt auch eine Adresse ohne Domäne an", () => {
    // Wer aus der Adresszeile kopiert, hat die vollständige URL; wer den Pfad
    // abschreibt, soll deswegen nicht abgewiesen werden.
    expect(pruefeMeldung({ ...GUELTIG, url: "/schule/gymnasium-beispiel" })).toEqual([]);
  });

  it("verlangt eine ausgeschriebene Begründung", () => {
    const fehler = pruefeMeldung({ ...GUELTIG, erlaeuterung: "ist falsch" });
    expect(fehler.map((f) => f.feld)).toEqual(["erlaeuterung"]);
    expect(fehler[0]?.meldung).toContain(String(MIN_ERLAEUTERUNG));
  });

  it("verlangt die Erklärung nach bestem Wissen", () => {
    expect(pruefeMeldung({ ...GUELTIG, gutglauben: false }).map((f) => f.feld)).toEqual(["gutglauben"]);
  });

  it("verlangt eine Kontaktadresse - außer bei einer Drohung", () => {
    expect(pruefeMeldung({ ...GUELTIG, kontakt: "" }).map((f) => f.feld)).toEqual(["kontakt"]);
    // Art. 16 Abs. 2 lit. c nimmt Straftaten gegen Leib und Leben ausdrücklich aus.
    expect(pruefeMeldung({ ...GUELTIG, grund: "straftat", kontakt: "" })).toEqual([]);
  });

  it("prüft eine angegebene Adresse trotzdem auf Form", () => {
    expect(
      pruefeMeldung({ ...GUELTIG, grund: "straftat", kontakt: "keine adresse" }).map((f) => f.feld),
    ).toEqual(["kontakt"]);
  });

  it("meldet alle Mängel auf einmal, nicht einen nach dem anderen", () => {
    const fehler = pruefeMeldung({ url: "", grund: "x", erlaeuterung: "", name: "", kontakt: "", gutglauben: false });
    expect(fehler.map((f) => f.feld).sort()).toEqual([
      "erlaeuterung",
      "grund",
      "gutglauben",
      "kontakt",
      "url",
    ]);
  });
});

describe("deuteAdresse", () => {
  it("erkennt ein Schulprofil", () => {
    expect(deuteAdresse("https://schulindex.com/schule/gymnasium-beispiel-hamburg")).toEqual({
      art: "schule",
      wert: "gymnasium-beispiel-hamburg",
    });
  });

  it("erkennt eine einzelne Bewertung", () => {
    const id = "3487f181-25cc-43e2-97fa-baaf13a15e5f";
    expect(deuteAdresse(`https://schulindex.com/bewertung/${id}`)).toEqual({ art: "bewertung", wert: id });
  });

  it("gibt bei allem anderen ehrlich „unbekannt“ zurück", () => {
    expect(deuteAdresse("https://schulindex.com/ranglisten")).toEqual({ art: "unbekannt", wert: null });
    expect(deuteAdresse("völliger Unsinn")).toEqual({ art: "unbekannt", wert: null });
  });
});
