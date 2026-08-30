import { beforeAll, describe, expect, it } from "vitest";
import {
  erzeugeStempel,
  pruefeStempel,
  STEMPEL_STUNDEN,
  stempelText,
} from "./formularstempel";

beforeAll(() => {
  process.env["TOKEN_HMAC_SCHLUESSEL"] = Buffer.alloc(32, 11).toString("base64");
});

const SCHULE = "gymnasium-finkenwerder";
const JETZT = new Date("2026-08-27T12:00:00Z");
const spaeter = (sekunden: number) => new Date(JETZT.getTime() + sekunden * 1000);

describe("Formularstempel", () => {
  it("misst die Dauer auf der Uhr des Servers", () => {
    const s = stempelText(erzeugeStempel(SCHULE, JETZT));
    const e = pruefeStempel(s, SCHULE, spaeter(180));
    expect(e).toEqual({ ok: true, dauerSekunden: 180 });
  });

  it("lässt sich nicht vordatieren", () => {
    // Der Kern der Sache: Wer den Fragebogen in zwei Sekunden ausfüllt, kann
    // keinen Stempel bauen, der zehn Minuten alt aussieht.
    const echt = erzeugeStempel(SCHULE, JETZT);
    const gefaelscht = `${echt.ausgestellt - 600}.${echt.signatur}`;
    expect(pruefeStempel(gefaelscht, SCHULE, spaeter(2)).ok).toBe(false);
  });

  it("weist eine erfundene Signatur ab", () => {
    const s = erzeugeStempel(SCHULE, JETZT);
    expect(pruefeStempel(`${s.ausgestellt}.abcdef`, SCHULE, spaeter(60)).ok).toBe(false);
  });

  it("weist Unfug ab, statt zu werfen", () => {
    for (const müll of ["", ".", "abc", "123", "123.", ".sig", "nan.sig"]) {
      expect(pruefeStempel(müll, SCHULE, JETZT).ok, müll).toBe(false);
    }
  });

  it("läuft nach der Frist ab", () => {
    const s = stempelText(erzeugeStempel(SCHULE, JETZT));
    expect(pruefeStempel(s, SCHULE, spaeter(STEMPEL_STUNDEN * 3600 - 1)).ok).toBe(true);
    const abgelaufen = pruefeStempel(s, SCHULE, spaeter(STEMPEL_STUNDEN * 3600 + 1));
    expect(abgelaufen.ok).toBe(false);
    expect(abgelaufen.ok === false && abgelaufen.grund).toBe("abgelaufen");
  });

  it("wertet einen Stempel aus der Zukunft nicht als besonders schnell", () => {
    // Nach einer Zeitumstellung oder bei auseinanderlaufenden Serveruhren kommt
    // das vor. Eine negative Dauer als „sehr schnell“ zu werten hieße, alle
    // Abgaben dieser Minute zu verdächtigen.
    const s = stempelText(erzeugeStempel(SCHULE, spaeter(60)));
    const e = pruefeStempel(s, SCHULE, JETZT);
    expect(e.ok).toBe(false);
    expect(e.ok === false && e.grund).toBe("aus_der_zukunft");
  });

  it("erzeugt für verschiedene Zeitpunkte verschiedene Signaturen", () => {
    expect(erzeugeStempel(SCHULE, JETZT).signatur).not.toBe(erzeugeStempel(SCHULE, spaeter(1)).signatur);
  });
});

describe("Bindung an die Schule", () => {
  it("gilt nicht für eine andere Schule", () => {
    // Ohne die Bindung war ein einmal geholter Stempel zwei Stunden lang für
    // jede Schule gültig - einmal ein Formular öffnen, danach beliebig viele
    // Abgaben überall.
    const s = stempelText(erzeugeStempel(SCHULE, JETZT));
    expect(pruefeStempel(s, SCHULE, spaeter(60)).ok).toBe(true);
    expect(pruefeStempel(s, "andere-schule", spaeter(60)).ok).toBe(false);
  });
});
