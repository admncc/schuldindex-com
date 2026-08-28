import { describe, expect, it } from "vitest";
import { SCHWELLE_KM, entfernungKm, pruefeEinreichung } from "./geopruefung";

const HAMBURG_RATHAUS = { lat: 53.5503, lon: 9.992 };
const MUENCHEN_MARIENPLATZ = { lat: 48.1374, lon: 11.5755 };
const LUEBECK = { lat: 53.8655, lon: 10.6866 };
const BREMEN = { lat: 53.0758, lon: 8.8072 };

describe("Entfernung", () => {
  it("rechnet bekannte Strecken richtig", () => {
    // Werte gegengeprüft mit Postgres' earth_distance - beide Wege rechnen
    // mit demselben Erdradius, damit sie nicht auseinanderlaufen.
    expect(entfernungKm(HAMBURG_RATHAUS, MUENCHEN_MARIENPLATZ)).toBeCloseTo(612.716, 2);
    expect(entfernungKm(HAMBURG_RATHAUS, LUEBECK)).toBeCloseTo(57.67, 2);
  });

  it("ist symmetrisch", () => {
    expect(entfernungKm(HAMBURG_RATHAUS, LUEBECK)).toBeCloseTo(
      entfernungKm(LUEBECK, HAMBURG_RATHAUS),
      9,
    );
  });

  it("ergibt für denselben Punkt null", () => {
    expect(entfernungKm(HAMBURG_RATHAUS, HAMBURG_RATHAUS)).toBe(0);
  });

  it("kommt mit sehr kleinen Abständen zurecht", () => {
    // Der Wurzelausdruck kann bei nahen Punkten numerisch kippen.
    const nebenan = { lat: HAMBURG_RATHAUS.lat + 0.00001, lon: HAMBURG_RATHAUS.lon };
    const km = entfernungKm(HAMBURG_RATHAUS, nebenan);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(0.01);
  });
});

describe("Prüfung einer Einreichung", () => {
  it("lässt eine Bewertung aus der Nachbarschaft durch", () => {
    const befund = pruefeEinreichung({ absender: LUEBECK, schule: HAMBURG_RATHAUS });
    expect(befund.haltenWegenEntfernung).toBe(false);
    expect(befund.entfernungKm).toBeCloseTo(57.7, 1);
    expect(befund.begruendung).toBeNull();
  });

  it("hält eine Bewertung aus 600 km Entfernung zurück", () => {
    const befund = pruefeEinreichung({ absender: MUENCHEN_MARIENPLATZ, schule: HAMBURG_RATHAUS });
    expect(befund.haltenWegenEntfernung).toBe(true);
    expect(befund.begruendung).toMatch(/61[23] km entfernt, Grenze 150 km/);
  });

  it("lässt genau an der Grenze noch durch", () => {
    // Die Regel lautet „weiter als 150 km“, nicht „ab 150 km“.
    const befund = pruefeEinreichung({ absender: BREMEN, schule: HAMBURG_RATHAUS }, 95);
    expect(befund.entfernungKm).toBeCloseTo(95, 0);
    expect(befund.haltenWegenEntfernung).toBe(false);
  });

  it("hält zurück, wenn der Absender nicht lokalisierbar ist", () => {
    // Proxy oder VPN - genau das Verhalten, das eine Kampagne zeigt.
    const befund = pruefeEinreichung({ absender: null, schule: HAMBURG_RATHAUS });
    expect(befund.haltenWegenEntfernung).toBe(true);
    expect(befund.unbekannt).toBe(true);
    expect(befund.begruendung).toBe("Absender nicht lokalisierbar");
  });

  it("hält zurück, wenn die Schule keine Koordinate hat", () => {
    // Ungeprüft durchlassen wäre die schlechtere Wahl.
    const befund = pruefeEinreichung({ absender: HAMBURG_RATHAUS, schule: null });
    expect(befund.haltenWegenEntfernung).toBe(true);
    expect(befund.begruendung).toContain("ohne Koordinate");
  });

  it("nutzt 150 km als Voreinstellung", () => {
    expect(SCHWELLE_KM).toBe(150);
    // Berlin–Hamburg sind rund 255 km und damit über der Grenze.
    const berlin = { lat: 52.52, lon: 13.405 };
    expect(pruefeEinreichung({ absender: berlin, schule: HAMBURG_RATHAUS }).haltenWegenEntfernung).toBe(true);
  });

  it("lässt sich für Betrieb und Sonderfälle nachziehen", () => {
    const berlin = { lat: 52.52, lon: 13.405 };
    const befund = pruefeEinreichung({ absender: berlin, schule: HAMBURG_RATHAUS }, 300);
    expect(befund.haltenWegenEntfernung).toBe(false);
  });
});
