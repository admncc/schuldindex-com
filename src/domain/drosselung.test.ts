import { beforeEach, describe, expect, it } from "vitest";
import { vergissAlles, zaehle } from "./drosselung";

describe("Drosselung", () => {
  beforeEach(() => vergissAlles());

  it("lässt bis zur Grenze durch und dann nicht mehr", () => {
    for (let i = 0; i < 3; i++) {
      expect(zaehle("test", "1.2.3.4", 3, 60_000, 1000).erlaubt, `Anfrage ${i + 1}`).toBe(true);
    }
    expect(zaehle("test", "1.2.3.4", 3, 60_000, 1000).erlaubt).toBe(false);
  });

  it("zählt je Absender getrennt", () => {
    zaehle("test", "1.2.3.4", 1, 60_000, 1000);
    expect(zaehle("test", "1.2.3.4", 1, 60_000, 1000).erlaubt).toBe(false);
    expect(zaehle("test", "5.6.7.8", 1, 60_000, 1000).erlaubt).toBe(true);
  });

  it("zählt je Bereich getrennt", () => {
    zaehle("a", "1.2.3.4", 1, 60_000, 1000);
    expect(zaehle("b", "1.2.3.4", 1, 60_000, 1000).erlaubt).toBe(true);
  });

  it("beginnt nach dem Fenster von vorn", () => {
    zaehle("test", "1.2.3.4", 1, 60_000, 1000);
    expect(zaehle("test", "1.2.3.4", 1, 60_000, 1000).erlaubt).toBe(false);
    expect(zaehle("test", "1.2.3.4", 1, 60_000, 61_001).erlaubt).toBe(true);
  });

  it("drosselt gar nicht, wenn es keine Adresse gibt", () => {
    // Der teuer erkaufte Fehler: Zuerst teilten sich alle Anfragen ohne
    // Adresse einen Zähler. Ohne gesetztes VERTRAUTE_PROXYS gibt es nie eine -
    // nach zwanzig Abgaben in der Stunde hätte das Portal von niemandem mehr
    // eine Bewertung angenommen.
    for (let i = 0; i < 100; i++) {
      expect(zaehle("test", null, 1, 60_000, 1000).erlaubt, `Anfrage ${i + 1}`).toBe(true);
    }
    expect(zaehle("test", "", 1, 60_000, 1000).erlaubt).toBe(true);
  });

  it("meldet, wie viel noch offen ist", () => {
    expect(zaehle("test", "1.2.3.4", 3, 60_000, 1000).verbleibend).toBe(2);
    expect(zaehle("test", "1.2.3.4", 3, 60_000, 1000).verbleibend).toBe(1);
  });
});
