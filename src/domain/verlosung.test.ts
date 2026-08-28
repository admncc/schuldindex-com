import { describe, expect, it } from "vitest";
import {
  baueLose,
  erzeugeZufallswert,
  letzterMonat,
  monatsname,
  monatszeitraum,
  pruefeZiehung,
  ziehe,
  ziehungsmeldung,
  type Teilnahme,
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
    const text = ziehungsmeldung("August 2026", 1234, true, true);
    expect(text).toContain("1.234 Konten");
    expect(text).toContain("benachrichtigt");
    expect(text).not.toMatch(/\d{3,}\s*\*|@/); // keine verkürzte Nummer, keine Adresse
  });

  it("unterscheidet zwischen „wurde“ und „wird“ benachrichtigt", () => {
    // Für die wartende Person ist das der ganze Inhalt der Zeile.
    expect(ziehungsmeldung("August 2026", 5, true, true)).toContain("wurde benachrichtigt");
    expect(ziehungsmeldung("August 2026", 5, true, false)).toContain("wird benachrichtigt");
  });

  it("sagt es, wenn nicht gezogen wurde", () => {
    expect(ziehungsmeldung("August 2026", 0, false)).toMatch(/keine Teilnahmen/);
  });

  it("beugt „1 Konten“ vor", () => {
    const text = ziehungsmeldung("August 2026", 1, true);
    expect(text).toContain("hat 1 Konto teilgenommen");
    expect(text).not.toContain("Konten");
  });
});
