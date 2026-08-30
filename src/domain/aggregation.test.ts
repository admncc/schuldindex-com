import { describe, expect, it } from "vitest";
import { FRAGEN, type Antwort, type Skalenwert } from "./fragebogen";
import { bewerte, type Antworten } from "./scoring";
import {
  MINDESTZAHL_KATEGORIE,
  MINDESTZAHL_PROFIL,
  MINDESTZAHL_RANGLISTE,
  aggregiere,
  berechneTrend,
  type EinzelneBewertung,
} from "./aggregation";

/** Antworten mit festem Wert je Kategorie; nicht genannte bleiben offen. */
function antworten(werte: Partial<Record<string, Skalenwert>>): Antworten {
  const a: Record<string, Antwort> = {};
  for (const frage of FRAGEN) {
    const wert = werte[frage.kategorie];
    if (wert !== undefined) a[frage.id] = wert;
  }
  return a;
}

function bewertung(
  werte: Partial<Record<string, Skalenwert>>,
  extra: Partial<EinzelneBewertung> = {},
): EinzelneBewertung {
  return {
    ergebnis: bewerte(antworten(werte)),
    rolle: "schueler_ab_16",
    hatFreitext: false,
    erstelltAm: new Date("2026-08-01"),
    ...extra,
  };
}

const VIELE = (n: number, w: Partial<Record<string, Skalenwert>>, extra = {}) =>
  Array.from({ length: n }, () => bewertung(w, extra));

describe("Aggregation", () => {
  it("zählt Bewertungen, Rollen und Freitexte", () => {
    const a = aggregiere([
      bewertung({ A: 4, B: 4, C: 4 }, { rolle: "eltern", hatFreitext: true }),
      bewertung({ A: 4, B: 4, C: 4 }, { rolle: "eltern" }),
      bewertung({ A: 4, B: 4, C: 4 }, { rolle: "lehrkraft", hatFreitext: true }),
    ]);
    expect(a.anzahl).toBe(3);
    expect(a.anzahlJeRolle).toEqual({ eltern: 2, lehrkraft: 1 });
    expect(a.anzahlMitFreitext).toBe(2);
  });

  it("merkt sich die jüngste Bewertung", () => {
    const a = aggregiere([
      bewertung({ A: 3, B: 3, C: 3 }, { erstelltAm: new Date("2026-01-15") }),
      bewertung({ A: 3, B: 3, C: 3 }, { erstelltAm: new Date("2026-07-20") }),
    ]);
    expect(a.letzteBewertungAm?.toISOString().slice(0, 10)).toBe("2026-07-20");
  });

  it("mittelt je Kategorie über alle, die sie beurteilt haben", () => {
    const a = aggregiere([bewertung({ A: 5, B: 5, C: 5 }), bewertung({ A: 3, B: 3, C: 3 })]);
    // Klima 5 und 3 → 4; Aggression roh 5 und 3 → invertiert 1 und 3 → 2
    // Score_A = 0,7 × 4 + 0,3 × 2 = 3,4
    expect(a.kategorien.A).toBeCloseTo(3.4, 6);
    expect(a.kategorien.B).toBeCloseTo(4, 6);
    expect(a.kategorien.D).toBeUndefined();
  });

  it("gewichtet die Kategoriemittel, statt Gesamtscores zu mitteln", () => {
    // Der Unterschied wird sichtbar, sobald nicht alle dieselben optionalen
    // Kategorien beantworten. Fünf beurteilen nur A–C, fünf zusätzlich D -
    // fünf, weil ein freiwilliger Bereich unter MINDESTZAHL_KATEGORIE gar
    // nicht erst ausgewiesen wird.
    const ohneD = VIELE(5, { A: 4, B: 4, C: 4 });
    const mitD = VIELE(5, { A: 4, B: 4, C: 4, D: 1 });

    const a = aggregiere([...ohneD, ...mitD]);
    // Kategoriemittel: A = 0,7×4 + 0,3×2 = 3,4 (die beiden Häufigkeitsfragen
    // kehren sich um: Rohwert 4 wird zu 2), B = 4, C = 4, D = 1 - Letzteres
    // beurteilte nur die Hälfte.
    // (3,4×4 + 4×2 + 4×2 + 1×1) ÷ 9 = 30,6 ÷ 9 = 3,4 → 6,00 auf der Zehnerskala
    expect(a.gesamtscoreIntern).toBeCloseTo(6.0, 2);

    // Der Mittelwert der Einzelscores läge daneben - das ist genau der
    // Unterschied, um den es geht.
    const mittelDerEinzelnen =
      (ohneD[0]!.ergebnis.gesamtscore + mitD[0]!.ergebnis.gesamtscore) / 2;
    expect(a.gesamtscoreIntern).not.toBeCloseTo(mittelDerEinzelnen, 2);
  });

  it("mittelt den Aggressionsindex aus den Rohwerten", () => {
    const a = aggregiere([bewertung({ A: 1, B: 3, C: 3 }), bewertung({ A: 5, B: 3, C: 3 })]);
    // Rohwerte 1 und 5 → Index 3 → mittlere Häufigkeit
    expect(a.aggressionsindex).toBeCloseTo(3, 6);
    expect(a.aggressionsstufe).toBe("mittel");
  });
});

