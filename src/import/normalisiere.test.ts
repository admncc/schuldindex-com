import { describe, expect, it } from "vitest";
import { baueSuchtext, normalisiere, pruefeKoordinate, type Rohschule } from "./normalisiere";

const NORDHOLZ: Rohschule = {
  id: "NI-43424",
  name: "Grundschule Nordholz",
  address: "Nordweg 75",
  city: "Wurster Nordseeküste",
  zip: "27639",
  provider: "Gemeinde Wurster Nordseeküste",
  school_type: "Grundschule",
  website: "http://www.grundschule-nordholz.de",
  email: "Schule@GS-nordholz.de",
  latitude: 53.7838893,
  longitude: 8.6151039,
  update_timestamp: "2026-08-22T16:38:09.532753",
};

function schule(roh: Partial<Rohschule> = {}) {
  const ergebnis = normalisiere({ ...NORDHOLZ, ...roh });
  if (!ergebnis.ok) throw new Error(`unerwartet verworfen: ${ergebnis.grund}`);
  return ergebnis.schule;
}

describe("Normalisierung", () => {
  it("übernimmt die Kernfelder", () => {
    const s = schule();
    expect(s.quellId).toBe("NI-43424");
    expect(s.bundesland).toBe("NI");
    expect(s.schularten).toEqual(["grundschule"]);
    expect(s.ort).toBe("Wurster Nordseeküste");
  });

  it("übernimmt vorhandene Koordinaten als Stufe „quelle“", () => {
    const s = schule();
    expect(s.lat).toBeCloseTo(53.7839, 4);
    expect(s.genauigkeit).toBe("quelle");
  });

  it("lässt Schulen ohne Koordinaten für die Nachgeocodierung offen", () => {
    const s = schule({ latitude: null, longitude: null });
    expect(s.lat).toBeNull();
    expect(s.genauigkeit).toBeNull();
  });

  it("räumt überflüssige Leerzeichen weg", () => {
    expect(schule({ name: "  Grundschule   Nordholz " }).name).toBe("Grundschule Nordholz");
    expect(schule({ city: "   " }).ort).toBeNull();
  });

  it("führt zweiteilige Anschriften zusammen", () => {
    expect(schule({ address: "Nordweg 75", address2: "Haus B" }).strasse).toBe("Nordweg 75, Haus B");
  });

  it("ergänzt das fehlende Schema bei Adressen im Netz", () => {
    expect(schule({ website: "www.beispielschule.de" }).website).toBe("https://www.beispielschule.de");
    expect(schule({ website: "https://x.de" }).website).toBe("https://x.de");
    expect(schule({ website: "wird nachgereicht" }).website).toBeNull();
  });
});

describe("Verworfene Datensätze", () => {
  it("verwirft Schulämter und Seminare", () => {
    const e = normalisiere({ ...NORDHOLZ, school_type: "Schulaufsicht" });
    expect(e).toMatchObject({ ok: false, grund: "keine Schule" });
  });

  it("verwirft Datensätze ohne erkennbares Bundesland", () => {
    const e = normalisiere({ ...NORDHOLZ, id: "XX-1" });
    expect(e).toMatchObject({ ok: false, grund: "kein Bundesland" });
  });

  it("verwirft Datensätze ohne Namen", () => {
    expect(normalisiere({ ...NORDHOLZ, name: "  " })).toMatchObject({ ok: false, grund: "kein Name" });
  });

});

describe("Koordinaten aus der Quelle", () => {
  it("übernimmt eine brauchbare Koordinate", () => {
    expect(pruefeKoordinate(53.78, 8.61, "NI")).toEqual({ art: "uebernommen", lat: 53.78, lon: 8.61 });
  });

  it("dreht vertauschte Breite und Länge zurück", () => {
    // Die Quelle liefert 13 Schulen in Nordrhein-Westfalen verdreht. Da
    // Deutschland zwischen 47–55° Nord und 6–15° Ost liegt, überschneiden sich
    // die Bereiche nicht - die Vertauschung ist eindeutig erkennbar.
    expect(pruefeKoordinate(7.3465, 51.447, "NW")).toEqual({ art: "vertauscht", lat: 51.447, lon: 7.3465 });
  });

  it("erkennt die Nullinsel als unbrauchbar", () => {
    expect(pruefeKoordinate(0, 0, "NI")).toEqual({ art: "unbrauchbar" });
  });

  it("erkennt eine Koordinate im falschen Bundesland", () => {
    // Rheinland-Pfalz liefert 24 Schulen so: die Koordinate liegt in
    // Deutschland, aber hunderte Kilometer entfernt. Eine Grundschule bei
    // Kaiserslautern steht auf Dresden.
    expect(pruefeKoordinate(51.083, 13.735, "RP")).toEqual({ art: "falsches_bundesland" });
  });

  it("erkennt Koordinaten im Ausland als unbrauchbar", () => {
    expect(pruefeKoordinate(48.21, 16.37, "NI")).toEqual({ art: "unbrauchbar" }); // Wien
  });

  it("meldet eine fehlende Koordinate als solche", () => {
    expect(pruefeKoordinate(null, null, "NI")).toEqual({ art: "fehlt" });
    expect(pruefeKoordinate(53.78, null, "NI")).toEqual({ art: "fehlt" });
  });

  it("behält die Schule, wenn nur die Koordinate unbrauchbar ist", () => {
    // Eine reale Schule wegen eines einzigen kaputten Feldes zu verwerfen wäre
    // falsch - sie geht ohne Koordinate in die Nachgeocodierung.
    const e = normalisiere({ ...NORDHOLZ, latitude: 0, longitude: 0 });
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.schule.lat).toBeNull();
      expect(e.schule.koordinatenbefund).toBe("unbrauchbar");
    }
  });

  it("rettet die verdrehte Koordinate in die Schule hinein", () => {
    const e = normalisiere({ ...NORDHOLZ, latitude: 7.3465, longitude: 51.447 });
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.schule.lat).toBeCloseTo(51.447, 3);
      expect(e.schule.genauigkeit).toBe("quelle");
      expect(e.schule.koordinatenbefund).toBe("vertauscht");
    }
  });
});

describe("Suchtext", () => {
  it("nimmt jeden Begriff in beiden Umlautformen auf", () => {
    // Postgres' unaccent macht aus „Grünewald“ ein „Grunewald“. Wer
    // „Gruenewald“ tippt, fände damit nichts - deshalb stehen beide da.
    const text = baueSuchtext(["Grünewald-Schule"]);
    expect(text).toContain("grünewald-schule");
    expect(text).toContain("gruenewald schule");
  });

  it("deckt beide Schreibweisen von ß ab", () => {
    const text = baueSuchtext(["Straßenschule"]);
    expect(text).toContain("straßenschule");
    expect(text).toContain("strassenschule");
  });

  it("nimmt Ort und PLZ mit auf, damit „Gymnasium Kiel“ als Suche funktioniert", () => {
    const s = schule();
    expect(s.suchtext).toContain("wurster nordseeküste");
    expect(s.suchtext).toContain("wurster nordseekueste");
    expect(s.suchtext).toContain("27639");
  });

  it("übergeht leere Bestandteile", () => {
    expect(baueSuchtext([null, "", "Schule"])).toBe("schule");
  });
});
