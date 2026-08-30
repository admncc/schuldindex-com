import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { FRAGEN, type Antwort } from "../domain/fragebogen";
import type { Bewertungseingabe } from "../domain/bewertungseingabe";
import { VORGABEN } from "../domain/einstellungen";
import { bewertungAbgeben, freitexteAlsObjekt, type Umgebung } from "./bewertungAbgeben";

beforeAll(() => {
  process.env["KONTAKT_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
  process.env["KONTAKT_CHIFFRE_SCHLUESSEL"] = randomBytes(32).toString("base64");
  process.env["TOKEN_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

const HAMBURG = { lat: 53.5503, lon: 9.992 };
const MUENCHEN = { lat: 48.1374, lon: 11.5755 };

function antworten(): Record<string, Antwort> {
  const a: Record<string, Antwort> = {};
  for (const f of FRAGEN) if (["A", "B", "C"].includes(f.kategorie)) a[f.id] = 4;
  return a;
}

function eingabe(teil: Partial<Bewertungseingabe> = {}): Bewertungseingabe {
  return {
    schulSlug: "gymnasium-finkenwerder",
    rolle: "schueler_ab_16",
    klassenstufe: 11,
    abgangsjahr: null,
    antworten: antworten(),
    freitexte: {},
    kontaktart: "whatsapp",
    kontakt: "0170 1234567",
    datenschutzEinwilligung: true,
    elternEinwilligung: false,
    verlosungTeilnahme: false,
    ...teil,
  };
}

function umgebung(teil: Partial<Umgebung> = {}): Umgebung {
  return {
    holeSchule: vi.fn(async () => ({ id: "s1", slug: "gymnasium-finkenwerder", name: "Gymnasium Finkenwerder", punkt: HAMBURG })),
    findeKonto: vi.fn(async () => null),
    legeKontoAn: vi.fn(async () => ({ id: "k1", verifiziertAm: null })),
    hatBereitsBewertet: vi.fn(async () => false),
    merkeEmpfehlung: vi.fn(async () => {}),
    holeZaehler: vi.fn(async () => ({
      abgabenLetzteZehnMinuten: 1,
      schulenLetzte24Stunden: 1,
      bewertungenDieserSchuleLetzteStunde: 2,
    })),
    ortungDesAbsenders: vi.fn(async () => HAMBURG),
    holeEinstellungen: vi.fn(async () => VORGABEN),
    // Ohne Vergleichswert entfällt das Abweichungssignal - der Normalfall für
    // eine Schule, die noch kaum bewertet ist.
    holeSchulmittel: vi.fn(async () => ({ mittel: null, anzahl: 0 })),
    pruefeFreitext: vi.fn(async () => false),
    speichere: vi.fn(async () => ({ bewertungId: "b1" })),
    sendeBestaetigung: vi.fn(async () => true),
    ...teil,
  };
}

describe("Erfolgreiche Abgabe", () => {
  it("legt Konto und Bewertung an und verschickt die Bestätigung", async () => {
    const u = umgebung();
    const e = await bewertungAbgeben(eingabe(), u);
    expect(e.ok).toBe(true);
    expect(u.legeKontoAn).toHaveBeenCalled();
    expect(u.speichere).toHaveBeenCalled();
    expect(u.sendeBestaetigung).toHaveBeenCalled();
  });

  it("gibt den Kontakt nur verschleiert zurück", async () => {
    // Die Bestätigungsseite muss erkennen lassen, wohin die Nachricht ging,
    // ohne den Kontakt bei einem geteilten Bildschirm preiszugeben.
    const e = await bewertungAbgeben(eingabe(), umgebung());
    if (!e.ok) throw new Error("unerwartet abgelehnt");
    expect(e.kontaktAnzeige).toBe("+49170 ****567");
    expect(e.kontaktAnzeige).not.toContain("1234");
  });

  it("nutzt ein bestehendes Konto statt eines neuen", async () => {
    const u = umgebung({ findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })) });
    await bewertungAbgeben(eingabe(), u);
    expect(u.legeKontoAn).not.toHaveBeenCalled();
  });

  it("speichert den Klartext des Tokens nirgends", async () => {
    const u = umgebung();
    await bewertungAbgeben(eingabe(), u);
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const versandt = (u.sendeBestaetigung as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    // Gespeichert wird der Hash, verschickt der Klartext.
    expect(gespeichert.token.hash).not.toBe(gespeichert.token.klartext);
    expect(versandt.klartext).toBe(gespeichert.token.klartext);
  });
});

describe("Klickverhalten", () => {
  const gleichmaessig = Array.from({ length: 30 }, () => 200);

  it("speichert Kennzahlen und die vollständige Folge", async () => {
    const u = umgebung();
    await bewertungAbgeben(eingabe({ klickabstaende: gleichmaessig, dauerSekunden: 30 }), u);
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gespeichert.klick).toEqual({ anzahl: 30, medianMs: 200, streuung: 0 });
    expect(gespeichert.klickfolge).toEqual(gleichmaessig);
    // Die Folge steht als eigenes Feld da und nicht in der Eingabe: An der
    // Einfügestelle soll sichtbar sein, dass sie aufbewahrt wird.
    expect(gespeichert.eingabe).not.toHaveProperty("klickabstaende");
  });

  it("bewahrt auch eine unglaubwürdige Folge auf, wertet sie aber nicht aus", async () => {
    // Behauptet: 30 mal acht Sekunden. Der signierte Stempel sagt: fünf Sekunden.
    // Gerade diese Reihe ist ein Befund und darf deshalb nicht verworfen werden.
    const erfunden = Array.from({ length: 30 }, () => 8000);
    const u = umgebung();
    await bewertungAbgeben(eingabe({ klickabstaende: erfunden, dauerSekunden: 5 }), u);
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gespeichert.klickfolge).toEqual(erfunden);
    expect(gespeichert.klick).toBeNull();
  });

  it("nimmt keinen Unsinn entgegen", async () => {
    const u = umgebung();
    await bewertungAbgeben(
      { ...eingabe(), klickabstaende: [200, Number.NaN, -1, 300] } as never,
      u,
    );
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gespeichert.klickfolge).toEqual([200, 300]);
  });

  it("hält eine Bewertung mit Skriptmuster zur Prüfung an", async () => {
    const u = umgebung({ findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })) });
    await bewertungAbgeben(eingabe({ klickabstaende: gleichmaessig, dauerSekunden: 30 }), u);
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gespeichert.status).toBe("in_pruefung_betrug");
  });

  it("lässt ohne Messung alles beim Alten", async () => {
    const u = umgebung({ findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })) });
    await bewertungAbgeben(eingabe(), u);
    const gespeichert = (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gespeichert.klick).toBeNull();
    expect(gespeichert.klickfolge).toBeNull();
    expect(gespeichert.status).toBe("wartet_auf_verifizierung");
  });
});

