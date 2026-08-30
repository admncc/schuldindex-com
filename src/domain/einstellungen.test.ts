import { describe, expect, it } from "vitest";
import {
  abweichungen,
  erlaubteKontaktarten,
  beschreibung,
  GRUPPEN_HILFE,
  GRUPPEN_LABEL,
  KATALOG,
  mitVorgaben,
  pruefeWert,
  VORGABEN,
  zahl,
} from "./einstellungen";
import { zweiterFaktorPflicht } from "./zweiterfaktor";

describe("Schalter", () => {
  it("kennt nur 0 und 1", () => {
    expect(pruefeWert("zweiter_faktor", 1)).toEqual({ ok: true, wert: 1 });
    expect(pruefeWert("zweiter_faktor", 0)).toEqual({ ok: true, wert: 0 });
    expect(pruefeWert("zweiter_faktor", 2).ok).toBe(false);
    expect(pruefeWert("zweiter_faktor", 0.5).ok).toBe(false);
  });

  it("steht zurzeit auf aus - und das ist eine Entscheidung, keine Vorgabe von Haus aus", () => {
    // Festgehalten, damit ein Wiedereinschalten eine bewusste Änderung ist und
    // niemand den Zustand für einen Zufall hält.
    expect(zahl(VORGABEN, "zweiter_faktor")).toBe(0);
  });

  it("wird als abgeschaltet erkannt, wenn nichts gespeichert ist", () => {
    expect(zweiterFaktorPflicht(VORGABEN)).toBe(false);
    expect(zweiterFaktorPflicht(mitVorgaben({ zweiter_faktor: 1 }))).toBe(true);
  });
});

describe("KATALOG", () => {
  it("hat eindeutige Schlüssel", () => {
    const s = KATALOG.map((e) => e.schluessel);
    expect(new Set(s).size).toBe(s.length);
  });

  it("beschreibt jede Einstellung für Menschen", () => {
    for (const e of KATALOG) {
      expect(e.label.length, e.schluessel).toBeGreaterThan(5);
      expect(e.hilfe.length, e.schluessel).toBeGreaterThan(40);
    }
  });

  it("gibt jeder Einstellung Grenzen, in denen die Vorgabe liegt", () => {
    // Eine Halteschwelle von 0 hielte jede Bewertung an, eine von 99 keine -
    // beides darf kein Tippfehler auslösen können.
    for (const e of KATALOG) {
      expect(e.min, e.schluessel).toBeLessThan(e.max);
      expect(e.vorgabe, e.schluessel).toBeGreaterThanOrEqual(e.min);
      expect(e.vorgabe, e.schluessel).toBeLessThanOrEqual(e.max);
    }
  });

  it("erklärt jede Gruppe", () => {
    for (const e of KATALOG) {
      expect(GRUPPEN_LABEL[e.gruppe]).toBeDefined();
      expect(GRUPPEN_HILFE[e.gruppe].length).toBeGreaterThan(40);
    }
  });

  it("kennt keine erfundene Einstellung", () => {
    expect(beschreibung("gibtsnicht")).toBeNull();
  });
});

describe("pruefeWert", () => {
  it("nimmt einen gültigen Wert an", () => {
    expect(pruefeWert("halteschwelle", 5)).toEqual({ ok: true, wert: 5 });
  });

  it("versteht das deutsche Komma", () => {
    // Wer eine Zahl mit Komma abweist, hat die Oberfläche nicht für Menschen gebaut.
    expect(pruefeWert("tempo_sekunden_je_frage", "2,5")).toEqual({ ok: true, wert: 2.5 });
  });

  it("rundet Kommazahlen auf eine Stelle", () => {
    expect(pruefeWert("tempo_sekunden_je_frage", 1.4444)).toEqual({ ok: true, wert: 1.4 });
  });

  it("weist Werte außerhalb der Grenzen ab", () => {
    expect(pruefeWert("halteschwelle", 0).ok).toBe(false);
    expect(pruefeWert("halteschwelle", 99).ok).toBe(false);
    expect(pruefeWert("entfernung_km", 5).ok).toBe(false);
  });

  it("weist Kommazahlen ab, wo nur ganze Zahlen gelten", () => {
    const e = pruefeWert("halteschwelle", 2.5);
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.meldung).toContain("ganze Zahl");
  });

  it("weist Unfug ab", () => {
    for (const müll of ["", "viel", "NaN", "1e999"]) {
      expect(pruefeWert("halteschwelle", müll).ok, müll).toBe(false);
    }
  });

  it("kennt keine erfundene Einstellung", () => {
    expect(pruefeWert("gibtsnicht", 1).ok).toBe(false);
  });
});

describe("mitVorgaben", () => {
  it("füllt fehlende Werte aus den Vorgaben", () => {
    const e = mitVorgaben({ halteschwelle: 5 });
    expect(e["halteschwelle"]).toBe(5);
    expect(e["entfernung_km"]).toBe(VORGABEN["entfernung_km"]);
  });

  it("übergeht unbrauchbare gespeicherte Werte", () => {
    // Ein Wert außerhalb der Grenzen kann nur aus einer früheren Fassung oder
    // von Hand stammen - er darf die Prüfung nicht lahmlegen.
    const e = mitVorgaben({ halteschwelle: 999, entfernung_km: -1 });
    expect(e["halteschwelle"]).toBe(VORGABEN["halteschwelle"]);
    expect(e["entfernung_km"]).toBe(VORGABEN["entfernung_km"]);
  });

  it("übergeht Schlüssel, die es nicht mehr gibt", () => {
    const e = mitVorgaben({ alteEinstellung: 7 });
    expect(e["alteEinstellung"]).toBeUndefined();
  });
});

describe("abweichungen", () => {
  it("nennt nur, was von der Vorgabe abweicht", () => {
    expect(abweichungen(VORGABEN)).toEqual([]);
    expect(abweichungen(mitVorgaben({ halteschwelle: 5 }))).toEqual(["halteschwelle"]);
  });
});

describe("zahl", () => {
  it("fällt auf die Vorgabe zurück", () => {
    expect(zahl({}, "halteschwelle")).toBe(VORGABEN["halteschwelle"]);
    expect(zahl({ halteschwelle: 7 }, "halteschwelle")).toBe(7);
  });
});

describe("erlaubteKontaktarten", () => {
  it("bietet nach Vorgabe alle drei Wege an", () => {
    expect(erlaubteKontaktarten(VORGABEN)).toEqual(["whatsapp", "sms", "email"]);
  });

  it("lässt einen abgeschalteten Weg weg", () => {
    const ohneSms = mitVorgaben({ kontakt_sms: 0 });
    expect(erlaubteKontaktarten(ohneSms)).toEqual(["whatsapp", "email"]);
  });

  it("fällt auf alle zurück, wenn jemand alle abschaltet", () => {
    // Ohne Bestätigung nimmt das Portal gar nichts an - eine leere Auswahl
    // wäre keine Einstellung, sondern ein stillgelegtes Formular.
    const keiner = mitVorgaben({ kontakt_whatsapp: 0, kontakt_sms: 0, kontakt_email: 0 });
    expect(erlaubteKontaktarten(keiner)).toEqual(["whatsapp", "sms", "email"]);
  });
});
