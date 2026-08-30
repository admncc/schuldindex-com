import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { absenderadresse, datenbankpfad, ortungFuerIp } from "./mmdb";

describe("absenderadresse", () => {
  it("nimmt die Angabe, die der eigene Proxy angehängt hat", () => {
    // Zwei eigene Proxys: Der äußere hat „88.130.50.1“ gesehen und angehängt,
    // der innere „10.0.0.7“. Die vorderste Angabe stammt vom Client selbst.
    const kopf = new Headers({ "x-forwarded-for": "1.2.3.4, 88.130.50.1, 10.0.0.7" });
    expect(absenderadresse(kopf, 2)).toBe("88.130.50.1");
  });

  it("glaubt dem Kopf nicht, wenn kein eigener Proxy davorsteht", () => {
    // Der teuer erkaufte Fehler: Wer diesen Kopf selbst setzt, schaltete damit
    // die Entfernungsprüfung ab.
    const kopf = new Headers({ "x-forwarded-for": "88.130.50.1" });
    expect(absenderadresse(kopf, 0)).toBeNull();
  });

  it("verwirft eine zu kurze Kette", () => {
    // Zwei Proxys erwartet, nur eine Angabe da: Jemand hat den Kopf ersetzt.
    expect(absenderadresse(new Headers({ "x-forwarded-for": "88.130.50.1" }), 2)).toBeNull();
  });

  it("weicht auf X-Real-IP aus, sobald ein Proxy davorsteht", () => {
    expect(absenderadresse(new Headers({ "x-real-ip": "88.130.50.1" }), 1)).toBe("88.130.50.1");
  });

  it("meldet nichts, wenn gar nichts da ist", () => {
    expect(absenderadresse(new Headers(), 1)).toBeNull();
  });
});

describe("ortungFuerIp", () => {
  it("gibt ohne Adresse nichts zurück", async () => {
    expect(await ortungFuerIp(null)).toBeNull();
    expect(await ortungFuerIp("   ")).toBeNull();
  });

  it("verschluckt sich nicht an einer erfundenen Adresse", async () => {
    // Der Kopf kommt vom Client und kann alles enthalten.
    expect(await ortungFuerIp("keine-ip")).toBeNull();
    expect(await ortungFuerIp("999.999.999.999")).toBeNull();
  });

  it.skipIf(!existsSync(datenbankpfad()))("schlägt eine deutsche Adresse nach", async () => {
    const treffer = await ortungFuerIp("88.130.50.1");
    expect(treffer).not.toBeNull();
    expect(treffer!.land).toBe("DE");
    // Irgendwo in Deutschland - genauer soll die Prüfung gar nicht sein.
    expect(treffer!.lat).toBeGreaterThan(47);
    expect(treffer!.lat).toBeLessThan(56);
    expect(treffer!.lon).toBeGreaterThan(5);
    expect(treffer!.lon).toBeLessThan(16);
  });

  it.skipIf(!existsSync(datenbankpfad()))("liefert einen Genauigkeitsradius mit", async () => {
    // Er ist der Grund, warum die Entfernung ein Signal bleibt und kein Beweis:
    // Deutsche Mobilfunkadressen orten auf den Netzknoten.
    const treffer = await ortungFuerIp("88.130.50.1");
    expect(treffer?.genauigkeitKm).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(datenbankpfad()))("kennt private Adressen nicht", async () => {
    expect(await ortungFuerIp("10.0.0.1")).toBeNull();
    expect(await ortungFuerIp("127.0.0.1")).toBeNull();
  });
});
