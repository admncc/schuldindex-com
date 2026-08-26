import { describe, expect, it } from "vitest";
import {
  FRAGEN,
  KEINE_ANGABE,
  fragenDerKategorie,
  type Antwort,
  type KategorieId,
  type Skalenwert,
} from "./fragebogen.js";
import {
  UnvollstaendigeBewertung,
  aggressionsindex,
  ampelstufe,
  bewerte,
  formatiereScore,
  punktwert,
  scoreKategorie,
  unbekannteFragen,
  type Antworten,
} from "./scoring.js";

// ---- Hilfsmittel ----

/** Setzt in den genannten Kategorien jede Frage auf denselben ROHWERT. */
function roh(werte: Partial<Record<KategorieId, Antwort>>): Antworten {
  const antworten: Record<string, Antwort> = {};
  for (const frage of FRAGEN) {
    const wert = werte[frage.kategorie];
    if (wert !== undefined) antworten[frage.id] = wert;
  }
  return antworten;
}

/** Bewertung, die überall den bestmöglichen Punktwert ergibt (invertierte Fragen: „Nie“). */
function besteBewertung(): Antworten {
  return Object.fromEntries(
    FRAGEN.map((f) => [f.id, (f.wertung === "invertiert" ? 1 : 5) as Skalenwert]),
  );
}

function schlechtesteBewertung(): Antworten {
  return Object.fromEntries(
    FRAGEN.map((f) => [f.id, (f.wertung === "invertiert" ? 5 : 1) as Skalenwert]),
  );
}

// ---- Punktwert und Inversion ----

describe("Punktwert", () => {
  it("übernimmt direkt gewertete Fragen unverändert", () => {
    const a1 = FRAGEN.find((f) => f.id === "A1")!;
    expect(punktwert(a1, 4)).toBe(4);
  });

  it("invertiert die Häufigkeitsfragen nach 6 − Rohwert", () => {
    const a2 = FRAGEN.find((f) => f.id === "A2")!;
    expect(punktwert(a2, 1)).toBe(5); // Nie          → bestmöglich
    expect(punktwert(a2, 2)).toBe(4); // Selten
    expect(punktwert(a2, 3)).toBe(3); // Gelegentlich
    expect(punktwert(a2, 4)).toBe(2); // Häufig
    expect(punktwert(a2, 5)).toBe(1); // Sehr häufig  → schlechtestmöglich
  });

  it("liefert für „Kann ich nicht beurteilen“ keinen Punktwert", () => {
    const a1 = FRAGEN.find((f) => f.id === "A1")!;
    expect(punktwert(a1, KEINE_ANGABE)).toBeNull();
  });
});

// ---- Wertebereich (Entscheidung E7) ----

