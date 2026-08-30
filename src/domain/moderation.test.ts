import { describe, expect, it } from "vitest";
import {
  ABLEHNUNGSGRUENDE,
  ALARM_ALTER_STUNDEN,
  ALARM_LAENGE,
  ablehnungsgrund,
  dringlichkeit,
  MAX_SAMMELAKTION,
  pruefeEntscheidung,
  pruefeSammelaktion,
  warteschlangenalarm,
  ZIEL_REAKTION_STUNDEN,
} from "./moderation";
import { ZUSTAENDE } from "./bewertungsstatus";

describe("Ablehnungsgründe", () => {
  it("haben eindeutige Kennungen", () => {
    const ids = ABLEHNUNGSGRUENDE.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sind in der Du-Form und ganze Sätze - sie gehen so an die Person hinaus", () => {
    for (const g of ABLEHNUNGSGRUENDE) {
      expect(g.text.length).toBeGreaterThan(30);
      expect(g.text).toMatch(/[.!?]$/);
    }
  });

  it("kennt unbekannte Kennungen nicht", () => {
    expect(ablehnungsgrund("gibtsnicht")).toBeNull();
  });
});

describe("pruefeEntscheidung - Freigabe", () => {
  it("gibt eine geprüfte Bewertung frei", () => {
    const e = pruefeEntscheidung("in_pruefung_geo", { aktion: "freigeben" });
    expect(e.ok).toBe(true);
    expect(e.ok && e.entscheidung.nach).toBe("freigegeben");
  });

  it("gibt eine abgelehnte Bewertung nicht wieder frei", () => {
    const e = pruefeEntscheidung("abgelehnt", { aktion: "freigeben" });
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.fehler[0]?.feld).toBe("aktion");
  });

  it("gibt eine noch unbestätigte Bewertung nicht frei", () => {
    // Sonst ließe sich die Kontobestätigung durch einen Klick in der Moderation
    // überspringen - und mit ihr die ganze Verifizierung.
    expect(pruefeEntscheidung("wartet_auf_verifizierung", { aktion: "freigeben" }).ok).toBe(false);
  });
});

describe("pruefeEntscheidung - Ablehnung", () => {
  it("verlangt einen Grund", () => {
    const e = pruefeEntscheidung("in_pruefung_betrug", { aktion: "ablehnen" });
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.fehler.map((f) => f.feld)).toEqual(["grundId"]);
  });

  it("weist einen erfundenen Grund ab", () => {
    expect(pruefeEntscheidung("in_pruefung_betrug", { aktion: "ablehnen", grundId: "xyz" }).ok).toBe(false);
  });

  it("übernimmt den Vorlagentext als Begründung", () => {
    const e = pruefeEntscheidung("in_pruefung_betrug", { aktion: "ablehnen", grundId: "beleidigung" });
    expect(e.ok && e.entscheidung.begruendung).toBe(ablehnungsgrund("beleidigung")!.text);
    expect(e.ok && e.entscheidung.nach).toBe("abgelehnt");
  });

  it("hängt einen eigenen Zusatz an die Vorlage an, statt sie zu ersetzen", () => {
    const e = pruefeEntscheidung("in_pruefung_geo", {
      aktion: "ablehnen",
      grundId: "kein_bezug",
      zusatz: "Der Text beschreibt eine Grundschule, bewertet wurde ein Gymnasium.",
    });
    expect(e.ok && e.entscheidung.begruendung).toBe(
      `${ablehnungsgrund("kein_bezug")!.text}\n\nDer Text beschreibt eine Grundschule, bewertet wurde ein Gymnasium.`,
    );
  });

  it("nimmt bei „Als Spam ablehnen“ den Grund selbst", () => {
    const e = pruefeEntscheidung("in_pruefung_betrug", { aktion: "spam" });
    expect(e.ok).toBe(true);
    expect(e.ok && e.entscheidung.begruendung).toBe(ablehnungsgrund("spam")!.text);
    expect(e.ok && e.entscheidung.nach).toBe("abgelehnt");
  });

  it("nimmt eine veröffentlichte Bewertung wieder herunter", () => {
    // Der Weg für nachträgliche Meldungen nach DSA Art. 16.
    const e = pruefeEntscheidung("freigegeben", { aktion: "ablehnen", grundId: "person" });
    expect(e.ok && e.entscheidung.nach).toBe("abgelehnt");
  });

  it("meldet fehlenden Grund und unmöglichen Übergang zusammen, nicht nacheinander", () => {
    const e = pruefeEntscheidung("abgelehnt", { aktion: "ablehnen" });
    expect(e.ok === false && e.fehler.map((f) => f.feld).sort()).toEqual(["aktion", "grundId"]);
  });
});

describe("pruefeEntscheidung - Rückfrage", () => {
  it("lässt den Zustand stehen", () => {
    const e = pruefeEntscheidung("in_pruefung_geo", {
      aktion: "rueckfrage",
      zusatz: "Bist du in diesem Schuljahr an der Schule oder warst du es früher?",
    });
    expect(e.ok).toBe(true);
    expect(e.ok && e.entscheidung.nach).toBeNull();
    expect(e.ok && e.entscheidung.ausloeser).toBeNull();
  });

  it("verlangt einen ausgeschriebenen Text", () => {
    const e = pruefeEntscheidung("in_pruefung_geo", { aktion: "rueckfrage", zusatz: "warum?" });
    expect(e.ok === false && e.fehler.map((f) => f.feld)).toEqual(["zusatz"]);
  });

  it("geht nur zu Bewertungen in Prüfung", () => {
    for (const zustand of ZUSTAENDE.filter((z) => !z.startsWith("in_pruefung"))) {
      const e = pruefeEntscheidung(zustand, {
        aktion: "rueckfrage",
        zusatz: "Kannst du deine Angabe zur Klassenstufe bestätigen?",
      });
      expect(e.ok, zustand).toBe(false);
    }
  });
});

