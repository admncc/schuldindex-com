import { describe, expect, it } from "vitest";
import { entscheideWeg, host, istEmail, wegtext, type Schulkontakt } from "./schulzugang";

/** Auskunft für Tests: alles, was nicht genannt ist, gehört genau einer Schule. */
function auskunft(geteilt: Record<string, number> = {}) {
  return (h: string) => ({ schulen: geteilt[h] ?? 1 });
}

describe("host", () => {
  it("liest den Host aus einer Adresse", () => {
    expect(host("poststelle@04129847.schule.bwl.de")).toBe("04129847.schule.bwl.de");
    expect(host("Sekretariat@Schule-Beispiel.DE")).toBe("schule-beispiel.de");
  });

  it("liest den Host aus einer Web-Adresse", () => {
    expect(host("https://www.schule-beispiel.de/kontakt")).toBe("schule-beispiel.de");
    expect(host("http://schule-beispiel.de")).toBe("schule-beispiel.de");
    expect(host("www.schule-beispiel.de/")).toBe("schule-beispiel.de");
    expect(host("schule-beispiel.de:8080/x")).toBe("schule-beispiel.de");
  });

  it("kommt mit Umlautdomänen zurecht", () => {
    expect(host("info@grundschule-müller.de")).toBe("grundschule-müller.de");
  });

  it("gibt bei Unbrauchbarem null", () => {
    for (const müll of [null, "", "   ", "kein host", "localhost", "@", "http://"]) {
      expect(host(müll), String(müll)).toBeNull();
    }
  });
});

describe("istEmail", () => {
  it("erkennt Adressen und weist anderes ab", () => {
    expect(istEmail("info@schule.de")).toBe(true);
    expect(istEmail("info@schule")).toBe(false);
    expect(istEmail("schule.de")).toBe(false);
    expect(istEmail("")).toBe(false);
  });
});

describe("entscheideWeg", () => {
  const mitAmtlicher: Schulkontakt = {
    email: "123456@schule.nrw.de",
    website: "https://www.gymnasium-beispiel.de",
  };

  it("nimmt die hinterlegte Adresse, wenn es eine gibt", () => {
    const e = entscheideWeg(mitAmtlicher, null, auskunft());
    expect(e.weg).toBe("amtliche_adresse");
    expect(e.ziel).toBe("123456@schule.nrw.de");
  });

  it("nimmt die hinterlegte Adresse auch dann, wenn eine andere vorgeschlagen wird", () => {
    // Sonst könnte jemand mit einer Adresse an der Schuldomäne den stärkeren
    // Nachweis umgehen - und die Wahl läge bei ihm statt bei uns.
    const e = entscheideWeg(mitAmtlicher, "irgendwer@gymnasium-beispiel.de", auskunft());
    expect(e.weg).toBe("amtliche_adresse");
    expect(e.ziel).toBe("123456@schule.nrw.de");
  });

  it("nimmt die hinterlegte Adresse auch bei geteiltem Host", () => {
    // Der Host schule.nrw.de gehört 5.447 Schulen - für diesen Weg macht das
    // nichts: die Adresse ist der Briefkasten genau dieser Schule, und wir
    // schicken hin, statt sie uns nennen zu lassen.
    const e = entscheideWeg(mitAmtlicher, null, auskunft({ "schule.nrw.de": 5447 }));
    expect(e.weg).toBe("amtliche_adresse");
  });

  it("übergeht eine unbrauchbare hinterlegte Adresse", () => {
    const schule: Schulkontakt = { email: "kaputt", website: "https://schule-beispiel.de" };
    const e = entscheideWeg(schule, "info@schule-beispiel.de", auskunft());
    expect(e.weg).toBe("eigener_host");
  });
});

describe("entscheideWeg - ohne hinterlegte Adresse", () => {
  const nurWebsite: Schulkontakt = { email: null, website: "https://www.schule-beispiel.de" };

  it("nimmt eine Adresse an der Schuldomäne, wenn der Host nur dieser Schule gehört", () => {
    const e = entscheideWeg(nurWebsite, "sekretariat@schule-beispiel.de", auskunft());
    expect(e.weg).toBe("eigener_host");
    expect(e.ziel).toBe("sekretariat@schule-beispiel.de");
  });

  it("übergeht www. beim Vergleich", () => {
    const e = entscheideWeg(nurWebsite, "info@www.schule-beispiel.de", auskunft());
    expect(e.weg).toBe("eigener_host");
  });

  it("weist einen Host ab, den mehrere Schulen benutzen", () => {
    // Der eigentliche Fund: t-online.de steht bei 805 Schulen im Verzeichnis.
    // Ohne diese Prüfung bekäme jeder T-Online-Kunde Zugriff auf 805 Schulen.
    const freemailer: Schulkontakt = { email: null, website: "http://t-online.de/schule" };
    const e = entscheideWeg(freemailer, "wer-auch-immer@t-online.de", auskunft({ "t-online.de": 805 }));
    expect(e.weg).toBe("pruefung");
    expect(e.ziel).toBeNull();
    expect(e.begruendung).toContain("mehreren Schulen");
  });

  it("weist eine Adresse an einer fremden Domäne ab", () => {
    const e = entscheideWeg(nurWebsite, "ich@andere-domain.de", auskunft());
    expect(e.weg).toBe("pruefung");
    expect(e.ziel).toBeNull();
  });

  it("schickt ohne jede Angabe niemandem etwas", () => {
    const leer: Schulkontakt = { email: null, website: null };
    const e = entscheideWeg(leer, "ich@irgendwo.de", auskunft());
    expect(e.weg).toBe("pruefung");
    expect(e.ziel).toBeNull();
  });

  it("weist eine unbrauchbare Eingabe ab", () => {
    expect(entscheideWeg(nurWebsite, "keine adresse", auskunft()).weg).toBe("pruefung");
    expect(entscheideWeg(nurWebsite, null, auskunft()).weg).toBe("pruefung");
  });

  it("gibt bei jedem Weg ein Ziel oder ausdrücklich keines", () => {
    const faelle = [
      entscheideWeg({ email: "a@b.de", website: null }, null, auskunft()),
      entscheideWeg(nurWebsite, "x@schule-beispiel.de", auskunft()),
      entscheideWeg({ email: null, website: null }, null, auskunft()),
    ];
    for (const f of faelle) {
      expect(f.weg === "pruefung" ? f.ziel === null : f.ziel !== null, f.weg).toBe(true);
    }
  });
});

describe("wegtext", () => {
  it("nennt die hinterlegte Adresse nicht", () => {
    // Sonst wäre das Zugangsformular ein Adressabruf für beliebige Schulen.
    const e = entscheideWeg({ email: "geheim@schule.nrw.de", website: null }, null, auskunft());
    expect(wegtext(e)).not.toContain("geheim");
    expect(wegtext(e)).not.toContain("@");
  });

  it("sagt bei der Handprüfung, dass nichts hinausgeht", () => {
    const e = entscheideWeg({ email: null, website: null }, null, auskunft());
    expect(wegtext(e)).toMatch(/von Hand/);
  });
});
