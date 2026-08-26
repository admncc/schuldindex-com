import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  entschluessele,
  hashGleich,
  kontaktHash,
  normalisiereKontakt,
  verschleiere,
  verschluessele,
} from "./kontakt";

beforeAll(() => {
  process.env["KONTAKT_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
  process.env["KONTAKT_CHIFFRE_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

describe("Normalisierung von Mobilnummern", () => {
  it("führt die deutschen Schreibweisen auf eine zusammen", () => {
    // Ohne das gälten diese vier Eingaben als vier verschiedene Personen —
    // und die Erkennung von Mehrfachkonten liefe ins Leere.
    const erwartet = "+491701234567";
    for (const eingabe of ["0170 1234567", "+49 170 1234567", "0049-170-1234567", "(0170) 123 45 67"]) {
      expect(normalisiereKontakt(eingabe, "sms"), eingabe).toBe(erwartet);
    }
  });

  it("behält ausländische Vorwahlen", () => {
    expect(normalisiereKontakt("+43 664 1234567", "sms")).toBe("+436641234567");
  });

  it("behandelt WhatsApp und SMS gleich", () => {
    expect(normalisiereKontakt("0170 1234567", "whatsapp")).toBe(normalisiereKontakt("0170 1234567", "sms"));
  });
});

describe("Normalisierung von E-Mail-Adressen", () => {
  it("vereinheitlicht Groß- und Kleinschreibung", () => {
    expect(normalisiereKontakt("  Anna@Beispiel.DE ", "email")).toBe("anna@beispiel.de");
  });

  it("lässt Punkte im lokalen Teil stehen", () => {
    // Sie zu entfernen wäre bequem für die Dublettenerkennung, ist bei den
    // meisten Anbietern aber schlicht falsch: zwei verschiedene Postfächer.
    expect(normalisiereKontakt("a.n.n.a@beispiel.de", "email")).toBe("a.n.n.a@beispiel.de");
  });
});

describe("Suchhash", () => {
  it("ist für dieselbe Nummer in jeder Schreibweise gleich", () => {
    expect(kontaktHash("0170 1234567", "sms")).toBe(kontaktHash("+49 170 1234567", "sms"));
  });

  it("unterscheidet verschiedene Nummern", () => {
    expect(kontaktHash("0170 1234567", "sms")).not.toBe(kontaktHash("0170 1234568", "sms"));
  });

  it("trennt Kontaktarten", () => {
    // Sonst könnte eine Nummer als E-Mail eingetragen dieselbe Kennung ergeben.
    expect(kontaktHash("0170 1234567", "sms")).not.toBe(kontaktHash("0170 1234567", "whatsapp"));
  });

  it("hängt am geheimen Schlüssel", () => {
    // Der Raum deutscher Mobilnummern ist klein genug, um ihn durchzurechnen.
    // Ein blanker SHA-256 wäre damit keine Verschleierung, sondern eine Liste.
    const mitSchluesselA = kontaktHash("0170 1234567", "sms");
    process.env["KONTAKT_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
    expect(kontaktHash("0170 1234567", "sms")).not.toBe(mitSchluesselA);
  });

  it("verweigert den Dienst ohne Schlüssel", () => {
    const alt = process.env["KONTAKT_HMAC_SCHLUESSEL"];
    delete process.env["KONTAKT_HMAC_SCHLUESSEL"];
    expect(() => kontaktHash("0170 1234567", "sms")).toThrow(/nicht gesetzt/);
    process.env["KONTAKT_HMAC_SCHLUESSEL"] = alt!;
  });

  it("weist einen zu kurzen Schlüssel zurück", () => {
    const alt = process.env["KONTAKT_HMAC_SCHLUESSEL"];
    process.env["KONTAKT_HMAC_SCHLUESSEL"] = randomBytes(16).toString("base64");
    expect(() => kontaktHash("0170 1234567", "sms")).toThrow(/32 Byte/);
    process.env["KONTAKT_HMAC_SCHLUESSEL"] = alt!;
  });
});

describe("Verschlüsselung", () => {
  it("gibt den Klartext wieder her", () => {
    const klartext = "+491701234567";
    expect(entschluessele(verschluessele(klartext))).toBe(klartext);
  });

  it("erzeugt bei gleichem Klartext verschiedene Geheimtexte", () => {
    // Sonst ließe sich aus der Datenbank ablesen, welche Konten denselben
    // Kontakt tragen — genau das, was der Hash kontrolliert leisten soll.
    const a = verschluessele("+491701234567");
    const b = verschluessele("+491701234567");
    expect(a.equals(b)).toBe(false);
  });

  it("merkt, wenn am Geheimtext manipuliert wurde", () => {
    const daten = verschluessele("+491701234567");
    daten[daten.length - 1] = (daten.at(-1)! ^ 0xff) & 0xff;
    expect(() => entschluessele(daten)).toThrow();
  });

  it("kommt mit Umlauten zurecht", () => {
    expect(entschluessele(verschluessele("jörg.müßig@beispiel.de"))).toBe("jörg.müßig@beispiel.de");
  });
});

describe("Verschleierte Anzeige", () => {
  it("lässt E-Mail-Adressen erkennbar, ohne sie preiszugeben", () => {
    expect(verschleiere("Anna.Beispiel@web.de", "email")).toBe("a***l@web.de");
  });

  it("kommt mit sehr kurzen lokalen Teilen zurecht", () => {
    expect(verschleiere("ab@web.de", "email")).toBe("a@web.de");
  });

  it("zeigt von einer Nummer nur Vorwahl und Endziffern", () => {
    expect(verschleiere("0170 1234567", "sms")).toBe("+49170 ****567");
  });
});

describe("Hashvergleich", () => {
  it("erkennt Gleichheit und Ungleichheit", () => {
    const h = kontaktHash("0170 1234567", "sms");
    expect(hashGleich(h, h)).toBe(true);
    expect(hashGleich(h, kontaktHash("0170 7654321", "sms"))).toBe(false);
  });

  it("kommt mit verschieden langen Eingaben zurecht", () => {
    expect(hashGleich("kurz", "deutlich laenger")).toBe(false);
  });
});
