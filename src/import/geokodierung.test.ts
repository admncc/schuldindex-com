import { describe, expect, it, vi } from "vitest";
import {
  baueAnfragen,
  geokodiere,
  liegtImBundesland,
  liegtInDeutschland,
  plzPasst,
  pruefe,
  type Anschrift,
  type Geocoder,
  type Koordinate,
} from "./geokodierung";

const NORDHOLZ: Anschrift = {
  name: "Grundschule Nordholz",
  strasse: "Nordweg 75",
  plz: "27639",
  ort: "Wurster Nordseeküste",
  bundesland: "NI",
};

/** Geocoder-Attrappe: liefert je Anfragetext ein festgelegtes Ergebnis. */
function attrappe(antworten: Record<string, Koordinate | null>): Geocoder {
  return {
    name: "Attrappe",
    suche: vi.fn(async (anfrage: string) => antworten[anfrage] ?? null),
  };
}

describe("Anfragestufen", () => {
  it("beginnt mit dem Schulnamen samt Adresse", () => {
    const [erste] = baueAnfragen(NORDHOLZ);
    expect(erste?.text).toBe("Grundschule Nordholz, Nordweg 75, 27639 Wurster Nordseeküste");
    expect(erste?.genauigkeit).toBe("adresse");
  });

  it("wird von Stufe zu Stufe gröber", () => {
    expect(baueAnfragen(NORDHOLZ).map((a) => a.genauigkeit)).toEqual([
      "adresse",
      "adresse",
      "plz",
      "ort",
    ]);
  });

  it("überspringt Stufen, für die Angaben fehlen", () => {
    const ohneStrasse = { ...NORDHOLZ, strasse: null };
    expect(baueAnfragen(ohneStrasse).map((a) => a.genauigkeit)).toEqual(["plz", "ort"]);

    const nurOrt = { ...NORDHOLZ, strasse: null, plz: null };
    expect(baueAnfragen(nurOrt)).toHaveLength(1);
    expect(baueAnfragen(nurOrt)[0]?.text).toBe("Wurster Nordseeküste, Niedersachsen");
  });

  it("kommt ohne jede Ortsangabe zu keiner Anfrage", () => {
    expect(baueAnfragen({ ...NORDHOLZ, strasse: null, plz: null, ort: null })).toHaveLength(0);
  });
});

describe("Plausibilitätsprüfung", () => {
  it("erkennt Koordinaten innerhalb Deutschlands", () => {
    expect(liegtInDeutschland({ lat: 53.78, lon: 8.61 })).toBe(true);
    expect(liegtInDeutschland({ lat: 48.21, lon: 16.37 })).toBe(false); // Wien
    expect(liegtInDeutschland({ lat: 46.95, lon: 7.44 })).toBe(false); // Bern
  });

  it("ordnet Koordinaten dem richtigen Bundesland zu", () => {
    expect(liegtImBundesland({ lat: 53.78, lon: 8.61 }, "NI")).toBe(true);
    expect(liegtImBundesland({ lat: 48.14, lon: 11.58 }, "BY")).toBe(true); // München
    expect(liegtImBundesland({ lat: 48.14, lon: 11.58 }, "SH")).toBe(false);
  });

  it("lässt Schulen dicht an der Landesgrenze durch", () => {
    // Hamburgs Umland reicht weit ins niedersächsische Gebiet; ohne Zugabe
    // fielen grenznahe Schulen reihenweise durch.
    expect(liegtImBundesland({ lat: 53.40, lon: 10.20 }, "HH")).toBe(true);
  });

  it("weist die Nullinsel zurück", () => {
    // Ein Geocoder ohne Treffer liefert gelegentlich 0/0 statt eines Fehlers.
    expect(pruefe({ lat: 0, lon: 0 }, "NI")).toBe("Nullinsel");
  });

  it("benennt den Grund einer Zurückweisung", () => {
    expect(pruefe({ lat: 48.14, lon: 11.58 }, "SH")).toBe("außerhalb von Schleswig-Holstein");
    expect(pruefe({ lat: 48.21, lon: 16.37 }, "NI")).toBe("außerhalb Deutschlands");
    expect(pruefe({ lat: 53.78, lon: 8.61 }, "NI")).toBeNull();
  });
});

