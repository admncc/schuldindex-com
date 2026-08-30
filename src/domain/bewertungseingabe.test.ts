import { describe, expect, it } from "vitest";
import { FRAGEN, KEINE_ANGABE, type Antwort } from "./fragebogen";
import {
  ROLLE_LABEL,
  ROLLEN,
  beantwortet,
  fortschritt,
  FREITEXT_HOECHSTLAENGE,
  istGueltig,
  pruefeEingabe,
  sieht_aus_wie_email,
  sieht_aus_wie_telefonnummer,
  type Bewertungseingabe,
} from "./bewertungseingabe";

const HEUTE = new Date("2026-08-26");

function alleAntworten(kategorien = ["A", "B", "C"]): Record<string, Antwort> {
  const a: Record<string, Antwort> = {};
  for (const f of FRAGEN) if (kategorien.includes(f.kategorie)) a[f.id] = 4;
  return a;
}

function eingabe(teil: Partial<Bewertungseingabe> = {}): Bewertungseingabe {
  return {
    schulSlug: "gymnasium-finkenwerder",
    rolle: "schueler_ab_16",
    klassenstufe: 11,
    abgangsjahr: null,
    antworten: alleAntworten(),
    freitexte: {},
    kontaktart: "whatsapp",
    kontakt: "+49 170 1234567",
    datenschutzEinwilligung: true,
    elternEinwilligung: false,
    verlosungTeilnahme: false,
    ...teil,
  };
}

const felder = (e: Bewertungseingabe) => pruefeEingabe(e, HEUTE).map((f) => f.feld);

describe("Vollständige Eingabe", () => {
  it("wird angenommen", () => {
    expect(pruefeEingabe(eingabe(), HEUTE)).toEqual([]);
    expect(istGueltig(eingabe(), HEUTE)).toBe(true);
  });

  it("kennt für jede Rolle eine Beschriftung", () => {
    for (const rolle of ROLLEN) expect(ROLLE_LABEL[rolle].length).toBeGreaterThan(5);
  });
});

describe("Rolle und Folgefelder", () => {
  it("verlangt zuerst die Rolle", () => {
    // Ohne sie lässt sich über die Folgefelder gar nichts sagen - die Prüfung
    // bricht deshalb ab, statt eine Fehlerwand zu erzeugen.
    const f = pruefeEingabe(eingabe({ rolle: null }), HEUTE);
    expect(f).toHaveLength(1);
    expect(f[0]!.feld).toBe("rolle");
  });

  it("verlangt eine Klassenstufe von Schülerinnen und Schülern", () => {
    expect(felder(eingabe({ klassenstufe: null }))).toContain("klassenstufe");
  });

  it("lässt keine Klassenstufe außerhalb von 1 bis 13 zu", () => {
    expect(felder(eingabe({ klassenstufe: 14 }))).toContain("klassenstufe");
    expect(felder(eingabe({ klassenstufe: 0 }))).toContain("klassenstufe");
    // Grundschule beginnt bei 1 - anders als bei schulen.de, das erst ab 5 fragt.
    expect(felder(eingabe({ klassenstufe: 1 }))).not.toContain("klassenstufe");
  });

  it("verweigert eine Klassenstufe bei Rollen, die keine haben", () => {
    expect(felder(eingabe({ rolle: "lehrkraft", klassenstufe: 9 }))).toContain("klassenstufe");
  });

  it("verlangt von Ehemaligen das Abgangsjahr", () => {
    const ehemalig = eingabe({ rolle: "ehemalig", klassenstufe: null, abgangsjahr: null });
    expect(felder(ehemalig)).toContain("abgangsjahr");
    expect(felder({ ...ehemalig, abgangsjahr: 2019 })).not.toContain("abgangsjahr");
  });

  it("lässt kein Abgangsjahr in der Zukunft zu", () => {
    const ehemalig = eingabe({ rolle: "ehemalig", klassenstufe: null, abgangsjahr: 2030 });
    expect(felder(ehemalig)).toContain("abgangsjahr");
  });
});

describe("Elterneinwilligung", () => {
  it("ist bei unter 16-Jährigen Pflicht", () => {
    const jung = eingabe({ rolle: "schueler_unter_16", klassenstufe: 8, elternEinwilligung: false });
    expect(felder(jung)).toContain("elternEinwilligung");
    expect(felder({ ...jung, elternEinwilligung: true })).not.toContain("elternEinwilligung");
  });

  it("wird bei allen anderen Rollen nicht verlangt", () => {
    for (const rolle of ["schueler_ab_16", "eltern", "lehrkraft"] as const) {
      const e = eingabe({ rolle, klassenstufe: rolle === "schueler_ab_16" ? 11 : null });
      expect(felder(e), rolle).not.toContain("elternEinwilligung");
    }
  });
});

describe("Pflichtkategorien", () => {
  it("verlangt A, B und C vollständig", () => {
    const f = felder(eingabe({ antworten: alleAntworten(["A"]) }));
    expect(f).toContain("kategorie.B");
    expect(f).toContain("kategorie.C");
    expect(f).not.toContain("kategorie.A");
  });

  it("verlangt D, E und F nicht", () => {
    const f = felder(eingabe());
    expect(f.some((x) => x.startsWith("kategorie.D") || x.startsWith("kategorie.E") || x.startsWith("kategorie.F"))).toBe(false);
  });

  it("nennt, wie viele Fragen noch fehlen", () => {
    const teilweise = { ...alleAntworten(["A", "B", "C"]) };
    delete teilweise["B3"];
    delete teilweise["B7"];
    const meldung = pruefeEingabe(eingabe({ antworten: teilweise }), HEUTE).find((f) => f.feld === "kategorie.B");
    expect(meldung?.meldung).toContain("2 von 10");
  });

  it("wertet „Kann ich nicht beurteilen“ nicht als Antwort", () => {
    // Sonst ließe sich der Fragebogen durchklicken, ohne etwas zu sagen.
    const uebersprungen = { ...alleAntworten(["A", "B", "C"]), B1: KEINE_ANGABE };
    expect(felder(eingabe({ antworten: uebersprungen }))).toContain("kategorie.B");
    expect(beantwortet("B", uebersprungen)).toBe(9);
  });
});

