import { describe, expect, it } from "vitest";
import { beiwerk, zerlegeNachTreffer } from "./suchhervorhebung";

describe("zerlegeNachTreffer", () => {
  it("markiert die Fundstelle mitten im Namen", () => {
    expect(zerlegeNachTreffer("Städtisches Gymnasium Nord", "gymn")).toEqual([
      { text: "Städtisches ", treffer: false },
      { text: "Gymn", treffer: true },
      { text: "asium Nord", treffer: false },
    ]);
  });

  it("markiert einen Treffer am Anfang ohne leeres Vorstück", () => {
    expect(zerlegeNachTreffer("Gymnasium Nord", "gymnasium")).toEqual([
      { text: "Gymnasium", treffer: true },
      { text: " Nord", treffer: false },
    ]);
  });

  it("markiert nur die erste Stelle", () => {
    // Sonst wird ein Name mit dreimal „schule“ zum Flickenteppich.
    const stuecke = zerlegeNachTreffer("Schule an der Schule", "schule");
    expect(stuecke.filter((s) => s.treffer)).toHaveLength(1);
  });

  it("markiert nichts, wenn der Begriff im Namen gar nicht vorkommt", () => {
    // Der Fall ist echt: Die Datenbank findet „Grünewald“ auch über
    // „gruenewald“, im angezeigten Namen steht der getippte Begriff dann nicht.
    expect(zerlegeNachTreffer("Grünewald-Schule", "gruenewald")).toEqual([
      { text: "Grünewald-Schule", treffer: false },
    ]);
  });

  it("kommt mit Sonderzeichen in der Eingabe zurecht", () => {
    // Nicht als regulärer Ausdruck behandelt - sonst wirft „(((“ einen Fehler.
    expect(zerlegeNachTreffer("Schule (Außenstelle)", "(auß")).toEqual([
      { text: "Schule ", treffer: false },
      { text: "(Auß", treffer: true },
      { text: "enstelle)", treffer: false },
    ]);
  });

  it("gibt bei leerer Eingabe den Text unverändert zurück", () => {
    expect(zerlegeNachTreffer("Schule", "  ")).toEqual([{ text: "Schule", treffer: false }]);
  });

  it("behält die Schreibweise des Namens, nicht die der Eingabe", () => {
    const stueck = zerlegeNachTreffer("Gymnasium Nord", "GYMNASIUM").find((s) => s.treffer);
    expect(stueck?.text).toBe("Gymnasium");
  });
});

describe("beiwerk", () => {
  it("lässt Lücken weg, statt Trenner zu häufen", () => {
    expect(beiwerk(["20095 Hamburg", null, "Gymnasium"])).toBe("20095 Hamburg · Gymnasium");
    expect(beiwerk([null, "  ", undefined])).toBe("");
  });
});