describe("Ablauf der Geokodierung", () => {
  it("nimmt das genaueste plausible Ergebnis", async () => {
    const g = attrappe({
      "Grundschule Nordholz, Nordweg 75, 27639 Wurster Nordseeküste": { lat: 53.7839, lon: 8.6151 },
    });
    const ergebnis = await geokodiere(NORDHOLZ, g);
    expect(ergebnis.genauigkeit).toBe("adresse");
    expect(ergebnis.koordinate?.lat).toBeCloseTo(53.7839, 4);
  });

  it("fällt auf die PLZ zurück, wenn die Adresse nichts hergibt", async () => {
    const g = attrappe({ "27639 Wurster Nordseeküste": { lat: 53.77, lon: 8.62 } });
    const ergebnis = await geokodiere(NORDHOLZ, g);
    expect(ergebnis.genauigkeit).toBe("plz");
    // Für die 150-km-Prüfung ist das vollwertig — nur die Karte stellt es anders dar.
    expect(ergebnis.koordinate).not.toBeNull();
  });

  it("verwirft einen Treffer im falschen Bundesland und sucht weiter", async () => {
    // Der reale Fall: „Neustadt“ gibt es dutzendfach. Ein Geocoder, der die
    // Adresse in Bayern findet, würde die Schule 600 km entfernt platzieren —
    // und jede Bewertung aus ihrer Nachbarschaft fiele durch die Geo-Prüfung.
    const g = attrappe({
      "Grundschule Nordholz, Nordweg 75, 27639 Wurster Nordseeküste": { lat: 48.14, lon: 11.58 },
      "Nordweg 75, 27639 Wurster Nordseeküste": { lat: 48.14, lon: 11.58 },
      "27639 Wurster Nordseeküste": { lat: 53.77, lon: 8.62 },
    });
    const ergebnis = await geokodiere(NORDHOLZ, g);
    expect(ergebnis.genauigkeit).toBe("plz");
    expect(ergebnis.koordinate?.lat).toBeCloseTo(53.77, 2);
  });

  it("meldet den Grund, wenn am Ende nichts Plausibles übrig bleibt", async () => {
    const g = attrappe({
      "Grundschule Nordholz, Nordweg 75, 27639 Wurster Nordseeküste": { lat: 48.14, lon: 11.58 },
    });
    const ergebnis = await geokodiere(NORDHOLZ, g);
    expect(ergebnis.koordinate).toBeNull();
    expect(ergebnis.genauigkeit).toBe("keine");
    expect(ergebnis.verworfenWeil).toBe("außerhalb von Niedersachsen");
  });

  it("fragt nicht weiter, sobald ein Treffer sitzt", async () => {
    const g = attrappe({
      "Grundschule Nordholz, Nordweg 75, 27639 Wurster Nordseeküste": { lat: 53.78, lon: 8.61 },
      "27639 Wurster Nordseeküste": { lat: 53.77, lon: 8.62 },
    });
    await geokodiere(NORDHOLZ, g);
    // Jede gesparte Anfrage ist bei 5.048 Schulen und einer Anfrage je Sekunde
    // eine gesparte Sekunde Laufzeit.
    expect(g.suche).toHaveBeenCalledTimes(1);
  });
});

describe("Postleitzahl des Treffers", () => {
  it("verlangt Gleichheit, nicht Ähnlichkeit", () => {
    expect(plzPasst("25899", "25899")).toBe(true);
    expect(plzPasst("25899", " 25899 ")).toBe(true);
    // Der reale Fehlgriff: „Schulstraße 5, 25899 Klixbüll“ wurde rund 110 km
    // weiter südlich gefunden. Beide Orte liegen in Schleswig-Holstein und
    // beide Postleitzahlen beginnen mit 25 — ein Vergleich der ersten beiden
    // Stellen hätte das durchgelassen.
    expect(plzPasst("25899", "25524")).toBe(false);
    expect(plzPasst("25899", "25917")).toBe(false);
  });

  it("prüft nicht, was sich nicht prüfen lässt", () => {
    expect(plzPasst(null, "25899")).toBe(true);
    expect(plzPasst("25899", null)).toBe(true);
    expect(plzPasst("25899", undefined)).toBe(true);
  });
});

describe("Postleitzahl im Ablauf", () => {
  const KLIXBUELL: Anschrift = {
    name: "Grundschule Klixbüll",
    strasse: "Schulstraße 5",
    plz: "25899",
    ort: "Klixbüll",
    bundesland: "SH",
  };

  it("verwirft einen Treffer mit fremder Postleitzahl und sucht weiter", async () => {
    const g: Geocoder = {
      name: "Attrappe",
      suche: vi.fn(async (anfrage: string) =>
        anfrage.startsWith("Grundschule Klixbüll,")
          ? { lat: 53.8434, lon: 9.3995, plz: "25524" } // falscher Ort, gleiches Bundesland
          : { lat: 54.8023, lon: 8.8941, plz: "25899" },
      ),
    };
    const ergebnis = await geokodiere(KLIXBUELL, g);
    expect(ergebnis.koordinate?.lat).toBeCloseTo(54.8023, 3);
  });

  it("lässt auf der Ortsstufe eine abweichende Postleitzahl zu", async () => {
    // Dort wurde bewusst nur nach dem Ort gefragt — eine passende
    // Postleitzahl wäre gar nicht zu erwarten.
    const nurOrt = { ...KLIXBUELL, strasse: null, plz: "25899" };
    const g: Geocoder = {
      name: "Attrappe",
      suche: vi.fn(async (anfrage: string) =>
        anfrage.includes("Schleswig-Holstein") ? { lat: 54.8, lon: 8.89, plz: "25917" } : null,
      ),
    };
    const ergebnis = await geokodiere(nurOrt, g);
    expect(ergebnis.genauigkeit).toBe("ort");
    expect(ergebnis.koordinate).not.toBeNull();
  });
});