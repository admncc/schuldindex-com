import { describe, expect, it } from "vitest";
import { auswerteKlicks, plausibel, pruefeKlickmuster } from "./klickmuster";
import { VORGABEN, mitVorgaben } from "./einstellungen";

/** Abstände eines Menschen: mal zwei Sekunden, mal zehn. */
function menschlich(): number[] {
  const werte = [2100, 5400, 1800, 9200, 3300, 1500, 7600, 2400, 12000, 3100];
  return [...werte, ...werte];
}

/** Ein Skript klickt gleichmäßig. */
function skript(abstand: number, anzahl = 30): number[] {
  return Array.from({ length: anzahl }, (_, i) => abstand + (i % 3) * 4);
}

describe("auswerteKlicks", () => {
  it("gibt ohne mindestens zwei Abstände nichts zurück", () => {
    expect(auswerteKlicks([])).toBeNull();
    expect(auswerteKlicks([500])).toBeNull();
  });

  it("berechnet Median und Streuung", () => {
    const a = auswerteKlicks([1000, 1000, 1000, 1000])!;
    expect(a.anzahl).toBe(4);
    expect(a.medianMs).toBe(1000);
    expect(a.streuung).toBe(0);
  });

  it("kappt Unterbrechungen bei einer Minute", () => {
    // Wer zwischendurch eine Stunde Pause macht, soll dadurch nicht als
    // besonders unregelmäßig gelten - sonst wäre jede Mittagspause ein Signal.
    const mitPause = auswerteKlicks([1000, 1000, 3_600_000, 1000])!;
    const mitKappung = auswerteKlicks([1000, 1000, 60_000, 1000])!;
    expect(mitPause).toEqual(mitKappung);
  });

  it("übergeht unbrauchbare Werte", () => {
    expect(auswerteKlicks([1000, Number.NaN, -5, 1000])!.anzahl).toBe(2);
  });

  it("nimmt höchstens 200 Abstände entgegen", () => {
    expect(auswerteKlicks(Array.from({ length: 5000 }, () => 900))!.anzahl).toBe(200);
  });
});

describe("unplausible Folgen", () => {
  it("meldet eine erfundene Reihe als eigenes Signal", () => {
    // Der Fehler, den dieser Test festhält: Zuerst gab eine unplausible Folge
    // ein leeres Ergebnis zurück. Ein gleichmäßig klickendes Skript hängte
    // deshalb einen überhöhten Wert an und schaltete damit beide Klicksignale
    // ab, statt aufzufallen.
    const gleichmaessig = Array.from({ length: 30 }, () => 300);
    const mitAusreisser = [...gleichmaessig, 10_000_000];
    const e = pruefeKlickmuster(mitAusreisser, 20);
    expect(e.signale.map((s) => s.art)).toContain("klickfolge_unplausibel");
    expect(e.signale.reduce((summe, s) => summe + s.gewicht, 0)).toBeGreaterThanOrEqual(3);
    // Ausgewertet wird die Folge nicht - die Zahlen wären ja erfunden.
    expect(e.auswertung).toBeNull();
  });
});

describe("plausibel", () => {
  it("glaubt ohne Serverzeit alles", () => {
    expect(plausibel([500_000], null)).toBe(true);
  });

  it("weist eine Summe zurück, die über der gemessenen Dauer liegt", () => {
    // Behauptet: acht Minuten geklickt. Der signierte Stempel sagt: 20 Sekunden.
    expect(plausibel(Array.from({ length: 60 }, () => 8000), 20)).toBe(false);
  });

  it("lässt kleine Uhrenunterschiede durch", () => {
    expect(plausibel([10_000, 10_000], 18)).toBe(true);
  });
});

