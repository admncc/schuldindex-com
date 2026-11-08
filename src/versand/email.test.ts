import { afterEach, describe, expect, it } from "vitest";
import { emailweg, kopfzeilensicher, pruefeEmpfaenger, smtpAusUmgebung, type Smtpeinstellungen } from "./email";

const EINSTELLUNGEN: Smtpeinstellungen = {
  host: "smtp.beispiel.de",
  port: 587,
  benutzer: "schulindex",
  kennwort: "geheim",
  absender: "SCHULINDEX <info@schulindex.com>",
  antwortAn: null,
};

function wegMitProtokoll() {
  const auftraege: Parameters<Parameters<typeof emailweg>[1] & object>[0][] = [];
  const weg = emailweg(EINSTELLUNGEN, async (a) => {
    auftraege.push(a);
  });
  return { weg, auftraege };
}

describe("pruefeEmpfaenger", () => {
  it("nimmt gewöhnliche Adressen an", () => {
    expect(pruefeEmpfaenger("anna@beispiel.de")).toBe("anna@beispiel.de");
    expect(pruefeEmpfaenger("  anna+schule@beispiel.co.uk  ")).toBe("anna+schule@beispiel.co.uk");
  });

  /**
   * **Der Grund, aus dem es diese Prüfung gibt.** Ein Zeilenumbruch in der
   * Adresse beendet die Kopfzeile `To:` und beginnt eine neue - wer das
   * einschleust, verschickt über unseren Server, was er will.
   */
  it("lehnt alles ab, was eine Kopfzeile beenden könnte", () => {
    expect(pruefeEmpfaenger("opfer@x.de\nBcc: alle@y.de")).toBeNull();
    expect(pruefeEmpfaenger("opfer@x.de\r\nBcc: alle@y.de")).toBeNull();
    expect(pruefeEmpfaenger("opfer@x.de\u0000")).toBeNull();
    // `$` trifft in JavaScript auch vor einem abschliessenden Zeilenumbruch -
    // deshalb reicht ein Muster allein nicht, und deshalb steht die
    // Steuerzeichenprüfung davor.
    expect(pruefeEmpfaenger("opfer@x.de\n")).toBe("opfer@x.de");
    expect(pruefeEmpfaenger("a@b.de, c@d.de")).toBeNull();
    expect(pruefeEmpfaenger("<a@b.de>")).toBeNull();
  });

  it("lehnt Unvollständiges und Übergrosses ab", () => {
    expect(pruefeEmpfaenger("")).toBeNull();
    expect(pruefeEmpfaenger("anna@beispiel")).toBeNull();
    expect(pruefeEmpfaenger("anna.beispiel.de")).toBeNull();
    expect(pruefeEmpfaenger(`${"a".repeat(250)}@b.de`)).toBeNull();
  });
});

describe("kopfzeilensicher", () => {
  it("entschärft Umbrüche im Betreff", () => {
    // `baueSchulzugang` setzt den Schulnamen in den Betreff, und der kommt aus
    // dem importierten Verzeichnis.
    expect(kopfzeilensicher("Zugang zu\r\nBcc: alle@x.de")).toBe("Zugang zu Bcc: alle@x.de");
    expect(kopfzeilensicher("  Normaler Betreff  ")).toBe("Normaler Betreff");
    expect(kopfzeilensicher("x".repeat(300))).toHaveLength(200);
  });
});

describe("emailweg", () => {
  it("stellt zu und reicht Absender, Empfänger und Text durch", async () => {
    const { weg, auftraege } = wegMitProtokoll();
    const ergebnis = await weg.sende({
      empfaenger: "anna@beispiel.de",
      betreff: "Bestätige deine Bewertung",
      text: "Link: https://schulindex.com/bestaetigen?token=abc",
    });
    expect(ergebnis).toEqual({ ok: true, weg: "email" });
    expect(auftraege).toHaveLength(1);
    expect(auftraege[0]!.an).toBe("anna@beispiel.de");
    expect(auftraege[0]!.von).toBe("SCHULINDEX <info@schulindex.com>");
  });

  it("verschickt gar nicht erst an eine Adresse mit Umbruch", async () => {
    const { weg, auftraege } = wegMitProtokoll();
    const ergebnis = await weg.sende({
      empfaenger: "opfer@x.de\nBcc: alle@y.de",
      betreff: "x",
      text: "y",
    });
    expect(ergebnis.ok).toBe(false);
    expect(auftraege).toHaveLength(0);
  });

  it("gibt einen Fehler zurück, statt zu werfen - die Kette soll weiterlaufen", async () => {
    const weg = emailweg(EINSTELLUNGEN, async () => {
      throw new Error("Verbindung abgelehnt");
    });
    const ergebnis = await weg.sende({ empfaenger: "a@b.de", betreff: "x", text: "y" });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toContain("Verbindung abgelehnt");
  });

  it("trägt den Bestätigungslink nie in den Fehlergrund", async () => {
    // Der Grund landet im Ereignisprotokoll. Der Link **ist** das Geheimnis.
    const weg = emailweg(EINSTELLUNGEN, async () => {
      throw new Error("550 abgelehnt");
    });
    const ergebnis = await weg.sende({
      empfaenger: "a@b.de",
      betreff: "x",
      text: "https://schulindex.com/bestaetigen?token=GEHEIM",
    });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).not.toContain("GEHEIM");
  });

  it("fühlt sich nur für E-Mail-Adressen zuständig", () => {
    const { weg } = wegMitProtokoll();
    expect(weg.zustaendig("anna@beispiel.de", "email")).toBe(true);
    expect(weg.zustaendig("+4917012345678", "sms")).toBe(false);
  });
});

describe("smtpAusUmgebung", () => {
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

  it("liest eine vollständige Einrichtung", () => {
    setze({
      SMTP_HOST: "smtp.beispiel.de",
      SMTP_BENUTZER: "u",
      SMTP_KENNWORT: "p",
      SMTP_ABSENDER: "SCHULINDEX <info@schulindex.com>",
      SMTP_PORT: "465",
    });
    expect(smtpAusUmgebung()).toMatchObject({ host: "smtp.beispiel.de", port: 465 });
  });

  it("nimmt 587 als Vorgabe", () => {
    setze({
      SMTP_HOST: "smtp.beispiel.de",
      SMTP_BENUTZER: "u",
      SMTP_KENNWORT: "p",
      SMTP_ABSENDER: "a@b.de",
      SMTP_PORT: undefined,
    });
    expect(smtpAusUmgebung()?.port).toBe(587);
  });

  it("hält eine halbe Einrichtung für keine", () => {
    // Sonst scheitert der Versand erst beim ersten echten Versuch - an einer
    // Stelle, an der niemand hinsieht.
    setze({
      SMTP_HOST: "smtp.beispiel.de",
      SMTP_BENUTZER: "u",
      SMTP_KENNWORT: undefined,
      SMTP_ABSENDER: "a@b.de",
    });
    expect(smtpAusUmgebung()).toBeNull();
  });
});