describe("Wertebereich des Gesamtscores", () => {
  it("erreicht bei durchweg bester Bewertung genau 100", () => {
    expect(bewerte(besteBewertung()).gesamtscore).toBeCloseTo(100, 10);
  });

  it("fällt bei durchweg schlechtester Bewertung auf 20, nicht auf 0", () => {
    // Dokumentiert E7: der niedrigste Kategoriemittelwert ist 1, und 1 × 20 = 20.
    // Der Wertebereich ist damit 20–100. Das muss im UI kommuniziert werden.
    expect(bewerte(schlechtesteBewertung()).gesamtscore).toBeCloseTo(20, 10);
  });

  it("bleibt für jede zulässige Antwortkombination innerhalb von 20 bis 100", () => {
    for (const wert of [1, 2, 3, 4, 5] as const) {
      const score = bewerte(roh({ A: wert, B: wert, C: wert, D: wert, E: wert, F: wert }))
        .gesamtscore;
      expect(score).toBeGreaterThanOrEqual(20);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("ergibt bei durchweg Rohwert 5 nicht 100, weil die Aggressionsfragen invertiert werden", () => {
    // Rohwert 5 heißt bei A2/A3 „Sehr häufig“ — das ist das Gegenteil von gut.
    // Score_A = 0,7 × 5 + 0,3 × 1 = 3,8
    // Gesamt  = (3,8×3 + 5×2 + 5×2 + 5×2 + 5×1 + 5×1) ÷ 11 × 20 = 93,4545…
    const score = bewerte(roh({ A: 5, B: 5, C: 5, D: 5, E: 5, F: 5 })).gesamtscore;
    expect(score).toBeCloseTo(93.4545, 3);
    expect(score).not.toBeCloseTo(100, 1);
  });
});

// ---- Kategorie A: 70/30-Aufteilung ----

describe("Kategorie A", () => {
  it("gewichtet Klima mit 0,7 und Aggression mit 0,3", () => {
    // Klima durchweg 5, Aggression roh 5 → invertiert 1
    // 0,7 × 5 + 0,3 × 1 = 3,8
    const antworten: Record<string, Antwort> = {};
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 5 : 5;
    }
    expect(scoreKategorie("A", antworten).score).toBeCloseTo(3.8, 10);
  });

  it("erreicht 5, wenn das Klima gut ist und nie Aggression berichtet wird", () => {
    const antworten: Record<string, Antwort> = {};
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 1 : 5;
    }
    expect(scoreKategorie("A", antworten).score).toBeCloseTo(5, 10);
  });

  it("wertet den vorhandenen Teilbereich allein, wenn der andere unbeantwortet bleibt", () => {
    // Nur Klimafragen beantwortet: keine künstliche Abwertung der Pflichtkategorie.
    const antworten: Record<string, Antwort> = {};
    for (const f of fragenDerKategorie("A")) {
      if (f.teilbereich === "klima") antworten[f.id] = 4;
    }
    expect(scoreKategorie("A", antworten).score).toBeCloseTo(4, 10);
  });
});

// ---- Optionale Kategorien ----

describe("Optionale Kategorien", () => {
  it("zählt D, E und F nicht mit, solange sie unbeantwortet sind", () => {
    // A = 4 (Klima 4, Aggression roh 2 → invertiert 4), B = 3, C = 5
    // (4×3 + 3×2 + 5×2) ÷ 7 × 20 = 28 ÷ 7 × 20 = 80
    const antworten: Record<string, Antwort> = { ...roh({ B: 3, C: 5 }) };
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 2 : 4;
    }
    const ergebnis = bewerte(antworten);
    expect(ergebnis.gesamtscore).toBeCloseTo(80, 10);
    for (const id of ["D", "E", "F"] as const) {
      expect(ergebnis.kategorien.find((k) => k.kategorie === id)?.score).toBeNull();
    }
  });

  it("nimmt eine optionale Kategorie samt Gewicht auf, sobald sie beantwortet ist", () => {
    // wie oben, zusätzlich D = 2:  (28 + 2×2) ÷ 9 × 20 = 32 ÷ 9 × 20 = 71,111…
    const antworten: Record<string, Antwort> = { ...roh({ B: 3, C: 5, D: 2 }) };
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 2 : 4;
    }
    expect(bewerte(antworten).gesamtscore).toBeCloseTo(71.1111, 3);
  });

  it("verlangt A, B und C — eine fehlende Pflichtkategorie ist ein Fehler", () => {
    expect(() => bewerte(roh({ A: 4, B: 4 }))).toThrow(UnvollstaendigeBewertung);
    try {
      bewerte(roh({ A: 4, B: 4 }));
    } catch (fehler) {
      expect((fehler as UnvollstaendigeBewertung).fehlendeKategorien).toEqual(["C"]);
    }
  });
});

// ---- „Kann ich nicht beurteilen“ ----

describe("Nicht beurteilte Fragen", () => {
  it("nimmt sie aus dem Mittelwert heraus, statt sie als 0 zu werten", () => {
    const fragen = fragenDerKategorie("B");
    const antworten: Record<string, Antwort> = {};
    fragen.forEach((f, i) => {
      antworten[f.id] = i < 5 ? 4 : KEINE_ANGABE;
    });
    const ergebnis = scoreKategorie("B", antworten);
    expect(ergebnis.score).toBeCloseTo(4, 10);
    expect(ergebnis.beantwortet).toBe(5);
  });

  it("behandelt eine vollständig übersprungene optionale Kategorie wie eine fehlende", () => {
    const antworten: Record<string, Antwort> = { ...roh({ A: 3, B: 3, C: 3 }) };
    for (const f of fragenDerKategorie("E")) antworten[f.id] = KEINE_ANGABE;
    const ergebnis = bewerte(antworten);
    expect(ergebnis.kategorien.find((k) => k.kategorie === "E")?.score).toBeNull();
  });
});

