import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  GUELTIG_STUNDEN,
  MAX_ERNEUT_SENDEN,
  PRUEFUNG_HINWEIS,
  erzeugeToken,
  hashe,
  pruefeToken,
} from "./verifizierung";

beforeAll(() => {
  process.env["TOKEN_HMAC_SCHLUESSEL"] = randomBytes(32).toString("base64");
});

const JETZT = new Date("2026-08-26T10:00:00Z");
const spaeter = (stunden: number) => new Date(JETZT.getTime() + stunden * 3600_000);

describe("Token erzeugen", () => {
  it("gibt Klartext und Hash getrennt zurück", () => {
    const t = erzeugeToken(JETZT);
    expect(t.klartext).not.toBe(t.hash);
    expect(t.hash).toBe(hashe(t.klartext));
  });

  it("erzeugt nie zweimal dasselbe", () => {
    const viele = new Set(Array.from({ length: 200 }, () => erzeugeToken(JETZT).klartext));
    expect(viele.size).toBe(200);
  });

  it("bleibt kurz genug für eine SMS", () => {
    // Base64url über 32 Byte: 43 Zeichen. Mit Link und Text bleibt Luft unter 160.
    expect(erzeugeToken(JETZT).klartext.length).toBeLessThanOrEqual(43);
    expect(erzeugeToken(JETZT).klartext).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("gilt 24 Stunden", () => {
    expect(erzeugeToken(JETZT).gueltigBis.getTime()).toBe(spaeter(GUELTIG_STUNDEN).getTime());
  });
});

describe("Token prüfen", () => {
  const gespeichert = (t: ReturnType<typeof erzeugeToken>, verbrauchtAm: Date | null = null) => ({
    hash: t.hash,
    gueltigBis: t.gueltigBis,
    verbrauchtAm,
  });

  it("nimmt ein gültiges Token an", () => {
    const t = erzeugeToken(JETZT);
    expect(pruefeToken(t.klartext, gespeichert(t), spaeter(1))).toEqual({ ok: true });
  });

  it("weist ein fremdes Token ab", () => {
    const t = erzeugeToken(JETZT);
    const fremd = erzeugeToken(JETZT);
    expect(pruefeToken(fremd.klartext, gespeichert(t), spaeter(1))).toEqual({
      ok: false,
      grund: "unbekannt",
    });
  });

  it("weist ein abgelaufenes Token ab", () => {
    const t = erzeugeToken(JETZT);
    expect(pruefeToken(t.klartext, gespeichert(t), spaeter(GUELTIG_STUNDEN + 1))).toEqual({
      ok: false,
      grund: "abgelaufen",
    });
  });

  it("lässt genau auf die Sekunde nicht mehr durch", () => {
    const t = erzeugeToken(JETZT);
    expect(pruefeToken(t.klartext, gespeichert(t), t.gueltigBis).ok).toBe(false);
  });

  it("weist ein bereits verbrauchtes Token ab", () => {
    // Sonst ließe sich derselbe Link mehrfach einlösen.
    const t = erzeugeToken(JETZT);
    expect(pruefeToken(t.klartext, gespeichert(t, spaeter(1)), spaeter(2))).toEqual({
      ok: false,
      grund: "verbraucht",
    });
  });

  it("behandelt ein unbekanntes Token wie gar keines", () => {
    expect(pruefeToken("irgendwas", null, JETZT)).toEqual({ ok: false, grund: "unbekannt" });
  });

  it("prüft den Hash vor Ablauf und Verbrauch", () => {
    // Andersherum verriete die Meldung, ob zu einem Konto überhaupt eine
    // Bestätigung offen ist.
    const t = erzeugeToken(JETZT);
    const abgelaufenUndFremd = pruefeToken("fremd", gespeichert(t), spaeter(GUELTIG_STUNDEN + 1));
    expect(abgelaufenUndFremd).toEqual({ ok: false, grund: "unbekannt" });
  });
});

describe("Hinweistexte", () => {
  it("sagen bei „unbekannt“ und „verbraucht“ dasselbe", () => {
    // Wer einen fremden Link ausprobiert, soll nicht erfahren, ob es ihn gibt.
    expect(PRUEFUNG_HINWEIS.unbekannt).toBe(PRUEFUNG_HINWEIS.verbraucht);
  });

  it("nennen beim Ablauf die Frist", () => {
    expect(PRUEFUNG_HINWEIS.abgelaufen).toContain(String(GUELTIG_STUNDEN));
  });

  it("begrenzen das erneute Senden", () => {
    expect(MAX_ERNEUT_SENDEN).toBe(3);
  });
});
