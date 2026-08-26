import { describe, expect, it } from "vitest";
import { kennung, kuerze, slugKandidaten, slugify, vergebeSlugs } from "./slug";

describe("slugify", () => {
  it("schreibt Umlaute aus, statt sie zu verschlucken", () => {
    // „grunewald“ wäre ein anderer Ort, „grnewald“ unlesbar.
    expect(slugify("Grünewald")).toBe("gruenewald");
    expect(slugify("Gymnasium am Mühlenweg")).toBe("gymnasium-am-muehlenweg");
    expect(slugify("Käthe-Kollwitz-Schule")).toBe("kaethe-kollwitz-schule");
    expect(slugify("Straße der Jugend")).toBe("strasse-der-jugend");
    expect(slugify("Öjendorfer Damm")).toBe("oejendorfer-damm");
  });

  it("behandelt dänische und friesische Namen aus dem Norden", () => {
    // Schleswig-Holstein führt Schulen der dänischen Minderheit.
    expect(slugify("Husum Danske Skole")).toBe("husum-danske-skole");
    expect(slugify("Ånd og Håndværk")).toBe("aand-og-haandvaerk");
  });

  it("räumt Satzzeichen und Mehrfachtrenner auf", () => {
    expect(slugify("Grundschule „Am See“ / Außenstelle")).toBe("grundschule-am-see-aussenstelle");
    expect(slugify("Marschenschool an’t Wattenmeer")).toBe("marschenschool-an-t-wattenmeer");
    expect(slugify("  --Test--  ")).toBe("test");
  });

  it("liefert für leere Eingaben eine leere Zeichenkette", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("Kennung", () => {
  it("ist für dieselbe Quell-ID immer gleich", () => {
    expect(kennung("NI-43424")).toBe(kennung("NI-43424"));
  });

  it("unterscheidet verschiedene Quell-IDs", () => {
    expect(kennung("NI-43424")).not.toBe(kennung("NI-43425"));
  });

  it("bleibt kurz und URL-tauglich", () => {
    for (const id of ["NI-43424", "BW-1", "TH-11293", "SH-9099840"]) {
      expect(kennung(id)).toMatch(/^[a-z0-9]{1,4}$/);
    }
  });
});

describe("Slug-Kandidaten", () => {
  const quelle = {
    name: "Grundschule Nordholz",
    ort: "Wurster Nordseeküste",
    plz: "27639",
    quellId: "NI-43424",
  };

  it("beginnt mit der kürzesten lesbaren Form", () => {
    expect(slugKandidaten(quelle)[0]).toBe("grundschule-nordholz");
  });

  it("ergänzt Ort und PLZ erst bei Bedarf", () => {
    expect(slugKandidaten(quelle).slice(0, 3)).toEqual([
      "grundschule-nordholz",
      "grundschule-nordholz-wurster-nordseekueste",
      "grundschule-nordholz-wurster-nordseekueste-27639",
    ]);
  });

  it("wiederholt den Ort nicht, wenn er schon im Namen steht", () => {
    // „Grundschule Nordholz“ in Nordholz soll nicht
    // „grundschule-nordholz-nordholz“ werden.
    const kandidaten = slugKandidaten({ ...quelle, ort: "Nordholz" });
    expect(kandidaten[1]).toBe("grundschule-nordholz-27639");
  });

  it("fällt bei namenlosen Datensätzen auf „schule“ zurück", () => {
    expect(slugKandidaten({ ...quelle, name: "???" })[0]).toBe("schule");
  });
});

describe("Länge", () => {
  it("kürzt an der Wortgrenze statt mitten im Wort", () => {
    const lang = "staatliche-gemeinschaftsschule-am-alten-postweg-in-der-gemeinde-nordwestuckermark";
    const gekuerzt = kuerze(lang, 40);
    expect(gekuerzt.length).toBeLessThanOrEqual(40);
    expect(gekuerzt.endsWith("-")).toBe(false);
    expect(lang.startsWith(gekuerzt)).toBe(true);
  });

  it("lässt kurze Slugs unangetastet", () => {
    expect(kuerze("grundschule-nord", 72)).toBe("grundschule-nord");
  });
});

describe("Slug-Vergabe", () => {
  const kiel = { name: "Grundschule Nord", ort: "Kiel", plz: "24103", quellId: "SH-1" };
  const luebeck = { name: "Grundschule Nord", ort: "Lübeck", plz: "23552", quellId: "SH-2" };

  it("gibt eine eindeutige Kurzform an die Schule, die sie allein beansprucht", () => {
    const slugs = vergebeSlugs([{ name: "Gymnasium am Mühlenweg", ort: "Hamburg", plz: "22045", quellId: "HH-1" }]);
    expect(slugs.get("HH-1")).toBe("gymnasium-am-muehlenweg");
  });

  it("gibt eine mehrdeutige Kurzform an niemanden", () => {
    // Der Kern des Verfahrens: „grundschule-nord“ bleibt frei, beide Schulen
    // bekommen die aussagekräftigere Form mit Ort.
    const slugs = vergebeSlugs([kiel, luebeck]);
    expect(slugs.get("SH-1")).toBe("grundschule-nord-kiel");
    expect(slugs.get("SH-2")).toBe("grundschule-nord-luebeck");
    expect([...slugs.values()]).not.toContain("grundschule-nord");
  });

  it("bleibt auch bei gleichem Namen im gleichen Ort eindeutig", () => {
    const eingabe = { name: "Grundschule Nord", ort: "Kiel", plz: "24103" };
    const slugs = vergebeSlugs([
      { ...eingabe, quellId: "SH-1" },
      { ...eingabe, quellId: "SH-2" },
      { ...eingabe, quellId: "SH-3" },
    ]);
    expect(new Set(slugs.values()).size).toBe(3);
  });

  it("liefert dasselbe Ergebnis, egal in welcher Reihenfolge die Quelle liefert", () => {
    // Der wichtigste Test dieser Datei. Ein Slug steht in URLs und in
    // Suchmaschinen — ändert er sich beim nächsten Import, brechen alle
    // geteilten Links. Ein Verfahren nach „wer zuerst kommt“ scheitert hier.
    const menge = [kiel, luebeck, { name: "Grundschule Nord", ort: "Kiel", plz: "24106", quellId: "SH-3" }];
    const vorwaerts = vergebeSlugs(menge);
    const rueckwaerts = vergebeSlugs([...menge].reverse());
    for (const { quellId } of menge) {
      expect(rueckwaerts.get(quellId), quellId).toBe(vorwaerts.get(quellId));
    }
  });

  it("lässt bestehende Slugs unberührt, wenn eine neue Schule dazukommt", () => {
    // Beim monatlichen Re-Import kommen Schulen hinzu. Sie dürfen bestehenden
    // Schulen ihren Slug nicht wegnehmen.
    const vorher = vergebeSlugs([kiel, luebeck]);
    const nachher = vergebeSlugs([kiel, luebeck, { name: "Grundschule Süd", ort: "Kiel", plz: "24103", quellId: "SH-9" }]);
    expect(nachher.get("SH-1")).toBe(vorher.get("SH-1"));
    expect(nachher.get("SH-2")).toBe(vorher.get("SH-2"));
  });

  it("vergibt für jede Quell-ID genau einen Slug", () => {
    const slugs = vergebeSlugs([kiel, luebeck]);
    expect(slugs.size).toBe(2);
  });
});