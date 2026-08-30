import { describe, expect, it } from "vitest";
import {
  GEWINNE,
  baueLose,
  erzeugeZufallswert,
  letzterMonat,
  monatsname,
  monatszeitraum,
  pruefeMehrfachziehung,
  pruefeZiehung,
  teilnahmeAn,
  type Teilnahme,
  ziehe,
  zieheMehrere,
  ziehungsmeldung,
} from "./verlosung";

function teilnahme(kontoId: string, bewertungId: string, rolle = "schueler_ab_16"): Teilnahme {
  return { kontoId, bewertungId, rolle };
}

describe("monatszeitraum", () => {
  it("umfasst den ganzen Monat und nicht mehr", () => {
    const august = monatszeitraum(2026, 8);
    expect(august.von.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(august.bis.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("kommt über den Jahreswechsel", () => {
    const dezember = monatszeitraum(2026, 12);
    expect(dezember.bis.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rechnet in UTC, damit die Sommerzeit die Grenze nicht verschiebt", () => {
    // Eine Abgabe am 1. August um 00:30 Uhr UTC gehört zum August - unabhängig
    // davon, ob in Deutschland gerade Sommerzeit gilt.
    const august = monatszeitraum(2026, 8);
    const abgabe = new Date("2026-08-01T00:30:00.000Z");
    expect(abgabe >= august.von && abgabe < august.bis).toBe(true);
  });

  it("schließt lückenlos an den Vormonat an", () => {
    expect(monatszeitraum(2026, 7).bis.getTime()).toBe(monatszeitraum(2026, 8).von.getTime());
  });
});

describe("letzterMonat", () => {
  it("gibt den Vormonat", () => {
    expect(letzterMonat(new Date("2026-08-03T09:00:00Z"))).toEqual({ jahr: 2026, monat: 7 });
  });

  it("geht im Januar ins Vorjahr", () => {
    expect(letzterMonat(new Date("2026-01-02T09:00:00Z"))).toEqual({ jahr: 2025, monat: 12 });
  });
});

describe("monatsname", () => {
  it("schreibt den Monat aus", () => {
    expect(monatsname(2026, 3)).toBe("März 2026");
    expect(monatsname(2026, 12)).toBe("Dezember 2026");
  });
});

describe("baueLose", () => {
  it("gibt jedem Konto genau ein Los, egal wie viele Bewertungen", () => {
    // Der Kern der Regel: zehn Bewertungen bringen keine zehnfache Chance,
    // sonst belohnte die Verlosung genau das, was die Betrugserkennung bekämpft.
    const lose = baueLose([
      teilnahme("k1", "b1"),
      teilnahme("k1", "b2"),
      teilnahme("k1", "b3"),
      teilnahme("k2", "b4"),
    ]);

    expect(lose).toHaveLength(2);
    expect(lose.find((l) => l.kontoId === "k1")?.bewertungIds).toEqual(["b1", "b2", "b3"]);
  });

  it("lässt Rollen außerhalb der Schülerschaft nicht mitspielen", () => {
    const lose = baueLose([
      teilnahme("k1", "b1", "eltern"),
      teilnahme("k2", "b2", "lehrkraft"),
      teilnahme("k3", "b3", "ehemalig"),
      teilnahme("k4", "b4", "schueler_unter_16"),
    ]);
    expect(lose.map((l) => l.kontoId)).toEqual(["k4"]);
  });

  it("sortiert die Lose immer gleich", () => {
    // Ohne feste Reihenfolge ließe sich die Ziehung nicht nachrechnen.
    const eingaben = [teilnahme("k3", "b3"), teilnahme("k1", "b1"), teilnahme("k2", "b2")];
    const einmal = baueLose(eingaben).map((l) => l.kontoId);
    const andersherum = baueLose([...eingaben].reverse()).map((l) => l.kontoId);
    expect(einmal).toEqual(["k1", "k2", "k3"]);
    expect(andersherum).toEqual(einmal);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(baueLose([])).toEqual([]);
  });
});

describe("ziehe", () => {
  const lose = baueLose(Array.from({ length: 50 }, (_, i) => teilnahme(`k${String(i).padStart(2, "0")}`, `b${i}`)));

  it("zieht niemanden aus einer leeren Liste", () => {
    expect(ziehe([], erzeugeZufallswert())).toBeNull();
  });

  it("zieht bei einem einzigen Los genau dieses", () => {
    const eins = baueLose([teilnahme("k1", "b1")]);
    expect(ziehe(eins, erzeugeZufallswert())?.gewinner.kontoId).toBe("k1");
  });

  it("liefert bei gleichem Zufallswert immer denselben Gewinner", () => {
    const wert = erzeugeZufallswert();
    expect(ziehe(lose, wert)).toEqual(ziehe(lose, wert));
  });

  it("liefert bei anderem Zufallswert in aller Regel einen anderen", () => {
    const gewinner = new Set(
      Array.from({ length: 30 }, () => ziehe(lose, erzeugeZufallswert())?.gewinner.kontoId),
    );
    expect(gewinner.size).toBeGreaterThan(10);
  });

  it("bleibt im gültigen Bereich", () => {
    for (let i = 0; i < 200; i++) {
      const e = ziehe(lose, erzeugeZufallswert())!;
      expect(e.index).toBeGreaterThanOrEqual(0);
      expect(e.index).toBeLessThan(lose.length);
      expect(e.gewinner).toBe(lose[e.index]);
    }
  });

  it("verteilt einigermaßen gleichmäßig", () => {
    // Kein Beweis, aber es fängt den Fehler ab, bei dem immer der erste oder
    // immer der letzte gewinnt.
    const zaehler = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const k = ziehe(lose, erzeugeZufallswert())!.gewinner.kontoId;
      zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
    }
    expect(zaehler.size).toBe(lose.length);
    const werte = [...zaehler.values()];
    // Erwartung je Los: 60. Selbst grob gestreut bleibt alles in diesem Rahmen.
    expect(Math.min(...werte)).toBeGreaterThan(20);
    expect(Math.max(...werte)).toBeLessThan(120);
  });
});

describe("pruefeZiehung", () => {
  const lose = baueLose(Array.from({ length: 20 }, (_, i) => teilnahme(`k${i}`, `b${i}`)));

  it("bestätigt eine echte Ziehung", () => {
    const wert = erzeugeZufallswert();
    const e = ziehe(lose, wert)!;
    expect(pruefeZiehung(lose, wert, e.gewinner.kontoId)).toBe(true);
  });

  it("erkennt einen ausgetauschten Gewinner", () => {
    const wert = erzeugeZufallswert();
    const e = ziehe(lose, wert)!;
    const anderer = lose.find((l) => l.kontoId !== e.gewinner.kontoId)!;
    expect(pruefeZiehung(lose, wert, anderer.kontoId)).toBe(false);
  });

  it("erkennt eine nachträglich veränderte Losliste", () => {
    const wert = erzeugeZufallswert();
    const e = ziehe(lose, wert)!;
    const gekuerzt = lose.slice(0, 10);
    // Bei geänderter Liste passt der Gewinner nur noch zufällig - und dann
    // sagt die Prüfung eben nichts aus. Hier passt er nicht.
    expect(pruefeZiehung(gekuerzt, wert, e.gewinner.kontoId)).toBe(
      ziehe(gekuerzt, wert)!.gewinner.kontoId === e.gewinner.kontoId,
    );
  });
});

describe("ziehungsmeldung", () => {
  it("nennt keine Angabe zur gewinnenden Person", () => {
    const text = ziehungsmeldung("August 2026", 1234, 50, 50);
    expect(text).toContain("1.234 Konten");
    expect(text).toContain("benachrichtigt");
    expect(text).not.toMatch(/\d{3,}\s*\*|@/); // keine verkürzte Nummer, keine Adresse
  });

  it("unterscheidet zwischen „wurden“ und „werden“ benachrichtigt", () => {
    // Für die wartende Person ist das der ganze Inhalt der Zeile.
    expect(ziehungsmeldung("August 2026", 5, 5, 5)).toContain("wurden benachrichtigt");
    expect(ziehungsmeldung("August 2026", 5, 5, 0)).toContain("werden benachrichtigt");
  });

  it("nennt den Zwischenstand bei vielen Gewinnen", () => {
    // Bei fünfzig Gutscheinen ist „teils benachrichtigt“ ein eigener Fall.
    expect(ziehungsmeldung("August 2026", 900, 50, 12)).toContain("12 von 50");
  });

  it("nennt die Zahl der Gewinne", () => {
    expect(ziehungsmeldung("August 2026", 900, 50, 0)).toContain("50 Gewinne wurden gezogen");
  });

  it("sagt es, wenn nicht gezogen wurde", () => {
    expect(ziehungsmeldung("August 2026", 0, 0, 0)).toMatch(/keine Teilnahmen/);
  });

  it("behauptet bei gelöschten Gewinnern nicht, es habe keine Teilnahmen gegeben", () => {
    // Zehn Menschen hatten teilgenommen; auf der Seite, die das belegen soll,
    // stand „lagen keine Teilnahmen vor".
    const text = ziehungsmeldung("Juli 2026", 10, 0, 0);
    expect(text).not.toMatch(/keine Teilnahmen/);
    expect(text).toContain("10 Losen");
  });

  it("beugt „1 Konten“ vor", () => {
    const text = ziehungsmeldung("August 2026", 1, 1, 0);
    expect(text).toContain("hat 1 Konto teilgenommen");
    expect(text).not.toContain("Konten");
  });
});

describe("Drei Ziehungen", () => {
  it("nennt die Gewinne, die auf den Seiten stehen", () => {
    expect(GEWINNE.normal).toEqual({ anzahl: 50, wertEuro: 50, mindestEmpfehlungen: 0 });
    expect(GEWINNE.super).toEqual({ anzahl: 25, wertEuro: 100, mindestEmpfehlungen: 1 });
    expect(GEWINNE.mega).toEqual({ anzahl: 1, wertEuro: 1000, mindestEmpfehlungen: 100 });
  });

  it("lässt ohne Empfehlung nur die normale Ziehung zu", () => {
    expect(teilnahmeAn(0, false)).toEqual(["normal"]);
  });

  it("nimmt ab einer geworbenen Person die Super-Verlosung dazu", () => {
    expect(teilnahmeAn(1, false)).toEqual(["normal", "super"]);
    expect(teilnahmeAn(99, false)).toEqual(["normal", "super"]);
  });

  it("nimmt ab hundert geworbenen Personen die Mega-Verlosung dazu", () => {
    expect(teilnahmeAn(100, false)).toEqual(["normal", "super", "mega"]);
  });

  it("nimmt frühere Gewinner aus der normalen Ziehung, nicht aus den anderen", () => {
    // Sonst gewinnt auf Dauer, wer am längsten dabei ist - und für alle
    // anderen wird die Chance kleiner statt größer.
    expect(teilnahmeAn(0, true)).toEqual([]);
    expect(teilnahmeAn(3, true)).toEqual(["super"]);
    expect(teilnahmeAn(150, true)).toEqual(["super", "mega"]);
  });
});

describe("zieheMehrere", () => {
  const lose = Array.from({ length: 200 }, (_, i) => ({
    kontoId: `konto-${String(i).padStart(3, "0")}`,
    bewertungIds: [`b-${i}`],
  }));
  const wert = "a".repeat(64);

  it("zieht so viele Gewinner wie gefordert, ohne Wiederholung", () => {
    const z = zieheMehrere(lose, wert, 50);
    expect(z.gewinner).toHaveLength(50);
    expect(new Set(z.gewinner.map((g) => g.los.kontoId)).size).toBe(50);
    expect(z.loseGesamt).toBe(200);
  });

  it("ist nachrechenbar", () => {
    const a = zieheMehrere(lose, wert, 25).gewinner.map((g) => g.los.kontoId);
    const b = zieheMehrere(lose, wert, 25).gewinner.map((g) => g.los.kontoId);
    expect(a).toEqual(b);
    expect(pruefeMehrfachziehung(lose, wert, 25, a)).toBe("stimmt");
    expect(pruefeMehrfachziehung(lose, wert, 25, [...a].reverse())).toBe("weicht_ab");
  });

  it("nennt eine Ziehung mit gelöschtem Gewinnerkonto unvollständig, nicht falsch", () => {
    // Seit Migration 0027 überlebt der Platz das Löschen des Kontos und die
    // Kennung wird geleert. „Rechnet sich nicht nach" wäre darauf die falsche
    // Antwort - genau diese Migration sagt die Nachrechenbarkeit zu.
    const lose = Array.from({ length: 40 }, (_, i) => ({ kontoId: `k${i}`, bewertungIds: [] }));
    const wert = "b".repeat(64);
    const erwartet = zieheMehrere(lose, wert, 25).gewinner.map((g) => g.los.kontoId);

    const mitLuecke = erwartet.map((id, i) => (i === 3 ? null : id));
    expect(pruefeMehrfachziehung(lose, wert, 25, mitLuecke)).toBe("unvollstaendig");

    // Eine Lücke entschuldigt keinen Widerspruch an anderer Stelle.
    const luekeUndFehler = mitLuecke.map((id, i) => (i === 5 ? "fremd" : id));
    expect(pruefeMehrfachziehung(lose, wert, 25, luekeUndFehler)).toBe("weicht_ab");
  });

  it("führt bei anderem Zufallswert zu anderen Gewinnern", () => {
    const a = zieheMehrere(lose, wert, 10).gewinner.map((g) => g.los.kontoId);
    const b = zieheMehrere(lose, "b".repeat(64), 10).gewinner.map((g) => g.los.kontoId);
    expect(a).not.toEqual(b);
  });

  it("gibt bei zu wenigen Losen alle aus und erfindet keine", () => {
    // 50 Gutscheine unter 12 Teilnehmenden bleiben 12 Gewinner.
    const zwoelf = lose.slice(0, 12);
    expect(zieheMehrere(zwoelf, wert, 50).gewinner).toHaveLength(12);
    expect(zieheMehrere([], wert, 50).gewinner).toHaveLength(0);
  });
});