describe("Sichtbarkeitsschwellen", () => {
  it("veröffentlicht keinen Score unterhalb von zehn Bewertungen", () => {
    const a = aggregiere(VIELE(MINDESTZAHL_PROFIL - 1, { A: 4, B: 4, C: 4 }));
    expect(a.sichtbar).toBe(false);
    expect(a.gesamtscore).toBeNull();
    expect(a.stufe).toBeNull();
    // Intern liegt der Wert vor - die Moderation braucht ihn.
    expect(a.gesamtscoreIntern).not.toBeNull();
    // Die Zahl der Bewertungen bleibt sichtbar - sie lädt zum Mitmachen ein.
    expect(a.anzahl).toBe(9);
  });

  it("veröffentlicht ab zehn Bewertungen", () => {
    const a = aggregiere(VIELE(MINDESTZAHL_PROFIL, { A: 4, B: 4, C: 4 }));
    expect(a.sichtbar).toBe(true);
    expect(a.gesamtscore).not.toBeNull();
    expect(a.stufe).toBe("mittel");
  });

  it("nimmt Schulen erst ab zwanzig Bewertungen in Ranglisten auf", () => {
    expect(aggregiere(VIELE(MINDESTZAHL_RANGLISTE - 1, { A: 4, B: 4, C: 4 })).ranglistenfaehig).toBe(false);
    expect(aggregiere(VIELE(MINDESTZAHL_RANGLISTE, { A: 4, B: 4, C: 4 })).ranglistenfaehig).toBe(true);
  });

  it("erlaubt die Zusammenfassung erst ab zehn Freitexten", () => {
    const mitText = { hatFreitext: true };
    expect(aggregiere(VIELE(9, { A: 4, B: 4, C: 4 }, mitText)).zusammenfassungMoeglich).toBe(false);
    expect(aggregiere(VIELE(10, { A: 4, B: 4, C: 4 }, mitText)).zusammenfassungMoeglich).toBe(true);
    // Zwanzig Bewertungen, aber nur fünf mit Text: noch keine Grundlage.
    const gemischt = [...VIELE(15, { A: 4, B: 4, C: 4 }), ...VIELE(5, { A: 4, B: 4, C: 4 }, mitText)];
    expect(aggregiere(gemischt).zusammenfassungMoeglich).toBe(false);
  });
});

describe("Trend", () => {
  const gut = { A: 5, B: 5, C: 5 } as const;
  const mittelmaessig = { A: 3, B: 3, C: 3 } as const;

  it("erkennt eine Verbesserung", () => {
    const t = berechneTrend(VIELE(10, gut), VIELE(10, mittelmaessig));
    expect(t.richtung).toBe("verbessert");
    expect(t.veraenderung).toBeGreaterThan(0);
  });

  it("erkennt eine Verschlechterung", () => {
    expect(berechneTrend(VIELE(10, mittelmaessig), VIELE(10, gut)).richtung).toBe("verschlechtert");
  });

  it("nennt gleichbleibende Werte stabil", () => {
    const t = berechneTrend(VIELE(10, gut), VIELE(10, gut));
    expect(t.richtung).toBe("stabil");
    expect(t.veraenderung).toBeCloseTo(0, 6);
  });

  it("schweigt, wenn ein Zeitfenster zu dünn besetzt ist", () => {
    // Sonst entstünde aus zwei Bewertungen im Vorjahr und zwanzig im
    // laufenden Jahr ein „Trend“, der nur die gewachsene Beteiligung abbildet.
    const t = berechneTrend(VIELE(20, gut), VIELE(2, mittelmaessig));
    expect(t.richtung).toBe("unbekannt");
    expect(t.veraenderung).toBeNull();
  });

  it("wertet kleine Schwankungen nicht als Bewegung", () => {
    const knappBesser = [...VIELE(9, gut), bewertung({ A: 5, B: 5, C: 4 })];
    const t = berechneTrend(knappBesser, VIELE(10, gut));
    expect(t.richtung).toBe("stabil");
  });
});

