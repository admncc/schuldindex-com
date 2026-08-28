import { describe, expect, it } from "vitest";
import { schulartAnzeige } from "./schulart";

describe("schulartAnzeige", () => {
  it("zeigt die deutsche Originalbezeichnung, wo es eine gibt", () => {
    // Eine Schleswig-Holsteiner Gemeinschaftsschule heißt auf ihrem Profil
    // weiterhin so, auch wenn sie als Gesamtschule gefiltert wird.
    expect(schulartAnzeige("Gemeinschaftsschule", ["gesamtschule"])).toBe("Gemeinschaftsschule");
    expect(schulartAnzeige("Gymnasium (Mittel- und Oberstufe)", ["gymnasium"])).toBe(
      "Gymnasium (Mittel- und Oberstufe)",
    );
  });

  it("ersetzt den Rohcode der Quelle durch die Taxonomiebezeichnung", () => {
    // Diese Codes standen sichtbar auf den Schulprofilen und in der Suche.
    expect(schulartAnzeige("primaryEducation", ["grundschule"])).toBe("Grundschule");
    expect(schulartAnzeige("upperSecondaryEducation", ["gymnasium"])).toBe("Gymnasium");
  });

  it("hält ein einzelnes großgeschriebenes Wort nicht für einen Code", () => {
    expect(schulartAnzeige("Grundschulen", ["grundschule"])).toBe("Grundschulen");
    expect(schulartAnzeige("Förderzentrum", ["foerderschule"])).toBe("Förderzentrum");
  });

  it("weicht auf die Taxonomie aus, wenn nichts geliefert wurde", () => {
    expect(schulartAnzeige(null, ["realschule"])).toBe("Realschule");
    expect(schulartAnzeige("  ", ["realschule"])).toBe("Realschule");
  });

  it("gibt nichts zurück, wenn es nichts zu zeigen gibt", () => {
    expect(schulartAnzeige(null, [])).toBeNull();
  });
});