describe("dringlichkeit", () => {
  const JETZT = new Date("2026-08-26T12:00:00Z");
  const vorStunden = (h: number) => new Date(JETZT.getTime() - h * 3600_000);

  it("stuft nach den Grenzen aus Abschnitt 8", () => {
    expect(dringlichkeit(vorStunden(1), JETZT)).toBe("neu");
    expect(dringlichkeit(vorStunden(ZIEL_REAKTION_STUNDEN - 0.1), JETZT)).toBe("neu");
    expect(dringlichkeit(vorStunden(ZIEL_REAKTION_STUNDEN), JETZT)).toBe("faellig");
    expect(dringlichkeit(vorStunden(ALARM_ALTER_STUNDEN), JETZT)).toBe("ueberfaellig");
  });
});

describe("warteschlangenalarm", () => {
  const JETZT = new Date("2026-08-26T12:00:00Z");

  it("schweigt bei kurzer, frischer Warteschlange", () => {
    expect(warteschlangenalarm({ laenge: 12, aeltesterEintragAm: new Date(JETZT.getTime() - 3600_000) }, JETZT))
      .toEqual([]);
  });

  it("schlägt bei zu vielen Einträgen an", () => {
    const alarme = warteschlangenalarm({ laenge: ALARM_LAENGE + 1, aeltesterEintragAm: null }, JETZT);
    expect(alarme).toHaveLength(1);
    expect(alarme[0]).toMatch(/101 Einträge/);
  });

  it("schlägt bei einem alten Eintrag an, auch wenn die Schlange kurz ist", () => {
    // Der Fall, den eine reine Längenmessung übersieht: niemand moderiert.
    const alt = new Date(JETZT.getTime() - 80 * 3600_000);
    const alarme = warteschlangenalarm({ laenge: 3, aeltesterEintragAm: alt }, JETZT);
    expect(alarme).toEqual(["Der älteste Eintrag wartet seit 80 Stunden (Grenze 72)."]);
  });

  it("schweigt bei leerer Warteschlange", () => {
    expect(warteschlangenalarm({ laenge: 0, aeltesterEintragAm: null }, JETZT)).toEqual([]);
  });
});

describe("pruefeSammelaktion", () => {
  /** Kennungen im echten Format - die Prüfung schaut seit Kurzem darauf. */
  const kennung = (n: number): string =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ids = [kennung(1), kennung(2), kennung(3)];

  it("nimmt eine Auswahl mit Grund an", () => {
    const e = pruefeSammelaktion({ ids, grundId: "spam" });
    expect(e.ok).toBe(true);
    expect(e.ok && e.ids).toEqual(ids);
    expect(e.ok && e.begruendung).toBe(ablehnungsgrund("spam")!.text);
  });

  it("weist eine leere Auswahl ab", () => {
    expect(pruefeSammelaktion({ ids: [], grundId: "spam" }).ok).toBe(false);
    expect(pruefeSammelaktion({ ids: ["", ""], grundId: "spam" }).ok).toBe(false);
  });

  it("wirft Kennungen weg, die keine sind", () => {
    // Eine abgeschnittene Kennung aus einem Formularfeld warf in Postgres
    // 22P02 - mitten in einer Server Action und ohne Meldung.
    const e = pruefeSammelaktion({ ids: [kennung(1), "abc", "'; drop"], grundId: "spam" });
    expect(e.ok && e.ids).toEqual([kennung(1)]);
  });

  it("entfernt Doppelte", () => {
    const e = pruefeSammelaktion({ ids: [kennung(1), kennung(1), kennung(2)], grundId: "spam" });
    expect(e.ok && e.ids).toEqual([kennung(1), kennung(2)]);
  });

  it("verlangt einen Grund", () => {
    expect(pruefeSammelaktion({ ids, grundId: "" }).ok).toBe(false);
    expect(pruefeSammelaktion({ ids, grundId: "erfunden" }).ok).toBe(false);
  });

  it("begrenzt die Zahl", () => {
    // Die einzige Stelle im Portal, an der ein Klick hunderte Menschen trifft.
    const viele = Array.from({ length: MAX_SAMMELAKTION + 1 }, (_, i) => kennung(i));
    const e = pruefeSammelaktion({ ids: viele, grundId: "spam" });
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.meldung).toContain(String(MAX_SAMMELAKTION));
  });

  it("lässt genau die Höchstzahl zu", () => {
    const genau = Array.from({ length: MAX_SAMMELAKTION }, (_, i) => kennung(i));
    expect(pruefeSammelaktion({ ids: genau, grundId: "spam" }).ok).toBe(true);
  });

  it("hängt einen Zusatz an die Vorlage an", () => {
    const e = pruefeSammelaktion({ ids, grundId: "spam", zusatz: "Welle vom 27.08., gleiche Muster." });
    expect(e.ok && e.begruendung).toBe(
      `${ablehnungsgrund("spam")!.text}\n\nWelle vom 27.08., gleiche Muster.`,
    );
  });
});
