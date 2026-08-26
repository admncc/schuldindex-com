import { describe, expect, it } from "vitest";
import { FRAGEN, KEINE_ANGABE, type Antwort, type Skalenwert } from "./fragebogen.js";
import type { Antworten } from "./scoring.js";
import type { Geobefund } from "./geopruefung.js";
import { GRENZEN, HALTESCHWELLE, pruefe, pruefeAntwortmuster, type Pruefkontext } from "./betrugspruefung.js";

const GEO_OK: Geobefund = {
  entfernungKm: 12,
  unbekannt: false,
  haltenWegenEntfernung: false,
  begruendung: null,
};
const GEO_ZU_WEIT: Geobefund = {
  entfernungKm: 612,
  unbekannt: false,
  haltenWegenEntfernung: true,
  begruendung: "612 km entfernt, Grenze 150 km",
};

/** Unauffällige Antworten: gestreute Werte über die Pflichtkategorien. */
function normaleAntworten(): Antworten {
  const a: Record<string, Antwort> = {};
  let i = 0;
  for (const frage of FRAGEN) {
    if (!["A", "B", "C"].includes(frage.kategorie)) continue;
    a[frage.id] = ((i++ % 4) + 2) as Skalenwert; // 2,3,4,5 im Wechsel
  }
  return a;
}

function alleGleich(wert: Skalenwert): Antworten {
  const a: Record<string, Antwort> = {};
  for (const frage of FRAGEN) if (["A", "B", "C"].includes(frage.kategorie)) a[frage.id] = wert;
  return a;
}

const RUHIG: Pruefkontext = {
  geo: GEO_OK,
  antworten: normaleAntworten(),
  abgabenLetzteZehnMinuten: 1,
  schulenLetzte24Stunden: 1,
  bewertungenDieserSchuleLetzteStunde: 2,
  freitextAuffaellig: false,
  kontoPerEmail: false,
};

describe("Antwortmuster", () => {
  it("meldet, wenn jede Frage dieselbe Antwort hat", () => {
    const signale = pruefeAntwortmuster(alleGleich(3));
    expect(signale.map((s) => s.art)).toContain("alles_gleich");
  });

  it("meldet ausschließlich Extremwerte", () => {
    const a: Record<string, Antwort> = {};
    let i = 0;
    for (const frage of FRAGEN) {
      if (["A", "B", "C"].includes(frage.kategorie)) a[frage.id] = (i++ % 2 === 0 ? 1 : 5) as Skalenwert;
    }
    expect(pruefeAntwortmuster(a).map((s) => s.art)).toContain("nur_extremwerte");
  });

  it("hält Bestnoten für sich genommen nicht für verdächtig", () => {
    // Eine tatsächlich sehr gute Schule bekommt zu Recht überall Bestnoten.
    // Das Signal wiegt deshalb so leicht, dass es allein nichts auslöst.
    const punkte = pruefeAntwortmuster(alleGleich(5)).reduce((s, x) => s + x.gewicht, 0);
    expect(punkte).toBeLessThan(HALTESCHWELLE);
  });

  it("schweigt bei gestreuten Antworten", () => {
    expect(pruefeAntwortmuster(normaleAntworten())).toEqual([]);
  });

  it("urteilt nicht über zu wenige Antworten", () => {
    const wenige: Record<string, Antwort> = {};
    for (const frage of FRAGEN.slice(0, 5)) wenige[frage.id] = 3;
    expect(pruefeAntwortmuster(wenige)).toEqual([]);
  });

  it("übergeht nicht beurteilte Fragen", () => {
    const a: Record<string, Antwort> = { ...alleGleich(3) };
    for (const frage of FRAGEN.slice(0, 8)) a[frage.id] = KEINE_ANGABE;
    expect(pruefeAntwortmuster(a).map((s) => s.art)).toContain("alles_gleich");
  });
});

describe("Gesamtprüfung", () => {
  it("lässt eine unauffällige Bewertung durch", () => {
    const e = pruefe(RUHIG);
    expect(e.halten).toBe(false);
    expect(e.grund).toBeNull();
    expect(e.signale).toEqual([]);
  });

  it("hält allein wegen der Entfernung zurück", () => {
    const e = pruefe({ ...RUHIG, geo: GEO_ZU_WEIT });
    expect(e.halten).toBe(true);
    expect(e.grund).toBe("geo");
  });

  it("hält zurück, wenn der Absender nicht lokalisierbar ist", () => {
    const e = pruefe({
      ...RUHIG,
      geo: { entfernungKm: null, unbekannt: true, haltenWegenEntfernung: true, begruendung: "Absender nicht lokalisierbar" },
    });
    expect(e.halten).toBe(true);
    expect(e.grund).toBe("geo");
  });

  it("hält bei zu vielen Abgaben aus einer Quelle zurück", () => {
    const e = pruefe({ ...RUHIG, abgabenLetzteZehnMinuten: GRENZEN.abgabenJeZehnMinuten + 1 });
    expect(e.halten).toBe(true);
    expect(e.grund).toBe("betrug");
  });

  it("summiert schwache Signale, statt sie einzeln zu verwerfen", () => {
    // Vier Schulen an einem Tag (2) plus Konto ohne Telefonnummer (1) plus
    // durchgehend gleiche Antworten (2) — jedes für sich harmlos, zusammen
    // auffällig genug für einen Blick durch einen Menschen.
    const e = pruefe({
      ...RUHIG,
      schulenLetzte24Stunden: GRENZEN.schulenJeTag + 1,
      kontoPerEmail: true,
      antworten: alleGleich(4),
    });
    expect(e.punkte).toBeGreaterThanOrEqual(HALTESCHWELLE);
    expect(e.halten).toBe(true);
    expect(e.grund).toBe("betrug");
  });

  it("lässt ein einzelnes schwaches Signal durch", () => {
    const e = pruefe({ ...RUHIG, kontoPerEmail: true });
    expect(e.punkte).toBe(1);
    expect(e.halten).toBe(false);
  });

  it("stellt die Entfernung als Grund voran, wenn beides zutrifft", () => {
    // „Zu weit entfernt“ lässt sich der bewertenden Person erklären,
    // „auffälliges Muster“ nicht, ohne die Prüfung zu verraten.
    const e = pruefe({
      ...RUHIG,
      geo: GEO_ZU_WEIT,
      abgabenLetzteZehnMinuten: GRENZEN.abgabenJeZehnMinuten + 1,
    });
    expect(e.grund).toBe("geo");
  });

  it("nennt jedes Signal mit einer Begründung für die Moderation", () => {
    const e = pruefe({ ...RUHIG, geo: GEO_ZU_WEIT, freitextAuffaellig: true });
    expect(e.signale).toHaveLength(2);
    for (const signal of e.signale) {
      expect(signal.erlaeuterung.length).toBeGreaterThan(5);
    }
  });

  it("behandelt eine Schulklasse im Unterricht nicht wie eine Kampagne", () => {
    // Zwanzig Bewertungen einer Schule in einer Stunde können eine Klasse sein.
    // Das Signal wiegt deshalb 2 und hält für sich genommen nicht.
    const e = pruefe({ ...RUHIG, bewertungenDieserSchuleLetzteStunde: 20 });
    expect(e.punkte).toBe(2);
    expect(e.halten).toBe(false);
  });
});
