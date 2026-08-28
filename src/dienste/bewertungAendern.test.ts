import { describe, expect, it } from "vitest";
import { bewertungAendern, type Aenderungsumgebung, type Bestand } from "./bewertungAendern";
import { FRAGEN } from "../domain/fragebogen";
import type { Bewertungseingabe } from "../domain/bewertungseingabe";
import type { Zustand } from "../domain/bewertungsstatus";

const ANTWORTEN = Object.fromEntries(FRAGEN.map((f, i) => [f.id, ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5]));

const EINGABE: Bewertungseingabe = {
  schulSlug: "gymnasium-beispiel",
  rolle: "schueler_ab_16",
  klassenstufe: 10,
  abgangsjahr: null,
  antworten: ANTWORTEN,
  freitexte: { A: "Die Pausen sind laut, aber die Aufsicht greift ein." },
  // Bei einer Änderung stehen Kontakt und Einwilligung nicht mehr im Formular.
  kontaktart: null,
  kontakt: "",
  datenschutzEinwilligung: false,
  elternEinwilligung: false,
  verlosungTeilnahme: false,
};

function bestand(abweichung: Partial<Bestand> = {}): Bestand {
  return {
    id: "b1",
    kontoId: "k1",
    schuleId: "s1",
    schulSlug: "gymnasium-beispiel",
    status: "freigegeben",
    aktuelleVersion: 1,
    ...abweichung,
  };
}

interface Aufzeichnung {
  gespeichert: { version: number; status: Zustand; schuleId: string }[];
  gefragt: { id: string; konto: string }[];
}

function umgebungMit(
  vorhanden: Bestand | null,
  freitextAuffaellig = false,
): { u: Aenderungsumgebung; auf: Aufzeichnung } {
  const auf: Aufzeichnung = { gespeichert: [], gefragt: [] };
  return {
    auf,
    u: {
      async holeBewertung(id, konto) {
        auf.gefragt.push({ id, konto });
        return vorhanden !== null && vorhanden.kontoId === konto ? vorhanden : null;
      },
      async pruefeFreitext() {
        return freitextAuffaellig;
      },
      async speichereFassung(daten) {
        auf.gespeichert.push({ version: daten.version, status: daten.status, schuleId: daten.schuleId });
      },
    },
  };
}

describe("bewertungAendern", () => {
  it("legt eine neue Fassung an und schickt sie zurück in die Prüfung", async () => {
    const { u, auf } = umgebungMit(bestand());
    const e = await bewertungAendern("b1", "k1", EINGABE, u);

    expect(e).toEqual({ ok: true, status: "in_pruefung_betrug", version: 2 });
    expect(auf.gespeichert).toEqual([{ version: 2, status: "in_pruefung_betrug", schuleId: "s1" }]);
  });

  it("verlangt weder Kontakt noch Einwilligung - die liegen längst vor", async () => {
    const { u } = umgebungMit(bestand());
    expect((await bewertungAendern("b1", "k1", EINGABE, u)).ok).toBe(true);
  });

  it("lässt eine fremde Bewertung nicht ändern", async () => {
    // Die Kennung des Kontos kommt aus der Sitzung; mit einer fremden
    // Bewertungskennung darf nichts passieren.
    const { u, auf } = umgebungMit(bestand({ kontoId: "jemand-anderes" }));
    const e = await bewertungAendern("b1", "k1", EINGABE, u);

    expect(e.ok).toBe(false);
    expect(e.ok === false && e.fehler[0]?.meldung).toBe("Diese Bewertung gibt es nicht.");
    expect(auf.gespeichert).toEqual([]);
  });

  it("sagt bei einer fremden und bei einer nicht vorhandenen Bewertung dasselbe", async () => {
    const fremd = await bewertungAendern("b1", "k1", EINGABE, umgebungMit(bestand({ kontoId: "x" })).u);
    const weg = await bewertungAendern("b1", "k1", EINGABE, umgebungMit(null).u);
    expect(fremd).toEqual(weg);
  });

  it("ändert eine abgelehnte Bewertung nicht", async () => {
    const { u, auf } = umgebungMit(bestand({ status: "abgelehnt" }));
    const e = await bewertungAendern("b1", "k1", EINGABE, u);

    expect(e.ok).toBe(false);
    expect(e.ok === false && e.fehler[0]?.meldung).toMatch(/bleibt abgelehnt/);
    expect(auf.gespeichert).toEqual([]);
  });

  it("lässt eine unbestätigte Bewertung unbestätigt", async () => {
    const { u } = umgebungMit(bestand({ status: "wartet_auf_verifizierung" }));
    const e = await bewertungAendern("b1", "k1", EINGABE, u);
    expect(e).toEqual({ ok: true, status: "wartet_auf_verifizierung", version: 2 });
  });

  it("nimmt einer gehaltenen Bewertung nicht den Prüfgrund", async () => {
    const { u } = umgebungMit(bestand({ status: "in_pruefung_geo" }));
    const e = await bewertungAendern("b1", "k1", EINGABE, u);
    expect(e.ok && e.status).toBe("in_pruefung_geo");
  });

  it("zählt die Fassung hoch, statt sie zu überschreiben", async () => {
    const { u, auf } = umgebungMit(bestand({ aktuelleVersion: 4 }));
    await bewertungAendern("b1", "k1", EINGABE, u);
    expect(auf.gespeichert[0]?.version).toBe(5);
  });

  it("weist eine unvollständige Änderung ab", async () => {
    const { u, auf } = umgebungMit(bestand());
    const e = await bewertungAendern("b1", "k1", { ...EINGABE, antworten: {} }, u);

    expect(e.ok).toBe(false);
    expect(e.ok === false && e.fehler.map((f) => f.feld)).toContain("kategorie.A");
    expect(auf.gespeichert).toEqual([]);
  });

  it("weist eine Klassenstufe bei einer Elternrolle ab", async () => {
    const { u } = umgebungMit(bestand());
    const e = await bewertungAendern("b1", "k1", { ...EINGABE, rolle: "eltern" }, u);
    expect(e.ok === false && e.fehler.map((f) => f.feld)).toEqual(["klassenstufe"]);
  });

  it("hält eine Fassung mit auffälligem Freitext zurück", async () => {
    const { u } = umgebungMit(bestand(), true);
    const e = await bewertungAendern("b1", "k1", EINGABE, u);
    expect(e.ok && e.status).toBe("in_pruefung_betrug");
  });

  it("prüft den Freitext gar nicht erst, wenn keiner da ist", async () => {
    let gefragt = false;
    const u: Aenderungsumgebung = {
      async holeBewertung() {
        return bestand();
      },
      async pruefeFreitext() {
        gefragt = true;
        return true;
      },
      async speichereFassung() {},
    };
    await bewertungAendern("b1", "k1", { ...EINGABE, freitexte: {} }, u);
    expect(gefragt).toBe(false);
  });
});
