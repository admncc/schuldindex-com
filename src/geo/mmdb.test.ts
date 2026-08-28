import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { absenderadresse, datenbankpfad, ortungFuerIp } from "./mmdb";

describe("absenderadresse", () => {
  it("nimmt die erste Angabe aus X-Forwarded-For", () => {
    // Die erste ist die des Browsers, die weiteren sind die Proxys dazwischen.
    const kopf = new Headers({ "x-forwarded-for": "88.130.50.1, 10.0.0.7, 10.0.0.8" });
    expect(absenderadresse(kopf)).toBe("88.130.50.1");
  });

  it("weicht auf X-Real-IP aus", () => {
    expect(absenderadresse(new Headers({ "x-real-ip": "88.130.50.1" }))).toBe("88.130.50.1");
  });

  it("meldet nichts, wenn kein Proxy davorsteht", () => {
    expect(absenderadresse(new Headers())).toBeNull();
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
