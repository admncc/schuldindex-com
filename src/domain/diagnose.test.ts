import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  istEreignisart,
  istZugangsdauer,
  PROTOKOLL_STUNDEN,
  saeubere,
  saeubereWert,
  TOKEN_VORSATZ,
} from "./diagnose";
import { erzeugeDiagnosetoken, hasheToken, tokenGleich } from "./diagnosetoken";

beforeAll(() => {
  process.env["TOKEN_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

describe("saeubere", () => {
  // **Der Fehler, gegen den das steht.** Niemand beschliesst, Kontaktdaten zu
  // protokollieren - sie stehen irgendwann in einer Fehlermeldung, weil eine
  // Bibliothek den Datensatz mitgibt, der den Fehler ausgelöst hat.
  it("entfernt Adressen aus einer Fehlermeldung", () => {
    const text = saeubere("Zustellung an anna.mueller@gymnasium-test.de fehlgeschlagen");
    expect(text).not.toContain("anna.mueller");
    expect(text).not.toContain("gymnasium-test.de");
    expect(text).toContain("<kontakt>");
  });

  it("entfernt Telefonnummern in jeder Schreibweise", () => {
    for (const nummer of ["+49 170 1234567", "0170/1234567", "0170-123 45 67", "+491701234567"]) {
      const text = saeubere(`WhatsApp an ${nummer} abgelehnt`);
      expect(text, nummer).not.toMatch(/\d{7}/);
    }
  });

  // Der eigene Zugangsschlüssel ist der peinlichste Fall: Ein Client, der die
  // ganze Anfrage mitloggt, schriebe ihn in genau das Protokoll, das er öffnet.
  it("entfernt den eigenen Diagnoseschlüssel", () => {
    const token = erzeugeDiagnosetoken(8).klartext;
    expect(saeubere(`GET /api/diagnose mit ${token}`)).not.toContain(token);
  });

  it("lässt harmlosen Text in Ruhe", () => {
    const text = "Aggregat für Schule 12 neu gerechnet, 34 Bewertungen";
    expect(saeubere(text)).toBe(text);
  });

  it("kappt sehr lange Texte", () => {
    expect(saeubere("x".repeat(9000))).toHaveLength(4000);
  });

  // **Der Fehler, gegen den das steht.** Die erste Fassung nahm jede Folge ab
  // 32 Zeichen und machte aus einer Meldung mit einem langen Bezeichner ein
  // `<token>` - aus einer lesbaren Zeile also eine unlesbare. Ein Protokoll,
  // das aus Vorsicht unbrauchbar wird, hilft niemandem.
  it("hält lange, aber harmlose Wörter aus", () => {
    const text = "Tabelle bewertung_versionen_aktualisierungsschluessel neu aufgebaut";
    expect(saeubere(text)).toBe(text);
  });
});

describe("saeubereWert", () => {
  // Ein Freitext aus einer Bewertung ist an nichts zu erkennen, was ein Muster
  // fassen könnte - und genau er ist das Empfindlichste, was hier liegt.
  // Deshalb entscheidet der Name, nicht der Wert.
  it("entfernt verdächtige Schlüssel ganz", () => {
    const raus = saeubereWert({
      freitext: "Die Lehrerin in der 8b ist unfair",
      kontakt_hash: "abc",
      authorization: "Bearer geheim",
      schuleId: "12",
      anzahl: 7,
    }) as Record<string, unknown>;

    expect(raus["freitext"]).toBe("<entfernt>");
    expect(raus["kontakt_hash"]).toBe("<entfernt>");
    expect(raus["authorization"]).toBe("<entfernt>");
    expect(raus["schuleId"]).toBe("12");
    expect(raus["anzahl"]).toBe(7);
  });

  it("geht auch in verschachtelte Werte", () => {
    const raus = saeubereWert({ anfrage: { kopf: { von: "kind@test-schule.de" } } });
    expect(JSON.stringify(raus)).not.toContain("kind@");
    expect(JSON.stringify(raus)).toContain("<kontakt>");
  });

  // Ein Fehlerobjekt kann sich selbst enthalten. Ein Protokollschreiber, der
  // daran hängen bleibt, nimmt den Server mit.
  it("bleibt an einem Ring nicht hängen", () => {
    const ring: Record<string, unknown> = { name: "a" };
    ring["selbst"] = ring;
    expect(() => JSON.stringify(saeubereWert(ring))).not.toThrow();
  });

  it("macht aus undefined etwas, das JSON kennt", () => {
    expect(saeubereWert(undefined)).toBeNull();
  });
});

describe("Diagnoseschlüssel", () => {
  it("trägt den Vorsatz und ist bei jedem Aufruf neu", () => {
    const a = erzeugeDiagnosetoken(8);
    const b = erzeugeDiagnosetoken(8);
    expect(a.klartext.startsWith(TOKEN_VORSATZ)).toBe(true);
    expect(a.klartext).not.toBe(b.klartext);
    expect(a.hash).not.toBe(b.hash);
  });

  it("läuft nach der gewählten Dauer ab", () => {
    const jetzt = new Date("2026-09-02T10:00:00Z");
    expect(erzeugeDiagnosetoken(1, jetzt).gueltigBis.toISOString()).toBe("2026-09-02T11:00:00.000Z");
    expect(erzeugeDiagnosetoken(72, jetzt).gueltigBis.toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });

  it("hasht wiederholbar und vergleicht gleich lange Werte", () => {
    const t = erzeugeDiagnosetoken(8);
    expect(hasheToken(t.klartext)).toBe(t.hash);
    expect(tokenGleich(t.hash, hasheToken(t.klartext))).toBe(true);
    expect(tokenGleich(t.hash, "kurz")).toBe(false);
  });
});

describe("Katalog", () => {
  it("kennt nur die vorgesehenen Dauern", () => {
    expect(istZugangsdauer(8)).toBe(true);
    expect(istZugangsdauer(9)).toBe(false);
    // Kein Dauerzugang: Eine Hintertür, die immer offensteht, ist keine
    // Diagnose mehr, sondern ein zweiter Weg ins System.
    expect(istZugangsdauer(0)).toBe(false);
    expect(istZugangsdauer(24 * 30)).toBe(false);
  });

  it("kennt nur die vorgesehenen Ereignisarten", () => {
    expect(istEreignisart("fehler")).toBe(true);
    expect(istEreignisart("Fehler")).toBe(false);
    expect(istEreignisart("beliebig")).toBe(false);
  });

  it("hält die Frist bei 72 Stunden", () => {
    expect(PROTOKOLL_STUNDEN).toBe(72);
  });
});
