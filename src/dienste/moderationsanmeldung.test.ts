import { beforeAll, describe, expect, it } from "vitest";
import { melde, type Moderatorkonto, type Zugang } from "./moderationsanmeldung";
import { ANMELDUNG_FEHLGESCHLAGEN, hashePasswort, SPERRE_NACH } from "../domain/anmeldung";
import { erzeugeGeheimnis, SCHRITT_SEKUNDEN, schritt, totp } from "../domain/totp";

beforeAll(() => {
  process.env["SITZUNG_HMAC_SCHLUESSEL"] = Buffer.alloc(32, 3).toString("base64");
});

const PASSWORT = "vier kleine Waschbaeren";
const GEHEIMNIS = erzeugeGeheimnis();
const JETZT = new Date("2026-08-26T09:00:00Z");

let abdruck: string;
beforeAll(async () => {
  abdruck = await hashePasswort(PASSWORT);
}, 20_000);

interface Aufzeichnung {
  readonly protokoll: { aktion: string; moderatorId: string | null; begruendung: string }[];
  readonly fehlversuche: string[];
  readonly anmeldungen: { id: string; schritt: number | null }[];
  readonly sitzungen: { id: string; hash: string }[];
}

function zugangMit(konto: Moderatorkonto | null): { zugang: Zugang; auf: Aufzeichnung } {
  const auf: Aufzeichnung = { protokoll: [], fehlversuche: [], anmeldungen: [], sitzungen: [] };
  const zugang: Zugang = {
    async findeModerator() {
      return konto;
    },
    async merkeFehlversuch(id) {
      auf.fehlversuche.push(id);
    },
    async merkeAnmeldung(id, s) {
      auf.anmeldungen.push({ id, schritt: s });
    },
    async legeSitzungAn(id, hash) {
      auf.sitzungen.push({ id, hash });
    },
    async protokolliere(e) {
      auf.protokoll.push({ aktion: e.aktion, moderatorId: e.moderatorId, begruendung: e.begruendung });
    },
  };
  return { zugang, auf };
}

function konto(abweichung: Partial<Moderatorkonto> = {}): Moderatorkonto {
  return {
    id: "m1",
    kennung: "anna",
    name: "Anna Beispiel",
    passwortAbdruck: abdruck,
    totpGeheimnis: GEHEIMNIS,
    totpLetzterSchritt: null,
    rolle: "moderation",
    aktiv: true,
    fehlversuche: 0,
    letzterFehlversuchAm: null,
    ...abweichung,
  };
}

const richtig = () => ({ kennung: "anna", passwort: PASSWORT, code: totp(GEHEIMNIS, JETZT) });

describe("Ohne zweiten Faktor", () => {
  // Abschaltbar im Panel (Einstellung `zweiter_faktor`). Was dann noch
  // greifen muss: Kennwort, Sperre, Stilllegung - und der gespeicherte
  // TOTP-Schritt darf nicht überschrieben werden.
  const ohne = { zweiterFaktorPflicht: false };

  it("lässt mit Kennwort allein herein", async () => {
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, { kennung: "anna", passwort: PASSWORT, code: "" }, JETZT, ohne);

    expect(ergebnis.ok).toBe(true);
    expect(auf.protokoll[0]?.begruendung).toBe("ohne zweiten Faktor");
  }, 20_000);

  it("rührt den verbrauchten Schritt nicht an", async () => {
    // Sonst gälte ein alter Code nach dem Wiedereinschalten noch einmal.
    const { zugang, auf } = zugangMit(konto({ totpLetzterSchritt: 42 }));
    await melde(zugang, { kennung: "anna", passwort: PASSWORT, code: "" }, JETZT, ohne);
    expect(auf.anmeldungen).toEqual([{ id: "m1", schritt: null }]);
  }, 20_000);

  it("weist ein falsches Kennwort weiterhin ab", async () => {
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, { kennung: "anna", passwort: "falsch", code: "" }, JETZT, ohne);
    expect(ergebnis.ok).toBe(false);
    expect(auf.fehlversuche).toEqual(["m1"]);
  }, 20_000);

  it("lässt ein stillgelegtes Konto nicht herein", async () => {
    const { zugang } = zugangMit(konto({ aktiv: false }));
    const ergebnis = await melde(zugang, { kennung: "anna", passwort: PASSWORT, code: "" }, JETZT, ohne);
    expect(ergebnis.ok).toBe(false);
  }, 20_000);

  it("verlangt den Code, solange nichts anderes gesagt ist", async () => {
    // Die Vorgabe ist an: ein vergessener Eintrag schaltet nichts ab.
    const { zugang } = zugangMit(konto());
    const ergebnis = await melde(zugang, { kennung: "anna", passwort: PASSWORT, code: "" }, JETZT);
    expect(ergebnis.ok).toBe(false);
  }, 20_000);
});