describe("Abgelehnte Abgabe", () => {
  it("prüft die Eingabe, bevor irgendetwas angelegt wird", async () => {
    const u = umgebung();
    const e = await bewertungAbgeben(eingabe({ datenschutzEinwilligung: false }), u);
    expect(e.ok).toBe(false);
    expect(u.holeSchule).not.toHaveBeenCalled();
    expect(u.legeKontoAn).not.toHaveBeenCalled();
  });

  it("weist eine unbekannte Schule ab", async () => {
    const u = umgebung({ holeSchule: vi.fn(async () => null) });
    const e = await bewertungAbgeben(eingabe(), u);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.fehler[0]!.meldung).toContain("kennen wir nicht");
  });

  it("lässt keine zweite Bewertung derselben Schule zu", async () => {
    const u = umgebung({ hatBereitsBewertet: vi.fn(async () => true) });
    const e = await bewertungAbgeben(eingabe(), u);
    expect(e.ok).toBe(false);
    if (!e.ok) {
      // Der Hinweis nennt den Weg, der stattdessen offensteht.
      expect(e.fehler[0]!.meldung).toContain("aktualisieren");
      expect(e.fehler[0]!.meldung).toContain("Gymnasium Finkenwerder");
    }
    expect(u.speichere).not.toHaveBeenCalled();
  });
});

describe("Status nach der Abgabe", () => {
  const gespeicherterStatus = (u: Umgebung) =>
    (u.speichere as ReturnType<typeof vi.fn>).mock.calls[0]![0].status;

  it("wartet zuerst auf die Bestätigung", async () => {
    const u = umgebung();
    await bewertungAbgeben(eingabe(), u);
    expect(gespeicherterStatus(u)).toBe("wartet_auf_verifizierung");
  });

  it("hält eine Bewertung aus großer Entfernung zurück, wenn das Konto bestätigt ist", async () => {
    const u = umgebung({
      findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })),
      ortungDesAbsenders: vi.fn(async () => MUENCHEN),
    });
    await bewertungAbgeben(eingabe(), u);
    expect(gespeicherterStatus(u)).toBe("in_pruefung_geo");
  });

  it("hält bei auffälligem Freitext zurück", async () => {
    const u = umgebung({
      findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })),
      pruefeFreitext: vi.fn(async () => true),
    });
    await bewertungAbgeben(eingabe({ freitexte: { A: "Frau Müller ist unmöglich" } }), u);
    expect(gespeicherterStatus(u)).toBe("in_pruefung_betrug");
  });

  it("gibt eine unauffällige Bewertung eines bestätigten Kontos frei zur Prüfung", async () => {
    const u = umgebung({ findeKonto: vi.fn(async () => ({ id: "k9", verifiziertAm: new Date() })) });
    await bewertungAbgeben(eingabe(), u);
    expect(gespeicherterStatus(u)).toBe("wartet_auf_verifizierung");
  });

  it("fragt den Freitextfilter gar nicht, wenn kein Text vorliegt", async () => {
    const u = umgebung();
    await bewertungAbgeben(eingabe(), u);
    expect(u.pruefeFreitext).not.toHaveBeenCalled();
  });
});

describe("Freitexte", () => {
  it("übergeht leere und nur aus Leerzeichen bestehende Texte", () => {
    expect(freitexteAlsObjekt({ A: "  ", B: "", C: " etwas " })).toEqual({ C: "etwas" });
  });
});
