import { describe, expect, it } from "vitest";
import {
  WARTESCHLANGE,
  ZUSTAENDE,
  ZUSTAND_HINWEIS,
  istErlaubt,
  istOeffentlich,
  wechsle,
  type Ausloeser,
  type Zustand,
} from "./bewertungsstatus";

const ALLE_AUSLOESER: Ausloeser[] = [
  "verifiziert",
  "pruefung_bestanden",
  "pruefung_geo",
  "pruefung_betrug",
  "moderation_freigeben",
  "moderation_ablehnen",
  "bearbeitet",
];

describe("Der übliche Weg", () => {
  it("führt von der Bestätigung über die Prüfung zur Veröffentlichung", () => {
    const nachPruefung = wechsle("wartet_auf_verifizierung", "pruefung_bestanden");
    expect(nachPruefung).toEqual({ ok: true, nach: "freigegeben" });
  });

  it("führt bei zu großer Entfernung in die Moderation", () => {
    const gehalten = wechsle("wartet_auf_verifizierung", "pruefung_geo");
    expect(gehalten).toEqual({ ok: true, nach: "in_pruefung_geo" });
    expect(wechsle("in_pruefung_geo", "moderation_freigeben")).toEqual({
      ok: true,
      nach: "freigegeben",
    });
  });
});

describe("Was nicht passieren darf", () => {
  it("lässt aus „abgelehnt“ keinen Weg zurück", () => {
    // Der wichtigste Test dieser Datei. Ein Fehlgriff in der Oberfläche dürfte
    // eine bewusst gestoppte Bewertung nie wieder online bringen.
    for (const ausloeser of ALLE_AUSLOESER) {
      const ergebnis = wechsle("abgelehnt", ausloeser);
      expect(ergebnis.ok, `abgelehnt + ${ausloeser}`).toBe(false);
    }
  });

  it("erklärt die Sackgasse verständlich", () => {
    const ergebnis = wechsle("abgelehnt", "moderation_freigeben");
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fehler.grund).toContain("bleibt abgelehnt");
  });

  it("bringt eine bearbeitete Bewertung zurück in die Prüfung, nicht direkt online", () => {
    // Sonst ließe sich eine harmlose Bewertung freigeben und danach beliebig
    // umschreiben.
    expect(wechsle("freigegeben", "bearbeitet")).toEqual({ ok: true, nach: "in_pruefung_betrug" });
  });

  it("erlaubt der Moderation nicht, die Verifizierung zu überspringen", () => {
    expect(istErlaubt("wartet_auf_verifizierung", "moderation_freigeben")).toBe(false);
  });

  it("lässt eine gehaltene Bewertung nicht ohne Moderation durch", () => {
    // Aus dem Geo-Halt führt nur eine menschliche Entscheidung heraus.
    expect(istErlaubt("in_pruefung_geo", "pruefung_bestanden")).toBe(false);
  });
});

describe("Vollständigkeit", () => {
  it("kennt für jeden Zustand einen Hinweis an die bewertende Person", () => {
    for (const zustand of ZUSTAENDE) {
      expect(ZUSTAND_HINWEIS[zustand].length, zustand).toBeGreaterThan(10);
    }
  });

  it("verrät nach außen nicht, welche Prüfung angeschlagen hat", () => {
    // „Wegen auffälliger Muster gehalten“ wäre eine Anleitung für den nächsten
    // Versuch. Beide Prüfzustände tragen deshalb denselben Text.
    expect(ZUSTAND_HINWEIS.in_pruefung_geo).toBe(ZUSTAND_HINWEIS.in_pruefung_betrug);
  });

  it("führt beide Prüfzustände in der Warteschlange", () => {
    expect(WARTESCHLANGE).toEqual(["in_pruefung_geo", "in_pruefung_betrug"]);
  });

  it("veröffentlicht ausschließlich freigegebene Bewertungen", () => {
    for (const zustand of ZUSTAENDE) {
      expect(istOeffentlich(zustand), zustand).toBe(zustand === "freigegeben");
    }
  });

  it("führt aus jedem Zustand außer „abgelehnt“ mindestens ein Weg heraus", () => {
    for (const zustand of ZUSTAENDE) {
      const wege = ALLE_AUSLOESER.filter((a) => istErlaubt(zustand as Zustand, a));
      if (zustand === "abgelehnt") expect(wege).toEqual([]);
      else expect(wege.length, zustand).toBeGreaterThan(0);
    }
  });
});