describe("Kontakt", () => {
  it("erkennt brauchbare Mobilnummern in gängigen Schreibweisen", () => {
    for (const nummer of ["+49 170 1234567", "0170/1234567", "0170 123 45 67", "(0170) 1234567"]) {
      expect(sieht_aus_wie_telefonnummer(nummer), nummer).toBe(true);
    }
  });

  it("weist zu kurze Eingaben ab", () => {
    expect(sieht_aus_wie_telefonnummer("12345")).toBe(false);
    expect(sieht_aus_wie_telefonnummer("keine Nummer")).toBe(false);
  });

  it("prüft E-Mail-Adressen auf Form", () => {
    expect(sieht_aus_wie_email("anna@beispiel.de")).toBe(true);
    expect(sieht_aus_wie_email("anna@beispiel")).toBe(false);
    expect(sieht_aus_wie_email("anna.beispiel.de")).toBe(false);
  });

  it("verlangt einen Kontaktweg und eine passende Eingabe", () => {
    expect(felder(eingabe({ kontaktart: null }))).toContain("kontaktart");
    expect(felder(eingabe({ kontakt: "" }))).toContain("kontakt");
    expect(felder(eingabe({ kontaktart: "email", kontakt: "0170 1234567" }))).toContain("kontakt");
  });
});

describe("Einwilligungen und Verlosung", () => {
  it("verlangt die Datenschutzeinwilligung", () => {
    expect(felder(eingabe({ datenschutzEinwilligung: false }))).toContain("datenschutzEinwilligung");
  });

  it("lässt an der Verlosung nur Schülerinnen und Schüler teilnehmen", () => {
    expect(felder(eingabe({ verlosungTeilnahme: true }))).not.toContain("verlosungTeilnahme");
    const lehrkraft = eingabe({ rolle: "lehrkraft", klassenstufe: null, verlosungTeilnahme: true });
    expect(felder(lehrkraft)).toContain("verlosungTeilnahme");
  });
});

describe("Fortschritt", () => {
  it("misst nur die Pflichtkategorien", () => {
    expect(fortschritt({})).toBe(0);
    expect(fortschritt(alleAntworten(["A", "B", "C"]))).toBe(1);
    // Optionale Kategorien treiben den Fortschritt nicht über 100 Prozent.
    expect(fortschritt(alleAntworten(["A", "B", "C", "D", "E", "F"]))).toBe(1);
  });

  it("wächst mit jeder Antwort", () => {
    const halb = alleAntworten(["A"]);
    expect(fortschritt(halb)).toBeGreaterThan(0);
    expect(fortschritt(halb)).toBeLessThan(1);
  });
});


describe("Prüfung der Rohwerte", () => {
  // Diese Prüfungen fehlten, und die Lücke war die schwerste des Projekts: Die
  // Antworten kommen als JSON aus dem Browser, und jeder Wert außer „kann ich
  // nicht beurteilen“ zählte als beantwortet.
  it("weist Antworten außerhalb der Skala zurück", () => {
    const alle = alleAntworten();
    const erste = Object.keys(alle)[0]!;
    for (const wert of [0, 6, 7, 99, -1, 1.5]) {
      const felder = pruefeEingabe(eingabe({ antworten: { ...alle, [erste]: wert as never } })).map(
        (f) => f.feld,
      );
      expect(felder, `Wert ${wert} kam durch`).toContain("antworten");
    }
  });

  it("weist Fragen zurück, die es nicht gibt", () => {
    const felder = pruefeEingabe(
      eingabe({ antworten: { ...alleAntworten(), erfunden: 5 as never } }),
    ).map((f) => f.feld);
    expect(felder).toContain("antworten");
  });

  it("weist alles zurück, was gar kein Objekt ist", () => {
    for (const unsinn of [null, "text", 42, []]) {
      const felder = pruefeEingabe(eingabe({ antworten: unsinn as never })).map((f) => f.feld);
      expect(felder).toContain("antworten");
    }
  });

  it("begrenzt die Länge der Freitexte", () => {
    const zuLang = "a".repeat(FREITEXT_HOECHSTLAENGE + 1);
    const felder = pruefeEingabe(
      eingabe({ antworten: alleAntworten(), freitexte: { A: zuLang } }),
    ).map((f) => f.feld);
    expect(felder).toContain("kategorie.A");
  });

  it("begrenzt die Länge des Kontakts", () => {
    const felder = pruefeEingabe(
      eingabe({ antworten: alleAntworten(), kontakt: "a".repeat(300) + "@example.org" }),
    ).map((f) => f.feld);
    expect(felder).toContain("kontakt");
  });

  it("lässt „sieben“ nicht als Klassenstufe durch", () => {
    // `"sieben" < 1` und `"sieben" > 13` sind beide falsch - der Wert lief bis
    // in die Datenbank.
    const felder = pruefeEingabe(
      eingabe({ antworten: alleAntworten(), klassenstufe: "sieben" as never }),
    ).map((f) => f.feld);
    expect(felder).toContain("klassenstufe");
  });
});