describe("pruefeKlickmuster", () => {
  it("schweigt ohne Messung", () => {
    expect(pruefeKlickmuster(null, 300).signale).toEqual([]);
    expect(pruefeKlickmuster([], 300).signale).toEqual([]);
  });

  it("schweigt bei zu wenigen Klicks", () => {
    // Drei Abstände sagen nichts - auch drei schnelle nicht.
    const e = pruefeKlickmuster([100, 110, 105], 5);
    expect(e.signale).toEqual([]);
    expect(e.auswertung?.anzahl).toBe(3);
  });

  it("wertet nichts aus, was nicht zur Serverzeit passt - meldet es aber", () => {
    const e = pruefeKlickmuster(skript(300), 2);
    expect(e.signale.map((s) => s.art)).toEqual(["klickfolge_unplausibel"]);
    expect(e.auswertung).toBeNull();
  });

  it("meldet menschliches Klicken nicht, solange die Grenze darunter liegt", () => {
    // **Gegen die Einstellung geprüft, nicht gegen die Vorgabe.** Die Vorgabe
    // ist eine Betriebsentscheidung und hat sich schon mehrfach geändert; was
    // diese Prüfung festhalten soll, ist das Verfahren: Streuen die Abstände
    // wie bei einem Menschen und liegt der Median über der Grenze, kommt kein
    // Signal.
    const abstaende = menschlich();
    const dauer = Math.ceil(abstaende.reduce((s, a) => s + a, 0) / 1000);
    const milde = mitVorgaben({ klick_mindestabstand_ms: 1000 });
    expect(pruefeKlickmuster(abstaende, dauer, milde).signale).toEqual([]);
  });

  /**
   * **Was die aktuelle Vorgabe mit dieser Folge macht - festgehalten, nicht
   * weggeräumt.**
   *
   * Die Folge `menschlich()` ist das Modell dieses Projekts für „so klickt ein
   * Mensch": Abstände zwischen 1,5 und 12 Sekunden, Median 3 200 ms. Mit der
   * Vorgabe von 4 000 ms schlägt bei ihr das Tempo-Signal an.
   *
   * Das ist kein Fehler im Code, sondern die Folge einer Entscheidung: Die
   * Grenze wurde am 08.11.2026 in mehreren Schritten von 400 auf 4 000 gezogen,
   * um eine bewusst schnell durchgeklickte Testabgabe (Median 906 ms) zu
   * fangen. Zwei echte Abgaben lagen bei 4 808 und 6 848 ms. Diese Folge liegt
   * mit 3 200 ms dazwischen - und wird jetzt eingestuft.
   *
   * Tragbar ist das, weil das Signal 2 wiegt und die Halteschwelle bei 3 liegt:
   * Allein hält es nichts an. Wer die Vorgabe wieder senkt, darf diese Prüfung
   * umdrehen - sie soll nicht stillschweigend mitwandern.
   */
  it("stuft die menschliche Folge bei der aktuellen Vorgabe ein", () => {
    const abstaende = menschlich();
    const dauer = Math.ceil(abstaende.reduce((s, a) => s + a, 0) / 1000);
    const e = pruefeKlickmuster(abstaende, dauer, VORGABEN);
    expect(e.auswertung?.medianMs).toBe(3200);
    expect(e.signale.map((s) => s.art)).toEqual(["zu_schnell_geklickt"]);
    // Die Gleichmäßigkeit bleibt unauffällig - daran ist die Folge als
    // menschlich zu erkennen, und dieses Signal wiegt 3.
    expect(e.signale.map((s) => s.art)).not.toContain("gleichmaessige_klicks");
  });

  it("findet das schnelle Durchklicken", () => {
    const e = pruefeKlickmuster(skript(150), 10);
    expect(e.signale.map((s) => s.art)).toContain("zu_schnell_geklickt");
  });

  it("findet auch das langsame Skript an der Gleichmäßigkeit", () => {
    // Zehn Sekunden je Frage ist unauffällig langsam - die immer gleichen
    // Abstände sind es nicht. Genau dafür gibt es das zweite Signal.
    const e = pruefeKlickmuster(skript(10_000), 320);
    expect(e.signale.map((s) => s.art)).toEqual(["gleichmaessige_klicks"]);
  });

  it("nennt die Zahlen, auf denen das Signal beruht", () => {
    const e = pruefeKlickmuster(skript(150), 10);
    expect(e.signale[0]!.erlaeuterung).toMatch(/\d+ Klicks/);
    expect(e.auswertung).not.toBeNull();
  });

  it("folgt den eingestellten Grenzwerten", () => {
    // Der Höchstwert des Katalogs - mehr ließe das Panel gar nicht zu.
    const streng = mitVorgaben({ klick_mindestabstand_ms: 5000 });
    const milde = mitVorgaben({ klick_mindestabstand_ms: 1000 });
    const abstaende = menschlich();
    const dauer = Math.ceil(abstaende.reduce((s, a) => s + a, 0) / 1000);
    expect(pruefeKlickmuster(abstaende, dauer, milde).signale).toEqual([]);
    expect(pruefeKlickmuster(abstaende, dauer, streng).signale.map((s) => s.art)).toContain(
      "zu_schnell_geklickt",
    );
  });
});
