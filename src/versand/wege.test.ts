import { afterEach, describe, expect, it } from "vitest";
import { versandkette, zustellbareArten } from "./wege";

const sicherung = { ...process.env };
afterEach(() => {
  process.env = { ...sicherung };
});

function setze(werte: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(werte)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const SMTP = {
  SMTP_HOST: "smtp.beispiel.de",
  SMTP_BENUTZER: "u",
  SMTP_KENNWORT: "p",
  SMTP_ABSENDER: "SCHULINDEX <info@schulindex.com>",
};

describe("zustellbareArten", () => {
  /**
   * Der Fehler, gegen den die Funktion steht: Das Formular bot in der
   * Produktion alle drei Wege an, und keiner stellte zu. Wer „WhatsApp" wählte,
   * gab eine Bewertung ab und wartete auf eine Nachricht, die nie kommen konnte.
   */
  it("bietet in der Produktion nichts an, solange SMTP fehlt", () => {
    setze({ NODE_ENV: "production", SMTP_HOST: undefined, SMTP_BENUTZER: undefined });
    expect(zustellbareArten()).toEqual([]);
  });

  it("bietet in der Produktion E-Mail an, sobald SMTP steht - und nur E-Mail", () => {
    setze({ NODE_ENV: "production", ...SMTP });
    expect(zustellbareArten()).toEqual(["email"]);
  });

  it("lässt ausserhalb der Produktion alle drei zu - dort ist die Konsole die Zustellung", () => {
    setze({ NODE_ENV: "development", SMTP_HOST: undefined, SMTP_BENUTZER: undefined });
    expect(zustellbareArten()).toEqual(["whatsapp", "sms", "email"]);
  });
});

describe("versandkette", () => {
  it("setzt den echten E-Mail-Weg ein, sobald SMTP eingerichtet ist", () => {
    setze({ ...SMTP });
    const kette = versandkette();
    expect(kette.map((w) => w.art)).toEqual(["whatsapp", "sms", "email"]);
    // Der Protokollweg hält jede Adresse mit „@" für zustellbar, der echte
    // Weg prüft sie - daran lassen sich die beiden unterscheiden.
    expect(kette[2]!.zustaendig("keine-adresse@", "email")).toBe(false);
  });

  it("fällt ohne SMTP auf den Protokollweg zurück", () => {
    setze({ SMTP_HOST: undefined, SMTP_BENUTZER: undefined, SMTP_KENNWORT: undefined, SMTP_ABSENDER: undefined });
    expect(versandkette()[2]!.zustaendig("keine-adresse@", "email")).toBe(true);
  });
});
