import { describe, expect, it } from "vitest";
import { SCHULART_LABEL, ausName, ordneSchulartZu, teileBezeichnung } from "./schulart";

const arten = (typ: string | null, name = "Musterschule") => ordneSchulartZu(typ, name).arten;

describe("Mehrfachwerte aufteilen", () => {
  it("trennt die Hamburger Pipe-Listen", () => {
    expect(teileBezeichnung("Grundschule|Stadtteilschule|Vorschulklasse")).toEqual([
      "Grundschule",
      "Stadtteilschule",
      "Vorschulklasse",
    ]);
  });

  it("trennt die Saarländer Semikolon-Listen samt Tabulatoren", () => {
    expect(teileBezeichnung("Gemeinschaftsschule ; \t\t\t Hauptschule ; \t\t\t Realschule ;")).toEqual([
      "Gemeinschaftsschule",
      "Hauptschule",
      "Realschule",
    ]);
  });
});

describe("Zuordnung aus der gelieferten Schulart", () => {
  it("erkennt die geläufigen Bezeichnungen", () => {
    expect(arten("Grundschule")).toEqual(["grundschule"]);
    expect(arten("Gymnasium")).toEqual(["gymnasium"]);
    expect(arten("Förderschule")).toEqual(["foerderschule"]);
  });

  it("versteht die bayerischen Pluralformen", () => {
    expect(arten("Grundschulen")).toEqual(["grundschule"]);
    expect(arten("Gymnasien")).toEqual(["gymnasium"]);
    expect(arten("Mittelschulen")).toEqual(["oberschule"]);
    expect(arten("Förderzentren")).toEqual(["foerderschule"]);
  });

  it("übersetzt die Codes aus Baden-Württemberg", () => {
    expect(arten("primaryEducation")).toEqual(["grundschule"]);
    expect(arten("upperSecondaryEducation")).toEqual(["gymnasium"]);
  });

  it("fasst die Landesnamen der integrierten Schulformen zusammen", () => {
    for (const bezeichnung of ["Gesamtschule", "Gemeinschaftsschule", "Stadtteilschule"]) {
      expect(arten(bezeichnung), bezeichnung).toEqual(["gesamtschule"]);
    }
    for (const bezeichnung of ["Oberschule", "Mittelschulen", "Regelschule", "Regionale Schule", "Sekundarschule"]) {
      expect(arten(bezeichnung), bezeichnung).toEqual(["oberschule"]);
    }
  });

  it("erkennt „Realschule plus“ als Oberschule, nicht als Realschule", () => {
    // Rheinland-Pfalz führt Haupt- und Realschule darin zusammen. Die Regel muss
    // vor der allgemeinen Realschulregel greifen.
    expect(arten("Realschule plus")).toEqual(["oberschule"]);
    expect(arten("Realschule")).toEqual(["realschule"]);
  });

  it("gibt kombinierten Schulen alle zutreffenden Arten", () => {
    expect(arten("Grund- und Oberschule")).toEqual(["grundschule", "oberschule"]);
    expect(arten("Berufliches Gymnasium")).toEqual(["gymnasium", "berufliche_schule"]);
    expect(arten("Gemeinschaftsschule ; Hauptschule ; Realschule ;")).toEqual([
      "hauptschule",
      "realschule",
      "gesamtschule",
    ]);
  });

  it("ignoriert Vorschulangebote neben der eigentlichen Schulart", () => {
    expect(arten("Grundschule|vorschulische Sprachförderung|Vorschulklasse")).toEqual(["grundschule"]);
  });

  it("ignoriert die Rechtsform, die manche Länder ins Schulartfeld schreiben", () => {
    expect(arten("Schule in freier Trägerschaft", "Astrid-Lindgren-Grundschule")).toEqual(["grundschule"]);
  });
});

describe("Zuordnung aus dem Schulnamen", () => {
  it("greift, wenn die Schulart fehlt", () => {
    const z = ordneSchulartZu(null, "Marschenschool an’t Wattenmeer, Grundschule des Amtes Marne-Nordsee");
    expect(z.arten).toEqual(["grundschule"]);
    expect(z.quelle).toBe("name");
  });

  it("erkennt die Abkürzung FöZ aus Schleswig-Holstein", () => {
    expect(ausName("Bramau-Schule -FöZ Lernen-")).toEqual(["foerderschule"]);
  });

  it("bleibt bei reinen Eigennamen ehrlich unbestimmt", () => {
    // „Kahlhorst-Schule“ trägt die Schulart nirgends. Raten wäre schlechter als
    // die Kategorie „Sonstige“ — ein falsches Gymnasium fiele Nutzer:innen auf.
    const z = ordneSchulartZu(null, "Kahlhorst-Schule");
    expect(z.arten).toEqual(["sonstige"]);
    expect(z.quelle).toBe("unbekannt");
    expect(z.istSchule).toBe(true);
  });
});

describe("Datensätze, die keine Schule sind", () => {
  it("schließt Schulaufsicht, Seminare und Hochschulen aus", () => {
    for (const typ of ["Schulaufsicht", "Studienseminar", "ZfsL", "administrationForEducation", "Fachhochschule"]) {
      expect(ordneSchulartZu(typ, "Beispiel").istSchule, typ).toBe(false);
    }
  });

  it("hält das baden-württembergische SBBZ für eine Förderschule, nicht für eine Behörde", () => {
    // Regressionstest. Eine Ausschlussregel auf „Beratungszentrum“ hatte hier
    // einmal 685 reale Förderschulen verworfen.
    const z = ordneSchulartZu("education", "Säntis-Schule Privates Sonderpädagogisches Bildungs- und Beratungszentrum");
    expect(z.istSchule).toBe(true);
    expect(z.arten).toEqual(["foerderschule"]);
  });

  it("behält eine Berufsfachschule am Universitätsklinikum", () => {
    // Der Name enthält „Universität“, die gelieferte Schulart ist aber eindeutig
    // und hat Vorrang.
    const z = ordneSchulartZu("Berufsfachschule", "Universitätsklinikum Leipzig AöR Berufsfachschule für Physiotherapie");
    expect(z.istSchule).toBe(true);
    expect(z.arten).toEqual(["berufliche_schule"]);
  });
});

describe("Anzeigebezeichnung", () => {
  it("behält den Landesnamen für die Anzeige, während die Taxonomie filtert", () => {
    const z = ordneSchulartZu("Gemeinschaftsschule", "Beispielschule");
    expect(z.arten).toEqual(["gesamtschule"]);
    expect(z.bezeichnung).toBe("Gemeinschaftsschule");
    expect(SCHULART_LABEL[z.arten[0]!]).toBe("Gesamtschule");
  });

  it("führt mehrere Bestandteile zusammen", () => {
    expect(ordneSchulartZu("Grundschule|Vorschulklasse", "X").bezeichnung).toBe("Grundschule");
    expect(ordneSchulartZu("Grund- und Oberschule", "X").bezeichnung).toBe("Grund- und Oberschule");
  });
});
