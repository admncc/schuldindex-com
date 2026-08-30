import { beforeAll, describe, expect, it } from "vitest";
import { fordereAnmeldelinkAn, type Kontoumgebung } from "./kontozugang";
import {
  ANMELDELINK_STUNDEN,
  hasheKontotoken,
  kontocookie,
  KONTOCOOKIE_NAMEN,
  LINKS_JE_STUNDE,
  LINK_ANGEFORDERT,
  erzeugeAnmeldelink,
  erzeugeKontositzung,
} from "../domain/kontozugang";

beforeAll(() => {
  process.env["SITZUNG_HMAC_SCHLUESSEL"] = Buffer.alloc(32, 9).toString("base64");
  process.env["KONTAKT_HMAC_SCHLUESSEL"] = Buffer.alloc(32, 5).toString("base64");
});

interface Aufzeichnung {
  gespeichert: string[];
  gesendet: string[];
}

function umgebung(
  konto: { id: string; verifiziertAm: Date | null } | null,
  links = 0,
  versandKlappt = true,
): { u: Kontoumgebung; auf: Aufzeichnung } {
  const auf: Aufzeichnung = { gespeichert: [], gesendet: [] };
  return {
    auf,
    u: {
      async findeKonto() {
        return konto;
      },
      async zaehleLinks() {
        return links;
      },
      async speichereAnmeldelink(id, token) {
        auf.gespeichert.push(`${id}:${token.hash}`);
      },
      async sendeAnmeldelink(id, klartext) {
        auf.gesendet.push(`${id}:${klartext}`);
        return versandKlappt;
      },
    },
  };
}

const BESTEHT = { id: "k1", verifiziertAm: new Date("2026-01-01") };

describe("fordereAnmeldelinkAn", () => {
  it("verschickt einen Link an ein bestätigtes Konto", async () => {
    const { u, auf } = umgebung(BESTEHT);
    const e = await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" });

    expect(e.intern).toBe("verschickt");
    expect(auf.gespeichert).toHaveLength(1);
    expect(auf.gesendet).toHaveLength(1);
  });

  it("speichert nur den Hash, verschickt nur den Klartext", async () => {
    const { u, auf } = umgebung(BESTEHT);
    await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" });

    const klartext = auf.gesendet[0]!.split(":")[1]!;
    const hash = auf.gespeichert[0]!.split(":")[1]!;
    expect(hash).not.toBe(klartext);
    expect(hasheKontotoken(klartext, "anmeldung")).toBe(hash);
  });

  it("antwortet gleich, ob es das Konto gibt oder nicht", async () => {
    // Der Punkt der ganzen Übung: sonst wird aus dem Anmeldeformular eine
    // Auskunft darüber, welche Handynummer schon einmal bewertet hat.
    const mit = await fordereAnmeldelinkAn(umgebung(BESTEHT).u, { kontakt: "0170 1234567", art: "sms" });
    const ohne = await fordereAnmeldelinkAn(umgebung(null).u, { kontakt: "0170 7654321", art: "sms" });

    expect(mit.meldung).toBe(LINK_ANGEFORDERT);
    expect(ohne.meldung).toBe(LINK_ANGEFORDERT);
    expect(mit.meldung).toBe(ohne.meldung);
  });

  it("schickt an ein unbestätigtes Konto keinen Link - sagt es aber nicht", async () => {
    const { u, auf } = umgebung({ id: "k2", verifiziertAm: null });
    const e = await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" });

    expect(e.intern).toBe("unbestaetigt");
    expect(e.meldung).toBe(LINK_ANGEFORDERT);
    expect(auf.gesendet).toEqual([]);
  });

  it("begrenzt die Zahl der Links je Stunde", async () => {
    const { u, auf } = umgebung(BESTEHT, LINKS_JE_STUNDE);
    const e = await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" });

    expect(e.intern).toBe("begrenzt");
    // Nach außen ununterscheidbar von jedem anderen Ausgang - sonst wäre die
    // Meldung ein Existenzorakel für die Nummer.
    expect(e.meldung).toBe(LINK_ANGEFORDERT);
    expect(auf.gesendet).toEqual([]);
  });

  it("lässt den vorletzten Versuch noch durch", async () => {
    const { u } = umgebung(BESTEHT, LINKS_JE_STUNDE - 1);
    expect((await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" })).intern).toBe("verschickt");
  });

  it("meldet einen fehlgeschlagenen Versand intern, nach außen aber nicht", async () => {
    const { u } = umgebung(BESTEHT, 0, false);
    const e = await fordereAnmeldelinkAn(u, { kontakt: "0170 1234567", art: "sms" });
    expect(e.intern).toBe("versand_fehlgeschlagen");
    expect(e.meldung).toBe(LINK_ANGEFORDERT);
  });

  it("fragt bei leerer Eingabe gar nicht erst die Datenbank", async () => {
    const { u, auf } = umgebung(BESTEHT);
    const e = await fordereAnmeldelinkAn(u, { kontakt: "   ", art: "sms" });
    expect(e.intern).toBe("kein_konto");
    expect(auf.gespeichert).toEqual([]);
  });
});

describe("Token und Cookie", () => {
  it("trennt Anmeldelink und Sitzung, obwohl beide denselben Schlüssel nutzen", () => {
    // Ohne den Zweck im Hash ginge ein Anmeldelink als Sitzungstoken durch -
    // und damit ein zwei Stunden gültiges Geheimnis als dreißigtägiges.
    const klartext = "beliebiger-klartext";
    expect(hasheKontotoken(klartext, "anmeldung")).not.toBe(hasheKontotoken(klartext, "sitzung"));
  });

  it("gibt dem Anmeldelink die kurze und der Sitzung die lange Frist", () => {
    const jetzt = new Date("2026-08-26T12:00:00Z");
    const link = erzeugeAnmeldelink(jetzt);
    const sitzung = erzeugeKontositzung(jetzt);

    expect(link.gueltigBis.getTime()).toBe(jetzt.getTime() + ANMELDELINK_STUNDEN * 3600_000);
    expect(sitzung.gueltigBis.getTime()).toBeGreaterThan(link.gueltigBis.getTime());
  });

  it("erzeugt keine zwei gleichen Token", () => {
    const menge = new Set(Array.from({ length: 200 }, () => erzeugeAnmeldelink().klartext));
    expect(menge.size).toBe(200);
  });

  it("trägt das __Host-Präfix nur dort, wo Secure gesetzt wird", () => {
    expect(kontocookie(true)).toBe("__Host-schulindex_konto");
    expect(kontocookie(false)).toBe("schulindex_konto");
    expect(KONTOCOOKIE_NAMEN).toContain(kontocookie(true));
    expect(KONTOCOOKIE_NAMEN).toContain(kontocookie(false));
  });

  it("verwechselt das Kontocookie nicht mit dem der Moderation", () => {
    expect(KONTOCOOKIE_NAMEN.some((n) => n.includes("moderation"))).toBe(false);
  });
});
