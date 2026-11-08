import { afterEach, describe, expect, it } from "vitest";
import {
  istVersandnummer,
  leseAntwort,
  ohneSchluessel,
  smsAusUmgebung,
  smsweg,
  type Smseinstellungen,
} from "./sms";

const SCHLUESSEL = "40af5a21-4fe4-42e3-a180-000000000000";
const E: Smseinstellungen = { schluessel: SCHLUESSEL, absender: "SCHULINDEX" };

describe("istVersandnummer", () => {
  it("nimmt die internationale Form an", () => {
    expect(istVersandnummer("+491701717179")).toBe(true);
    expect(istVersandnummer(" +436641234567 ")).toBe(true);
  });

  it("biegt nichts zurecht, was keine ist", () => {
    // Eine falsch geratene Nummer geht an einen Fremden, und der bekommt dann
    // einen Code, der ihn nichts angeht.
    for (const n of ["01701717179", "491701717179", "+0491701717179", "+49170", "", "+49 170 1717179"]) {
      expect(istVersandnummer(n)).toBe(false);
    }
  });
});

describe("leseAntwort", () => {
  it("erkennt die Einlieferung an message-status", () => {
    const koerper = '{"message-count":"1","message-status":"OK","message-id":"44ca4150-7382"}';
    expect(leseAntwort(200, koerper)).toEqual({ ok: true, kennung: "44ca4150-7382" });
  });

  /**
   * **Ein 2xx allein genügt nicht.** Die Schnittstelle kann mit Status 200
   * antworten und im Körper etwas anderes als `OK` melden - wer nur den
   * Statuscode prüft, hält das für eine Zustellung.
   */
  it("hält ein 2xx ohne OK für einen Fehler", () => {
    expect(leseAntwort(200, '{"message-status":"REJECTED"}')).toMatchObject({ ok: false });
    expect(leseAntwort(200, "kein JSON")).toMatchObject({ ok: false });
    expect(leseAntwort(200, "")).toMatchObject({ ok: false });
  });

  it("benennt die Fehlercodes", () => {
    expect(leseAntwort(401, "{}")).toEqual({ ok: false, grund: "401 - API-Key falsch oder abgelaufen" });
    expect(leseAntwort(403, "{}")).toMatchObject({ ok: false });
    expect(leseAntwort(400, '{"from":["can\'t be blank"]}')).toMatchObject({ ok: false });
    expect(leseAntwort(500, "{}")).toMatchObject({ ok: false });
  });
});

describe("ohneSchluessel", () => {
  /**
   * GTX nimmt den Schlüssel im **Pfad** der Adresse entgegen. Fehlermeldungen
   * von `fetch` enthalten die angefragte Adresse, und der Grund geht ins
   * Ereignisprotokoll - ohne diese Filterung stünde dort der Zugang zum
   * SMS-Konto.
   */
  it("nimmt den Schlüssel aus einer Fehlermeldung", () => {
    const roh = `request to https://rest.gtx-messaging.net/smsc/sendsms/${SCHLUESSEL}/json failed`;
    expect(ohneSchluessel(roh, SCHLUESSEL)).not.toContain(SCHLUESSEL);
    expect(ohneSchluessel(roh, SCHLUESSEL)).toContain("<schluessel>");
  });
});

describe("smsweg", () => {
  it("schickt Nummer mit Plus, Absender und Text an die REST-Adresse", async () => {
    let adresse = "";
    let felder: URLSearchParams | null = null;
    const weg = smsweg(E, async (a, f) => {
      adresse = a;
      felder = f;
      return { status: 200, koerper: '{"message-status":"OK","message-id":"x"}' };
    });

    const ergebnis = await weg.sende({
      empfaenger: "+491701717179",
      betreff: "",
      text: "SCHULINDEX: Dein Code lautet 043912.",
    });

    expect(ergebnis).toEqual({ ok: true, weg: "sms" });
    expect(adresse).toContain("rest.gtx-messaging.net/smsc/sendsms/");
    expect(adresse).toContain("/json");
    expect(felder!.get("to")).toBe("+491701717179");
    expect(felder!.get("from")).toBe("SCHULINDEX");
    expect(felder!.get("text")).toContain("043912");
  });

  it("trägt weder Code noch Schlüssel in den Fehlergrund", async () => {
    const weg = smsweg(E, async () => {
      throw new Error(`connect failed: https://rest.gtx-messaging.net/smsc/sendsms/${SCHLUESSEL}/json`);
    });
    const ergebnis = await weg.sende({ empfaenger: "+491701717179", betreff: "", text: "Code 043912" });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.grund).not.toContain("043912");
      expect(ergebnis.grund).not.toContain(SCHLUESSEL);
    }
  });

  it("wirft nicht, wenn das Netz wegbricht - die Kette soll weiterlaufen", async () => {
    const weg = smsweg(E, async () => {
      throw new Error("timeout");
    });
    expect((await weg.sende({ empfaenger: "+491701717179", betreff: "", text: "x" })).ok).toBe(false);
  });

  it("fühlt sich nur für Telefonnummern zuständig", () => {
    const weg = smsweg(E, async () => ({ status: 200, koerper: '{"message-status":"OK"}' }));
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

  it("braucht den API-Key", () => {
    delete process.env["SMS_API_KEY"];
    expect(smsAusUmgebung()).toBeNull();
  });

  it("nimmt SCHULINDEX als Absender, wenn keiner gesetzt ist", () => {
    process.env["SMS_API_KEY"] = SCHLUESSEL;
    delete process.env["SMS_ABSENDER"];
    expect(smsAusUmgebung()).toEqual({ schluessel: SCHLUESSEL, absender: "SCHULINDEX" });
  });
});