describe("melde", () => {
  it("lässt mit Kennwort und Code herein", async () => {
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, richtig(), JETZT);

    expect(ergebnis.ok).toBe(true);
    expect(auf.sitzungen).toHaveLength(1);
    expect(auf.anmeldungen).toEqual([{ id: "m1", schritt: schritt(JETZT) }]);
    expect(auf.protokoll.map((p) => p.aktion)).toEqual(["anmeldung"]);
    expect(auf.fehlversuche).toEqual([]);
  }, 20_000);

  it("gibt den Sitzungsklartext heraus, speichert aber nur den Hash", async () => {
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, richtig(), JETZT);
    expect(ergebnis.ok && auf.sitzungen[0]?.hash).not.toBe(ergebnis.ok && ergebnis.sitzung.klartext);
  }, 20_000);

  it("weist ein falsches Kennwort ab und zählt den Fehlversuch", async () => {
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, { ...richtig(), passwort: "falsch aber lang genug" }, JETZT);

    expect(ergebnis).toEqual({ ok: false, meldung: ANMELDUNG_FEHLGESCHLAGEN });
    expect(auf.fehlversuche).toEqual(["m1"]);
    expect(auf.protokoll[0]?.begruendung).toBe("Kennwort falsch");
  }, 20_000);

  it("weist einen falschen Code ab und zählt ihn genauso", async () => {
    // Der Punkt: mit richtigem Kennwort darf der sechsstellige Code nicht
    // ungebremst durchprobierbar sein.
    const { zugang, auf } = zugangMit(konto());
    const ergebnis = await melde(zugang, { ...richtig(), code: "000000" }, JETZT);

    expect(ergebnis.ok).toBe(false);
    expect(auf.fehlversuche).toEqual(["m1"]);
    expect(auf.protokoll[0]?.begruendung).toBe("Code falsch");
  }, 20_000);

  it("sagt bei falschem Kennwort und falschem Code dasselbe", async () => {
    const a = await melde(zugangMit(konto()).zugang, { ...richtig(), passwort: "falsch aber lang" }, JETZT);
    const b = await melde(zugangMit(konto()).zugang, { ...richtig(), code: "000000" }, JETZT);
    const c = await melde(zugangMit(null).zugang, richtig(), JETZT);
    expect(new Set([
      a.ok ? "ok" : a.meldung,
      b.ok ? "ok" : b.meldung,
      c.ok ? "ok" : c.meldung,
    ]).size).toBe(1);
  }, 40_000);

  it("rechnet auch bei unbekannter Kennung ein Kennwort durch", async () => {
    // Ohne das verrät die Antwortzeit, welche Kennungen es gibt.
    const { zugang, auf } = zugangMit(null);
    const begonnen = performance.now();
    const ergebnis = await melde(zugang, richtig(), JETZT);
    const gedauert = performance.now() - begonnen;

    expect(ergebnis.ok).toBe(false);
    expect(gedauert).toBeGreaterThan(20);
    expect(auf.protokoll).toEqual([
      { aktion: "anmeldung_fehlgeschlagen", moderatorId: null, begruendung: "Kennung unbekannt" },
    ]);
  }, 20_000);

  it("lässt ein stillgelegtes Konto nicht herein, auch mit richtigen Angaben", async () => {
    const { zugang, auf } = zugangMit(konto({ aktiv: false }));
    const ergebnis = await melde(zugang, richtig(), JETZT);
    expect(ergebnis.ok).toBe(false);
    expect(auf.protokoll[0]?.begruendung).toBe("Konto stillgelegt");
  }, 20_000);

  it("lässt ein Konto ohne zweiten Faktor nicht herein", async () => {
    const { zugang, auf } = zugangMit(konto({ totpGeheimnis: null }));
    const ergebnis = await melde(zugang, richtig(), JETZT);
    expect(ergebnis.ok).toBe(false);
    expect(auf.protokoll[0]?.begruendung).toBe("Kein zweiter Faktor eingerichtet");
    expect(auf.sitzungen).toEqual([]);
  }, 20_000);

  it("hält ein gesperrtes Konto auf, ohne das Kennwort zu prüfen", async () => {
    const { zugang, auf } = zugangMit(
      konto({ fehlversuche: SPERRE_NACH, letzterFehlversuchAm: new Date(JETZT.getTime() - 60_000) }),
    );
    const ergebnis = await melde(zugang, richtig(), JETZT);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok === false && ergebnis.meldung).toMatch(/^Zu viele Fehlversuche/);
    // Kein weiterer Fehlversuch: sonst verlängerte jeder Versuch die Sperre
    // endlos, und wer ein Konto lahmlegen will, müsste nur weiterklicken.
    expect(auf.fehlversuche).toEqual([]);
  }, 20_000);

  it("lässt nach abgelaufener Sperre wieder herein", async () => {
    const { zugang } = zugangMit(
      konto({ fehlversuche: 99, letzterFehlversuchAm: new Date(JETZT.getTime() - 60 * 60_000) }),
    );
    expect((await melde(zugang, richtig(), JETZT)).ok).toBe(true);
  }, 20_000);

  it("nimmt denselben Code kein zweites Mal", async () => {
    const code = totp(GEHEIMNIS, JETZT);
    const { zugang } = zugangMit(konto({ totpLetzterSchritt: schritt(JETZT) }));
    const ergebnis = await melde(zugang, { kennung: "anna", passwort: PASSWORT, code }, JETZT);
    expect(ergebnis.ok).toBe(false);
  }, 20_000);

  it("nimmt den nächsten Code danach an", async () => {
    const später = new Date(JETZT.getTime() + SCHRITT_SEKUNDEN * 1000);
    const { zugang } = zugangMit(konto({ totpLetzterSchritt: schritt(JETZT) }));
    const ergebnis = await melde(
      zugang,
      { kennung: "anna", passwort: PASSWORT, code: totp(GEHEIMNIS, später) },
      später,
    );
    expect(ergebnis.ok).toBe(true);
  }, 20_000);

  it("protokolliert nie das vorgelegte Kennwort oder den Code", async () => {
    const { zugang, auf } = zugangMit(konto());
    await melde(zugang, { kennung: "anna", passwort: PASSWORT, code: "000000" }, JETZT);
    const alles = JSON.stringify(auf.protokoll);
    expect(alles).not.toContain(PASSWORT);
    expect(alles).not.toContain("000000");
  }, 20_000);
});
