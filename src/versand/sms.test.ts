import { afterEach, describe, expect, it } from "vitest";
import { fuerGtx, leseAntwort, smsAusUmgebung, smsweg, type Smseinstellungen } from "./sms";

const E: Smseinstellungen = { benutzer: "u", kennwort: "geheim", absender: "SCHULINDEX" };

describe("fuerGtx", () => {
  it("nimmt das Plus weg, sonst nichts", () => {
    expect(fuerGtx("+491701717179")).toBe("491701717179");
    expect(fuerGtx("  +436641234567 ")).toBe("436641234567");
  });

  it("biegt nichts zurecht, was keine internationale Nummer ist", () => {
    // Eine falsch geratene Nummer geht an einen Fremden - lieber gar nicht.
    for (const n of ["01701717179", "491701717179", "+0491701717179", "+49170", "", "+49 170 1717179"]) {
      expect(fuerGtx(n)).toBeNull();
    }
  });
});

describe("leseAntwort", () => {
  /**
   * **Der Grund, aus dem diese Funktion existiert.** GTX antwortet auf einen
   * Fehler mit HTTP 200 und schreibt den Fehlercode in den Körper. Wer nur
   * `response.ok` prüft, hält jeden Ausfall für eine Zustellung.
   */
  it("erkennt die Einlieferung an der Kennung im Körper", () => {
    expect(leseAntwort("200 OK (26818021)")).toEqual({ ok: true, kennung: "26818021" });
    expect(leseAntwort("  200 OK (26818021)\n")).toEqual({ ok: true, kennung: "26818021" });
    expect(leseAntwort("200 OK")).toEqual({ ok: true, kennung: "" });
  });

  it("erkennt die Fehlercodes und benennt sie", () => {
    expect(leseAntwort("401 Unauthorized")).toEqual({ ok: false, grund: "401 - Benutzername oder Kennwort falsch" });
    expect(leseAntwort("503 Service Unavailable")).toMatchObject({ ok: false });
    expect(leseAntwort("408 Blacklist")).toMatchObject({ ok: false });
    expect(leseAntwort("400 Bad Request")).toMatchObject({ ok: false });
  });

  it("hält Unbekanntes für einen Fehler, nicht für einen Erfolg", () => {
    expect(leseAntwort("")).toMatchObject({ ok: false });
    expect(leseAntwort("<html>Wartungsarbeiten</html>")).toMatchObject({ ok: false });
  });
});

describe("smsweg", () => {
  it("schickt Nummer ohne Plus, Absender und Text", async () => {
    let gesehen: URLSearchParams | null = null;
    const weg = smsweg(E, async (f) => {
      gesehen = f;
      return "200 OK (1)";
    });
    const ergebnis = await weg.sende({
      empfaenger: "+491701717179",
      betreff: "",
      text: "SCHULINDEX: Dein Code lautet 043912.",
    });
    expect(ergebnis).toEqual({ ok: true, weg: "sms" });
    expect(gesehen!.get("to")).toBe("491701717179");
    expect(gesehen!.get("from")).toBe("SCHULINDEX");
    expect(gesehen!.get("text")).toContain("043912");
  });

  it("trägt den Code nie in den Fehlergrund", async () => {
    // Der Grund landet im Ereignisprotokoll.
    const weg = smsweg(E, async () => "401 Unauthorized");
    const ergebnis = await weg.sende({ empfaenger: "+491701717179", betreff: "", text: "Code 043912" });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).not.toContain("043912");
  });

  it("wirft nicht, wenn das Netz wegbricht - die Kette soll weiterlaufen", async () => {
    const weg = smsweg(E, async () => {
      throw new Error("timeout");
    });
    const ergebnis = await weg.sende({ empfaenger: "+491701717179", betreff: "", text: "x" });
    expect(ergebnis.ok).toBe(false);
  });

  it("fühlt sich nur für Telefonnummern zuständig", () => {
    const weg = smsweg(E, async () => "200 OK (1)");
    expect(weg.zustaendig("+491701717179", "sms")).toBe(true);
    expect(weg.zustaendig("anna@beispiel.de", "email")).toBe(false);
    expect(weg.zustaendig("01701717179", "sms")).toBe(false);
  });
});

describe("smsAusUmgebung", () => {
  const sicherung = { ...process.env };
  afterEach(() => {
    process.env = { ...sicherung };
  });

  it("hält eine halbe Einrichtung für keine", () => {
    process.env["SMS_BENUTZER"] = "u";
    delete process.env["SMS_KENNWORT"];
    expect(smsAusUmgebung()).toBeNull();
  });

  it("nimmt SCHULINDEX als Absender, wenn keiner gesetzt ist", () => {
    process.env["SMS_BENUTZER"] = "u";
    process.env["SMS_KENNWORT"] = "p";
    delete process.env["SMS_ABSENDER"];
    expect(smsAusUmgebung()?.absender).toBe("SCHULINDEX");
  });
});
