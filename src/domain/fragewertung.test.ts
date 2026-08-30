import { describe, expect, it } from "vitest";
import { FRAGEN } from "./fragebogen";
import {
  BLOCKGROESSE,
  MINDESTZAHL_FRAGE,
  fragenzahl,
  fragewertungen,
  gewertet,
  type Frageangabe,
} from "./fragewertung";

/** Alle Fragen einer Kategorie mit demselben Rohwert und genug Angaben. */
function alle(kategorie: string, mittel: number, anzahl = 20): Frageangabe[] {
  return FRAGEN.filter((f) => f.kategorie === kategorie).map((f) => ({
    frage: f.id,
    mittel,
    anzahl,
  }));
}

describe("Wertungsrichtung", () => {
  it("dreht invertierte Fragen um", () => {
    const mobbing = FRAGEN.find((f) => f.id === "A2")!;
    expect(mobbing.wertung).toBe("invertiert");
    // „Nie" (Rohwert 1) ist die beste Antwort und muss oben landen.
    expect(gewertet(mobbing, 1)).toBe(5);
    expect(gewertet(mobbing, 5)).toBe(1);
  });

  it("lässt direkte Fragen, wie sie sind", () => {
    const sicherheit = FRAGEN.find((f) => f.id === "A1")!;
    expect(gewertet(sicherheit, 5)).toBe(5);
  });

  it("zeigt an einer sicheren Schule den vollen Balken", () => {
    // Der Fehler, gegen den dieser Test steht: Ungedreht stünde die Schule mit
    // dem wenigsten Mobbing in der Aufschlüsselung bei 0,0.
    const [zeile] = fragewertungen("A", [{ frage: "A2", mittel: 1, anzahl: 20 }]);
    expect(zeile?.id).toBe("A2");
    expect(zeile?.anzeige).toBeCloseTo(10, 6);
  });
});

describe("Aufschlüsselung je Kategorie", () => {
  it("nimmt nur Fragen der eigenen Kategorie", () => {
    const gemischt = [...alle("A", 4), ...alle("B", 2)];
    const b = fragewertungen("B", gemischt);
    expect(b).toHaveLength(fragenzahl("B"));
    expect(b.every((z) => z.id.startsWith("B"))).toBe(true);
  });

  it("behält die Reihenfolge des Fragebogens bei", () => {
    const gedreht = [...alle("C", 3)].reverse();
    const ids = fragewertungen("C", gedreht).map((z) => z.id);
    expect(ids).toEqual(FRAGEN.filter((f) => f.kategorie === "C").map((f) => f.id));
  });

  it("lässt zu dünn besetzte Fragen weg", () => {
    // Die freiwilligen Bereiche beantwortet nur ein Teil - aus drei Kreuzen
    // einen Balken neben einem aus dreißig zu stellen, wäre eine Genauigkeit,
    // die es nicht gibt.
    const knapp = alle("D", 4, MINDESTZAHL_FRAGE - 1);
    expect(fragewertungen("D", knapp)).toEqual([]);
    expect(fragewertungen("D", alle("D", 4, MINDESTZAHL_FRAGE))).toHaveLength(fragenzahl("D"));
  });

  it("übergeht Fragen ohne jede Angabe", () => {
    expect(fragewertungen("E", [])).toEqual([]);
  });

  it("übergeht Kennungen, die es im Katalog nicht gibt", () => {
    // Alte Bewertungen können Fragen enthalten, die inzwischen aus dem
    // Fragebogen gefallen sind. Sie dürfen keine Zeile erzeugen.
    const zeilen = fragewertungen("A", [{ frage: "A99", mittel: 4, anzahl: 20 }]);
    expect(zeilen).toEqual([]);
  });

  it("rechnet auf die Zehnerskala um", () => {
    const [zeile] = fragewertungen("B", [{ frage: "B1", mittel: 3, anzahl: 12 }]);
    expect(zeile?.anzeige).toBeCloseTo(5, 6);
    expect(zeile?.anzahl).toBe(12);
    expect(zeile?.text).toBe(FRAGEN.find((f) => f.id === "B1")!.text);
  });
});

describe("Schutz vor der Differenz zweier Abrufe", () => {
  it("rückt in Blöcken weiter, die so gross sind wie die Untergrenze", () => {
    // Die Blockgrösse ist die eigentliche Absicherung: Eine Aufschlüsselung,
    // die sich bei jeder neuen Bewertung ändert, verrät die neue Bewertung.
    // Wer das Profil vorher und nachher abruft, rechnet aus Mittelwert mal
    // Anzahl die Antwort der dazwischen veröffentlichten Person zurück - je
    // Frage, exakt. Gemessen war das bei bis zu 24 vorhandenen Bewertungen in
    // 100 % der Fälle eindeutig. Die Umsetzung steht in `db/fragewerte.ts`;
    // hier steht die Zahl fest, damit sie nicht beiläufig kleiner wird.
    expect(BLOCKGROESSE).toBeGreaterThanOrEqual(MINDESTZAHL_FRAGE);
    expect(BLOCKGROESSE).toBeGreaterThan(1);
  });

  it("kennzeichnet umgekehrt gewertete Fragen", () => {
    const [mobbing] = fragewertungen("A", [{ frage: "A2", mittel: 1, anzahl: 20 }]);
    expect(mobbing?.invertiert).toBe(true);

    const [sicherheit] = fragewertungen("A", [{ frage: "A1", mittel: 5, anzahl: 20 }]);
    expect(sicherheit?.invertiert).toBe(false);
  });
});