// ---- Aggressionsindex und Ampel (Entscheidung E8) ----

describe("Aggressionsindex", () => {
  it("mittelt die ROHEN Häufigkeitswerte, nicht die invertierten", () => {
    const antworten: Antworten = { A2: 4, A3: 2 };
    expect(aggressionsindex(antworten)?.index).toBeCloseTo(3, 10);
  });

  it("liefert keinen Index, wenn beide Fragen unbeantwortet blieben", () => {
    expect(aggressionsindex({ A2: KEINE_ANGABE, A3: KEINE_ANGABE })).toBeNull();
    expect(aggressionsindex({})).toBeNull();
  });

  it("rechnet mit einer Frage weiter, wenn nur eine beantwortet wurde", () => {
    expect(aggressionsindex({ A2: 5 })?.index).toBeCloseTo(5, 10);
  });
});

describe("Ampelstufen", () => {
  it("ordnet die in der Spec genannten Grenzwerte zu", () => {
    expect(ampelstufe(1.0)).toBe("gering");
    expect(ampelstufe(2.0)).toBe("gering");
    expect(ampelstufe(2.1)).toBe("mittel");
    expect(ampelstufe(3.4)).toBe("mittel");
    expect(ampelstufe(3.5)).toBe("hoch");
    expect(ampelstufe(5.0)).toBe("hoch");
  });

  it("lässt keine Lücke zwischen den Stufen (E8)", () => {
    // Die Spec nennt ≤ 2,0 / 2,1–3,4 / ≥ 3,5 und lässt damit 2,0–2,1 sowie
    // 3,4–3,5 undefiniert. Der Index ist ein Mittelwert und trifft diese
    // Zwischenwerte regelmäßig — etwa bei A2 = 2, A3 = 3 → 2,5.
    expect(ampelstufe(2.05)).toBe("mittel");
    expect(ampelstufe(3.45)).toBe("mittel");
    expect(ampelstufe(2.5)).toBe("mittel");
  });

  it("deckt jeden erreichbaren Indexwert ab", () => {
    for (let i = 100; i <= 500; i++) {
      expect(["gering", "mittel", "hoch"]).toContain(ampelstufe(i / 100));
    }
  });
});

// ---- Verlässlichkeit ----

describe("Verlässlichkeit", () => {
  it("liefert für identische Antworten identische Scores", () => {
    const a = besteBewertung();
    expect(bewerte(a).gesamtscore).toBe(bewerte({ ...a }).gesamtscore);
  });

  it("hängt nicht von der Reihenfolge der Antworten ab", () => {
    const antworten = roh({ A: 3, B: 4, C: 2, D: 5 });
    const umgedreht = Object.fromEntries(Object.entries(antworten).reverse());
    expect(bewerte(umgedreht).gesamtscore).toBeCloseTo(bewerte(antworten).gesamtscore, 12);
  });

  it("ignoriert Frage-IDs, die es im Fragebogen nicht gibt, und meldet sie", () => {
    const antworten = { ...roh({ A: 3, B: 3, C: 3 }), Z99: 5 as Skalenwert };
    expect(unbekannteFragen(antworten)).toEqual(["Z99"]);
    expect(bewerte(antworten).gesamtscore).toBeCloseTo(bewerte(roh({ A: 3, B: 3, C: 3 })).gesamtscore, 12);
  });
});

describe("Anzeige", () => {
  it("formatiert Scores mit deutschem Dezimalkomma", () => {
    expect(formatiereScore(93.4545)).toBe("93,5");
    expect(formatiereScore(80)).toBe("80,0");
  });
});