describe("Obergrenze auf Schulebene", () => {
  /** Bestnoten - invertierte Fragen andersherum, sonst wäre „5“ das Gegenteil. */
  function bestens(kategorien: readonly string[]): Antworten {
    const a: Record<string, Antwort> = {};
    for (const frage of FRAGEN) {
      if (!kategorien.includes(frage.kategorie)) continue;
      a[frage.id] = (frage.wertung === "invertiert" ? 1 : 5) as Skalenwert;
    }
    return a;
  }

  const beste = (kategorien: readonly string[]): EinzelneBewertung => ({
    ergebnis: bewerte(bestens(kategorien)),
    rolle: "schueler_ab_16",
    hatFreitext: false,
    erstelltAm: new Date("2026-08-01"),
  });

  it("lässt eine einzelne Bewertung die Deckelung nicht aushebeln", () => {
    // Der teuer erkaufte Fehler: Ein freiwilliger Bereich galt als vorhanden,
    // sobald ein einziger Mensch eine einzige Frage daraus beantwortet hatte.
    // Zwanzig Bewertungen nur zu A, B und C standen bei 8,5; eine
    // einundzwanzigste mit Kreuzen in D, E und F hob die ganze Schule auf 10,0.
    const nurPflicht = Array.from({ length: 20 }, () => beste(["A", "B", "C"]));
    const ohne = aggregiere(nurPflicht);
    const mitEiner = aggregiere([...nurPflicht, beste(["A", "B", "C", "D", "E", "F"])]);

    expect(ohne.gesamtscoreIntern).toBeCloseTo(8.5, 6);
    // Eine einzelne Stimme bewegt gar nichts mehr: Unterhalb von
    // MINDESTZAHL_KATEGORIE wird der Bereich nicht ausgewiesen - sonst stünde
    // dort die Auskunft genau dieser einen Person.
    expect(mitEiner.gesamtscoreIntern).toBeCloseTo(8.5, 6);
    expect(mitEiner.kategorien.D).toBeUndefined();
  });

  it("weist einen freiwilligen Bereich ab der Untergrenze aus - mit dem Hebel der Abdeckung", () => {
    const nurPflicht = Array.from({ length: 20 }, () => beste(["A", "B", "C"]));
    const mitVieren = aggregiere([
      ...nurPflicht,
      ...Array.from({ length: MINDESTZAHL_KATEGORIE - 1 }, () => beste(["A", "B", "C", "D"])),
    ]);
    const mitFuenfen = aggregiere([
      ...nurPflicht,
      ...Array.from({ length: MINDESTZAHL_KATEGORIE }, () => beste(["A", "B", "C", "D"])),
    ]);

    expect(mitVieren.kategorien.D).toBeUndefined();
    expect(mitVieren.gesamtscoreIntern).toBeCloseTo(8.5, 6);

    expect(mitFuenfen.kategorien.D).not.toBeUndefined();
    expect(mitFuenfen.gesamtscoreIntern!).toBeGreaterThan(8.5);
    // Ein Fünftel Abdeckung: sichtbar, aber ohne Hebel.
    expect(mitFuenfen.gesamtscoreIntern!).toBeLessThan(8.75);
  });

  it("erreicht die vollen 10, wenn wirklich alle alle Bereiche beurteilt haben", () => {
    const alle = aggregiere(Array.from({ length: 20 }, () => beste(["A", "B", "C", "D", "E", "F"])));
    expect(alle.gesamtscoreIntern).toBeCloseTo(10, 6);
  });

  it("wächst mit der Abdeckung", () => {
    const haelfte = aggregiere([
      ...Array.from({ length: 10 }, () => beste(["A", "B", "C", "D"])),
      ...Array.from({ length: 10 }, () => beste(["A", "B", "C"])),
    ]);
    const alle = aggregiere(Array.from({ length: 20 }, () => beste(["A", "B", "C", "D"])));
    expect(haelfte.gesamtscoreIntern!).toBeLessThan(alle.gesamtscoreIntern!);
    expect(alle.gesamtscoreIntern).toBeCloseTo(9, 6);
  });
});
