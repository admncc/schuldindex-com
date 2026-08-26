import { describe, expect, it, vi } from "vitest";
import {
  SMS_GRENZE,
  baueBestaetigung,
  sende,
  telefonZustaendig,
  type Versandweg,
  type Zustellergebnis,
} from "./nachricht";

const BASIS = "https://schulindex.com";
const TOKEN = "wYQ8kR3mZ1pL7vN4xT2bC6dF9gH0jK5sA8eU3iO7yQ";

function weg(art: Versandweg["art"], ergebnis: Zustellergebnis, zustaendig = true): Versandweg {
  return {
    art,
    zustaendig: () => zustaendig,
    sende: vi.fn(async () => ergebnis),
  };
}

describe("Nachrichtentext", () => {
  it("bleibt für SMS unter der Grenze von 160 Zeichen", () => {
    // Darüber wird die Nachricht geteilt und doppelt berechnet — bei tausenden
    // Bestätigungen im Monat ist das kein Rundungsfehler.
    const n = baueBestaetigung(BASIS, TOKEN, "sms");
    expect(n.text.length).toBeLessThanOrEqual(SMS_GRENZE);
  });

  it("enthält den Link mit dem Token", () => {
    expect(baueBestaetigung(BASIS, TOKEN, "sms").text).toContain(`${BASIS}/bestaetigen?token=${TOKEN}`);
  });

  it("nennt die Gültigkeitsdauer", () => {
    for (const art of ["sms", "whatsapp", "email"] as const) {
      expect(baueBestaetigung(BASIS, TOKEN, art).text, art).toMatch(/24/);
    }
  });

  it("gibt der E-Mail einen Betreff, der SMS keinen", () => {
    expect(baueBestaetigung(BASIS, TOKEN, "email").betreff.length).toBeGreaterThan(10);
    expect(baueBestaetigung(BASIS, TOKEN, "sms").betreff).toBe("");
  });

  it("sagt in der E-Mail, was bei Irrtum zu tun ist", () => {
    expect(baueBestaetigung(BASIS, TOKEN, "email").text).toContain("ignorieren");
  });
});

describe("Zuständigkeit", () => {
  it("lässt Telefonwege für Nummern gelten", () => {
    expect(telefonZustaendig("+491701234567", "whatsapp")).toBe(true);
    expect(telefonZustaendig("+491701234567", "sms")).toBe(true);
  });

  it("hält Telefonwege von E-Mail-Adressen fern", () => {
    expect(telefonZustaendig("anna@beispiel.de", "email")).toBe(false);
    expect(telefonZustaendig("anna@beispiel.de", "whatsapp")).toBe(false);
  });
});

describe("Versandkette", () => {
  const nachricht = baueBestaetigung(BASIS, TOKEN, "whatsapp");

  it("nimmt den ersten Weg, der zustellt", async () => {
    const whatsapp = weg("whatsapp", { ok: true, weg: "whatsapp" });
    const sms = weg("sms", { ok: true, weg: "sms" });
    const e = await sende([whatsapp, sms], "+491701234567", "whatsapp", nachricht);
    expect(e).toEqual({ ok: true, weg: "whatsapp" });
    expect(sms.sende).not.toHaveBeenCalled();
  });

  it("fällt auf SMS zurück, wenn WhatsApp die Nummer nicht erreicht", async () => {
    // Der Regelfall, für den die Kette da ist: WhatsApp setzt ein Konto zur
    // Nummer voraus. Ohne Rückfall bliebe jede Person ohne WhatsApp ausgesperrt.
    const whatsapp = weg("whatsapp", { ok: false, grund: "kein WhatsApp-Konto zur Nummer" });
    const sms = weg("sms", { ok: true, weg: "sms" });
    const e = await sende([whatsapp, sms], "+491701234567", "whatsapp", nachricht);
    expect(e).toEqual({ ok: true, weg: "sms" });
    expect(sms.sende).toHaveBeenCalled();
  });

  it("überspringt Wege, die nicht zuständig sind", async () => {
    const whatsapp = weg("whatsapp", { ok: true, weg: "whatsapp" }, false);
    const email = weg("email", { ok: true, weg: "email" });
    const e = await sende([whatsapp, email], "anna@beispiel.de", "email", nachricht);
    expect(e).toEqual({ ok: true, weg: "email" });
    expect(whatsapp.sende).not.toHaveBeenCalled();
  });

  it("nennt alle Gründe, wenn jeder Weg scheitert", async () => {
    const e = await sende(
      [
        weg("whatsapp", { ok: false, grund: "kein Konto" }),
        weg("sms", { ok: false, grund: "Anbieter nicht erreichbar" }),
      ],
      "+491701234567",
      "whatsapp",
      nachricht,
    );
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.grund).toContain("kein Konto");
      expect(e.grund).toContain("Anbieter nicht erreichbar");
    }
  });

  it("meldet, wenn gar kein Weg zuständig ist", async () => {
    const e = await sende([weg("sms", { ok: true, weg: "sms" }, false)], "x", "sms", nachricht);
    expect(e).toEqual({ ok: false, grund: "kein passender Versandweg" });
  });

  it("reicht den Empfänger an den Weg durch", async () => {
    const sms = weg("sms", { ok: true, weg: "sms" });
    await sende([sms], "+491701234567", "sms", nachricht);
    expect(sms.sende).toHaveBeenCalledWith(expect.objectContaining({ empfaenger: "+491701234567" }));
  });
});
