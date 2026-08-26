import { describe, expect, it } from "vitest";
import {
  ausschnittFuer,
  bildfeld,
  DEUTSCHLAND,
  liegtImAusschnitt,
  mercatorY,
  projiziere,
  punktradius,
  rasterweite,
} from "./karte";
import { BUNDESLAENDER } from "./bundesland";

const FELD = bildfeld(DEUTSCHLAND, 800);

/** Ein paar Orte, deren Lage zueinander jeder kennt. */
const ORTE = {
  flensburg: { lat: 54.783, lon: 9.434 },
  hamburg: { lat: 53.551, lon: 9.993 },
  koeln: { lat: 50.937, lon: 6.96 },
  berlin: { lat: 52.52, lon: 13.405 },
  muenchen: { lat: 48.135, lon: 11.582 },
  goerlitz: { lat: 51.155, lon: 14.988 },
};

describe("mercatorY", () => {
  it("wächst mit der Breite", () => {
    expect(mercatorY(55)).toBeGreaterThan(mercatorY(47));
    expect(mercatorY(0)).toBeCloseTo(0, 10);
  });

  it("dehnt den Norden stärker als den Süden", () => {
    // Das ist der ganze Unterschied zur einfachen Streckung: ein Grad im Norden
    // ist im Bild mehr wert als ein Grad im Süden.
    const nord = mercatorY(55) - mercatorY(54);
    const sued = mercatorY(48) - mercatorY(47);
    expect(nord).toBeGreaterThan(sued);
  });
});

describe("bildfeld", () => {
  it("macht Deutschland höher als breit", () => {
    expect(FELD.hoehe).toBeGreaterThan(FELD.breite);
  });

  it("macht Nordrhein-Westfalen und Hamburg fast quadratisch", () => {
    // Nordrhein-Westfalen misst rund 250 km in beide Richtungen — die erste
    // Fassung dieses Tests erwartete „breiter als hoch“ und lag damit falsch.
    const nw = bildfeld(ausschnittFuer("NW"), 800);
    expect(nw.hoehe / nw.breite).toBeGreaterThan(0.85);
    expect(nw.hoehe / nw.breite).toBeLessThan(1.2);
    const hh = bildfeld(ausschnittFuer("HH"), 800);
    expect(hh.hoehe / hh.breite).toBeGreaterThan(0.6);
    expect(hh.hoehe / hh.breite).toBeLessThan(1.4);
  });
});

describe("projiziere", () => {
  it("bildet die Ecken des Ausschnitts auf die Ecken des Bildes ab", () => {
    const linksOben = projiziere(DEUTSCHLAND.nord, DEUTSCHLAND.west, DEUTSCHLAND, FELD);
    const rechtsUnten = projiziere(DEUTSCHLAND.sued, DEUTSCHLAND.ost, DEUTSCHLAND, FELD);
    expect(linksOben.x).toBeCloseTo(0, 6);
    expect(linksOben.y).toBeCloseTo(0, 6);
    expect(rechtsUnten.x).toBeCloseTo(FELD.breite, 6);
    expect(rechtsUnten.y).toBeCloseTo(FELD.hoehe, 6);
  });

  it("legt die Städte richtig zueinander", () => {
    const p = Object.fromEntries(
      Object.entries(ORTE).map(([name, o]) => [name, projiziere(o.lat, o.lon, DEUTSCHLAND, FELD)]),
    ) as Record<keyof typeof ORTE, { x: number; y: number }>;

    expect(p.flensburg.y).toBeLessThan(p.hamburg.y); // Norden ist oben
    expect(p.hamburg.y).toBeLessThan(p.muenchen.y);
    expect(p.koeln.x).toBeLessThan(p.berlin.x); // Westen ist links
    expect(p.berlin.x).toBeLessThan(p.goerlitz.x);
    expect(p.muenchen.x).toBeGreaterThan(p.koeln.x);
  });

  it("hält das Seitenverhältnis: Hamburg–Berlin ist kürzer als Hamburg–München", () => {
    const abstand = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const hh = projiziere(ORTE.hamburg.lat, ORTE.hamburg.lon, DEUTSCHLAND, FELD);
    const be = projiziere(ORTE.berlin.lat, ORTE.berlin.lon, DEUTSCHLAND, FELD);
    const mu = projiziere(ORTE.muenchen.lat, ORTE.muenchen.lon, DEUTSCHLAND, FELD);
    // In Wirklichkeit: 255 km gegen 612 km.
    expect(abstand(hh, be)).toBeLessThan(abstand(hh, mu));
    expect(abstand(hh, mu) / abstand(hh, be)).toBeGreaterThan(1.8);
    expect(abstand(hh, mu) / abstand(hh, be)).toBeLessThan(3.0);
  });
});

describe("ausschnittFuer", () => {
  it("gibt ohne Bundesland ganz Deutschland", () => {
    expect(ausschnittFuer(null)).toBe(DEUTSCHLAND);
  });

  it("umschließt jedes Bundesland vollständig mit Deutschland", () => {
    for (const b of BUNDESLAENDER) {
      const a = ausschnittFuer(b);
      expect(a.sued, b).toBeGreaterThanOrEqual(DEUTSCHLAND.sued);
      expect(a.nord, b).toBeLessThanOrEqual(DEUTSCHLAND.nord);
      expect(a.west, b).toBeGreaterThanOrEqual(DEUTSCHLAND.west);
      expect(a.ost, b).toBeLessThanOrEqual(DEUTSCHLAND.ost);
    }
  });

  it("enthält die jeweilige Landeshauptstadt", () => {
    expect(liegtImAusschnitt(ORTE.muenchen.lat, ORTE.muenchen.lon, ausschnittFuer("BY"))).toBe(true);
    expect(liegtImAusschnitt(ORTE.berlin.lat, ORTE.berlin.lon, ausschnittFuer("BE"))).toBe(true);
    expect(liegtImAusschnitt(ORTE.hamburg.lat, ORTE.hamburg.lon, ausschnittFuer("HH"))).toBe(true);
    // Und eben nicht die eines anderen Landes:
    expect(liegtImAusschnitt(ORTE.muenchen.lat, ORTE.muenchen.lon, ausschnittFuer("SH"))).toBe(false);
  });
});

describe("rasterweite", () => {
  it("wird feiner, je kleiner der Ausschnitt", () => {
    expect(rasterweite(DEUTSCHLAND)).toBeGreaterThan(rasterweite(ausschnittFuer("BY")));
    expect(rasterweite(ausschnittFuer("BY"))).toBeGreaterThan(rasterweite(ausschnittFuer("HH")));
  });
});

describe("punktradius", () => {
  it("wächst mit der Zahl, aber gedämpft", () => {
    expect(punktradius(1)).toBeLessThan(punktradius(4));
    expect(punktradius(4)).toBeLessThan(punktradius(25));
    // Eine Zelle mit vierzig Schulen darf nicht halb München überdecken.
    expect(punktradius(40)).toBeLessThan(punktradius(1) * 4);
  });

  it("bleibt sichtbar und begrenzt", () => {
    expect(punktradius(1)).toBeGreaterThan(0.8);
    expect(punktradius(10_000)).toBeLessThanOrEqual(4.5);
  });
});
