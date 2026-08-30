import { describe, expect, it } from "vitest";
import {
  FRAGEN,
  KEINE_ANGABE,
  fragenDerKategorie,
  type Antwort,
  type KategorieId,
  type Skalenwert,
} from "./fragebogen";
import {
  UnvollstaendigeBewertung,
  aggressionsindex,
  ampelstufe,
  aufZehnerskala,
  bewerte,
  formatiereScore,
  formatiereScoreMitSkala,
  erreichteObergrenze,
  hoechstwert,
  punktwert,
  scoreKategorie,
  scorestufe,
  unbekannteFragen,
  type Antworten,
} from "./scoring";

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

// ---- Wertebereich ----

describe("Wertebereich des Gesamtscores", () => {
  it("erreicht bei durchweg bester Bewertung genau 10", () => {
    expect(bewerte(besteBewertung()).gesamtscore).toBeCloseTo(10, 10);
  });

  it("fällt bei durchweg schlechtester Bewertung auf 0, nicht auf 2", () => {
    // Die Skala wird normalisiert, nicht multipliziert: Ø × 2 ergäbe 2–10 und
    // damit dieselbe tote Zone am unteren Ende wie der Faktor 20 aus der Spec.
    expect(bewerte(schlechtesteBewertung()).gesamtscore).toBeCloseTo(0, 10);
  });

  it("bleibt für jede zulässige Antwortkombination innerhalb von 0 bis 10", () => {
    for (const wert of [1, 2, 3, 4, 5] as const) {
      const score = bewerte(roh({ A: wert, B: wert, C: wert, D: wert, E: wert, F: wert }))
        .gesamtscore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });

  it("ergibt bei durchweg Rohwert 5 nicht 10, weil die Aggressionsfragen invertiert werden", () => {
    // Rohwert 5 heißt bei A2/A3 „Sehr häufig“ - das ist das Gegenteil von gut.
    // Score_A = 0,7 × 5 + 0,3 × 1 = 3,8
    // Gesamt  = (3,8×4 + 5×2 + 5×2 + 5×1 + 5×1 + 5×1) ÷ 11 = 4,5636… → 8,9091
    const score = bewerte(roh({ A: 5, B: 5, C: 5, D: 5, E: 5, F: 5 })).gesamtscore;
    expect(score).toBeCloseTo(8.9091, 3);
    expect(score).not.toBeCloseTo(10, 1);
  });

  it("bildet die Antwortstufen auf runde Werte ab", () => {
    expect(aufZehnerskala(1)).toBeCloseTo(0, 10);   // Sehr schlecht
    expect(aufZehnerskala(2)).toBeCloseTo(2.5, 10); // Schlecht
    expect(aufZehnerskala(3)).toBeCloseTo(5, 10);   // Befriedigend
    expect(aufZehnerskala(4)).toBeCloseTo(7.5, 10); // Gut
    expect(aufZehnerskala(5)).toBeCloseTo(10, 10);  // Sehr gut
  });
});

describe("Farbstufen des Scores", () => {
  it("färbt ab „Gut“ grün und ab „Befriedigend“ gelb", () => {
    expect(scorestufe(10)).toBe("gut");
    expect(scorestufe(7.5)).toBe("gut");
    expect(scorestufe(7.49)).toBe("mittel");
    expect(scorestufe(5.0)).toBe("mittel");
    expect(scorestufe(4.99)).toBe("schlecht");
    expect(scorestufe(0)).toBe("schlecht");
  });

  it("deckt jeden erreichbaren Score lückenlos ab", () => {
    for (let i = 0; i <= 1000; i++) {
      expect(["gut", "mittel", "schlecht"]).toContain(scorestufe(i / 100));
    }
  });

  it("färbt eine durchweg mit „Befriedigend“ bewertete Schule gelb, nicht rot", () => {
    // Grenzfall, der bei gleichen Dritteln (Grenze 3,33) rot geworden wäre.
    const ergebnis = bewerte(roh({ A: 3, B: 3, C: 3 }));
    expect(ergebnis.gesamtscore).toBeCloseTo(5, 1);
    expect(ergebnis.stufe).toBe("mittel");
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

describe("Obergrenze nach Vollständigkeit", () => {
  /** Schlechtestmögliche Antworten in genau den genannten Kategorien. */
  function schlechtIn(kategorien: readonly KategorieId[]): Antworten {
    const antworten: Record<string, Antwort> = {};
    for (const f of FRAGEN) {
      if (!kategorien.includes(f.kategorie)) continue;
      antworten[f.id] = (f.wertung === "invertiert" ? 5 : 1) as Skalenwert;
    }
    return antworten;
  }

  /** Bestnoten in genau den genannten Kategorien. */
  function bestensIn(kategorien: readonly KategorieId[]): Antworten {
    const antworten: Record<string, Antwort> = {};
    for (const f of FRAGEN) {
      if (!kategorien.includes(f.kategorie)) continue;
      antworten[f.id] = (f.wertung === "invertiert" ? 1 : 5) as Skalenwert;
    }
    return antworten;
  }

  it("deckelt eine Bestbewertung der Pflichtbereiche bei 8,5", () => {
    // Ohne Deckelung wären es glatte 10 - und eine Schule, über die nur
    // Sicherheit, Unterricht und Ausstattung bekannt sind, stünde gleichauf mit
    // einer, über die alles bekannt ist.
    expect(bewerte(bestensIn(["A", "B", "C"])).gesamtscore).toBeCloseTo(8.5, 6);
  });

  it("hebt die Grenze je freiwilligem Bereich um 0,5", () => {
    expect(bewerte(bestensIn(["A", "B", "C", "D"])).gesamtscore).toBeCloseTo(9.0, 6);
    expect(bewerte(bestensIn(["A", "B", "C", "D", "F"])).gesamtscore).toBeCloseTo(9.5, 6);
    expect(bewerte(bestensIn(["A", "B", "C", "D", "E", "F"])).gesamtscore).toBeCloseTo(10, 6);
  });

  it("lässt eine mittelmäßige Bewertung unberührt", () => {
    // Die Deckelung ist keine Umrechnung: Wer die Grenze nicht erreicht, merkt
    // nichts von ihr. „Befriedigend“ in allen Pflichtbereichen bleibt 5,0 und
    // damit gelb - nicht 4,25 und rot.
    expect(bewerte(roh({ A: 3, B: 3, C: 3 })).gesamtscore).toBeCloseTo(5, 6);
  });

  it("belohnt keine schlechte Zusatzangabe", () => {
    // Der teuer erkaufte Fehler: Als jeder beantwortete Bereich die Grenze um
    // volle 0,5 hob, stieg eine Bestbewertung der Pflichtbereiche von 8,5 auf
    // 8,9, sobald ein „Sehr schlecht“ in Bereich D dazukam. Wer das merkt,
    // füllt D, E und F mit Unsinn aus.
    const nurPflicht = bewerte(bestensIn(["A", "B", "C"])).gesamtscore;
    const mitSchlechtemD = bewerte({
      ...bestensIn(["A", "B", "C"]),
      ...schlechtIn(["D"]),
    }).gesamtscore;
    expect(mitSchlechtemD).toBeLessThanOrEqual(nurPflicht);
  });

  it("steigt mit der Güte des zusätzlichen Bereichs", () => {
    const pflicht = bestensIn(["A", "B", "C"]);
    const schlecht = bewerte({ ...pflicht, ...schlechtIn(["D"]) }).gesamtscore;
    const mittel = bewerte({ ...pflicht, ...roh({ D: 3 }) }).gesamtscore;
    const gut = bewerte({ ...pflicht, ...bestensIn(["D"]) }).gesamtscore;
    expect(schlecht).toBeLessThan(mittel);
    expect(mittel).toBeLessThan(gut);
    expect(gut).toBeCloseTo(9.0, 6);
  });

  it("rechnet die erreichte Grenze aus den Werten der freiwilligen Bereiche", () => {
    expect(erreichteObergrenze([])).toBe(8.5);
    expect(erreichteObergrenze([5])).toBe(9);
    expect(erreichteObergrenze([1])).toBe(8.5);
    expect(erreichteObergrenze([3])).toBeCloseTo(8.75, 6);
    expect(erreichteObergrenze([5, 5, 5])).toBe(10);
  });

  it("rechnet die Grenze aus der Zahl der freiwilligen Bereiche", () => {
    expect(hoechstwert(0)).toBe(8.5);
    expect(hoechstwert(1)).toBe(9);
    expect(hoechstwert(3)).toBe(10);
    // Mehr als es gibt, hebt nichts weiter an.
    expect(hoechstwert(9)).toBe(10);
  });
});

describe("Optionale Kategorien", () => {
  it("zählt D, E und F nicht mit, solange sie unbeantwortet sind", () => {
    // A = 4 (Klima 4, Aggression roh 2 → invertiert 4), B = 3, C = 5
    // (4×3 + 3×2 + 5×2) ÷ 7 = 28 ÷ 7 = 4,0 → auf der Zehnerskala 7,5
    const antworten: Record<string, Antwort> = { ...roh({ B: 3, C: 5 }) };
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 2 : 4;
    }
    const ergebnis = bewerte(antworten);
    expect(ergebnis.gesamtscore).toBeCloseTo(7.5, 10);
    for (const id of ["D", "E", "F"] as const) {
      expect(ergebnis.kategorien.find((k) => k.kategorie === id)?.score).toBeNull();
    }
  });

  it("nimmt eine optionale Kategorie samt Gewicht auf, sobald sie beantwortet ist", () => {
    // wie oben, zusätzlich D = 2:  (34) ÷ 9 = 3,7778… → 6,9444
    // (A 4×4 + B 3×2 + C 5×2 + D 2×1 = 16 + 6 + 10 + 2)
    const antworten: Record<string, Antwort> = { ...roh({ B: 3, C: 5, D: 2 }) };
    for (const f of fragenDerKategorie("A")) {
      antworten[f.id] = f.teilbereich === "aggression" ? 2 : 4;
    }
    expect(bewerte(antworten).gesamtscore).toBeCloseTo(6.9444, 3);
  });

  it("verlangt A, B und C - eine fehlende Pflichtkategorie ist ein Fehler", () => {
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
    // Zwischenwerte regelmäßig - etwa bei A2 = 2, A3 = 3 → 2,5.
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
    expect(formatiereScore(9.1818)).toBe("9,2");
    expect(formatiereScore(7.5)).toBe("7,5");
  });

  it("nennt die Skala mit, damit die Zahl allein nicht missverstanden wird", () => {
    expect(formatiereScoreMitSkala(8.4)).toBe("8,4 von 10");
  });
});
