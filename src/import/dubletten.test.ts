import { describe, expect, it } from "vitest";
import { fuehreZusammen, stammId, vollstaendigkeit, type Dublettenkandidat } from "./dubletten";

function k(teil: Partial<Dublettenkandidat> & { quellId: string }): Dublettenkandidat {
  return {
    name: "Struensee Gymnasium",
    plz: "22767",
    strasse: null,
    lat: null,
    website: null,
    telefon: null,
    email: null,
    traeger: null,
    ...teil,
  };
}

describe("Stamm-ID", () => {
  it("entfernt das Zählsuffix Hamburgs", () => {
    expect(stammId("HH-5805-2")).toBe("HH-5805");
    expect(stammId("HH-5805-0")).toBe("HH-5805");
  });

  it("hält die laufende Nummer einer gewöhnlichen ID nicht für ein Suffix", () => {
    // Sonst würde aus „NI-43424“ ein „NI“ - und schlagartig gälten alle 3.141
    // niedersächsischen Schulen als Standorte derselben Einrichtung.
    expect(stammId("NI-43424")).toBe("NI-43424");
    expect(stammId("BW-1")).toBe("BW-1");
  });

  it("lässt IDs ohne Suffix unangetastet", () => {
    expect(stammId("NI-43424")).toBe("NI-43424");
    expect(stammId("SH-9117089")).toBe("SH-9117089");
  });
});

describe("Vollständigkeit", () => {
  it("lässt die Koordinate schwerer wiegen als alle anderen Felder zusammen", () => {
    // Sie ist das einzige Feld, das sich nicht nachtragen lässt, ohne erneut
    // einen fremden Dienst zu befragen - der danebengreifen kann.
    const nurKoordinate = k({ quellId: "a", lat: 53.5 });
    const allesAusserKoordinate = k({
      quellId: "b",
      strasse: "Dohrnweg 6",
      website: "https://x.de",
      telefon: "040",
      email: "a@b.de",
      traeger: "Stadt",
    });
    expect(vollstaendigkeit(nurKoordinate)).toBeGreaterThan(vollstaendigkeit(allesAusserKoordinate));
    expect(vollstaendigkeit(k({ quellId: "c" }))).toBe(0);
  });
});

describe("Zusammenführung", () => {
  it("lässt einzelne Schulen unangetastet", () => {
    const e = fuehreZusammen([k({ quellId: "HH-1" })]);
    expect(e).toHaveLength(1);
    expect(e[0]!.aufgegangen).toEqual([]);
  });

  it("führt Standorte mit gemeinsamer Stamm-ID zusammen", () => {
    // Der reale Fall: „Struensee Gymnasium“ stand dreimal in der Trefferliste.
    const e = fuehreZusammen([
      k({ quellId: "HH-5805-0", strasse: "Dohrnweg 6" }),
      k({ quellId: "HH-5805-1", strasse: "Struenseestraße 20" }),
      k({ quellId: "HH-5805-2", strasse: "Dohrnweg 6", lat: 53.55 }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]!.haupt.quellId).toBe("HH-5805-2"); // der mit Koordinate
    expect(e[0]!.aufgegangen).toHaveLength(2);
    expect(e[0]!.standorte.some((s) => s.strasse === "Struenseestraße 20")).toBe(true);
  });

  it("führt dieselbe Schule aus zwei Quellsystemen zusammen", () => {
    const e = fuehreZusammen([
      k({ quellId: "SH-9117089", name: "Struensee Gemeinschaftsschule", plz: "24986", strasse: "Dennertweg" }),
      k({ quellId: "SH-0707558", name: "Struensee Gemeinschaftsschule", plz: "24986", strasse: "Dennertweg", lat: 54.6 }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]!.haupt.quellId).toBe("SH-0707558");
  });

  it("führt Außenstellen derselben Schule zusammen und bewahrt die Adressen", () => {
    // Der reale Fall: „Grundschule Tengen, 78250“ stand viermal untereinander -
    // vier Außenstellen in verschiedenen Ortsteilen, jede mit eigener Straße.
    const e = fuehreZusammen([
      k({ quellId: "BW-04150137", name: "Grundschule Tengen", plz: "78250", strasse: "Schulstr. 11", lat: 47.8183 }),
      k({ quellId: "BW-FB-aaa", name: "Grundschule Tengen", plz: "78250", strasse: "Im Tempel 3", lat: 47.7976 }),
      k({ quellId: "BW-FB-bbb", name: "Grundschule Tengen", plz: "78250", strasse: "Wannenstr. 14", lat: 47.8375 }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]!.aufgegangen).toHaveLength(2);
    // Nichts geht verloren: die weiteren Adressen bleiben als Standorte erhalten,
    // damit sich die Zusammenführung notfalls wieder auflösen lässt.
    expect(e[0]!.standorte.map((s) => s.strasse).sort()).toEqual(["Im Tempel 3", "Wannenstr. 14"]);
  });

  it("führt keine Schulen verschiedener Postleitzahlen zusammen", () => {
    const e = fuehreZusammen([
      k({ quellId: "NI-43424", name: "Grundschule Nord", plz: "30159", strasse: "Schulweg 1" }),
      k({ quellId: "NI-43425", name: "Grundschule Nord", plz: "30161", strasse: "Am Markt 8" }),
    ]);
    expect(e).toHaveLength(2);
  });

  it("trennt nach Postleitzahl", () => {
    const e = fuehreZusammen([
      k({ quellId: "BE-1000", name: "Goethe-Schule", plz: "10115" }),
      k({ quellId: "BY-2000", name: "Goethe-Schule", plz: "80331" }),
    ]);
    expect(e).toHaveLength(2);
  });

  it("wählt bei gleicher Vollständigkeit immer denselben Datensatz", () => {
    // Sonst hinge von der Lieferreihenfolge ab, welcher Slug bestehen bleibt -
    // und beim nächsten Import bräche jeder geteilte Link.
    const eingabe = [
      k({ quellId: "HH-5805-2", strasse: "Dohrnweg 6" }),
      k({ quellId: "HH-5805-0", strasse: "Dohrnweg 6" }),
      k({ quellId: "HH-5805-1", strasse: "Dohrnweg 6" }),
    ];
    const vorwaerts = fuehreZusammen(eingabe);
    const rueckwaerts = fuehreZusammen([...eingabe].reverse());
    expect(rueckwaerts[0]!.haupt.quellId).toBe(vorwaerts[0]!.haupt.quellId);
    expect(vorwaerts[0]!.haupt.quellId).toBe("HH-5805-0");
  });

  it("verliert keine Schule", () => {
    const eingabe = [
      k({ quellId: "HH-5805-0" }),
      k({ quellId: "HH-5805-1" }),
      k({ quellId: "NI-9999", name: "Andere Schule", plz: "30159" }),
    ];
    const e = fuehreZusammen(eingabe);
    const alle = e.flatMap((z) => [z.haupt.quellId, ...z.aufgegangen]);
    expect(new Set(alle)).toEqual(new Set(eingabe.map((x) => x.quellId)));
  });
});
