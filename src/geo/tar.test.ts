import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findeInTar, istGzip, istMmdb } from "./tar";

/** Ein echtes Archiv, gebaut mit dem tar des Systems - kein nachgebauter Kopf. */
function baueArchiv(dateien: Record<string, Buffer | string>): Buffer {
  const ordner = mkdtempSync(join(tmpdir(), "tartest-"));
  for (const [name, inhalt] of Object.entries(dateien)) {
    writeFileSync(join(ordner, name), inhalt);
  }
  execFileSync("tar", ["cf", join(ordner, "archiv.tar"), "-C", ordner, ...Object.keys(dateien)]);
  return readFileSync(join(ordner, "archiv.tar"));
}

describe("findeInTar", () => {
  it("findet die Datenbank zwischen Lizenz und Liesmich", () => {
    // Genau der Aufbau, den MaxMind ausliefert.
    const archiv = baueArchiv({
      "COPYRIGHT.txt": "MaxMind",
      "GeoIP2-City.mmdb": Buffer.from("datenbankinhalt"),
      "README.txt": "Latitude and longitude are not precise",
    });

    const gefunden = findeInTar(archiv, ".mmdb");
    expect(gefunden?.name).toContain("GeoIP2-City.mmdb");
    expect(gefunden?.inhalt.toString()).toBe("datenbankinhalt");
  });

  it("liest auch Inhalte, die keine glatten Blöcke sind", () => {
    // 512 Byte je Block; eine Datei von 700 Byte prüft das Aufrunden.
    const inhalt = Buffer.alloc(700, 7);
    const gefunden = findeInTar(baueArchiv({ "a.txt": "x", "b.mmdb": inhalt }), ".mmdb");
    expect(gefunden?.inhalt.length).toBe(700);
    expect(gefunden?.inhalt.every((b) => b === 7)).toBe(true);
  });

  it("gibt null zurück, wenn keine passende Datei drin ist", () => {
    expect(findeInTar(baueArchiv({ "README.txt": "nur Text" }), ".mmdb")).toBeNull();
  });

  it("verschluckt sich nicht an Unsinn", () => {
    expect(findeInTar(Buffer.alloc(0), ".mmdb")).toBeNull();
    expect(findeInTar(Buffer.alloc(1024), ".mmdb")).toBeNull();
    expect(findeInTar(Buffer.from("kein archiv"), ".mmdb")).toBeNull();
  });
});

describe("Formaterkennung", () => {
  it("erkennt gzip am Anfang", () => {
    expect(istGzip(Buffer.from([0x1f, 0x8b, 0x08, 0x00]))).toBe(true);
    expect(istGzip(Buffer.from("PK"))).toBe(false);
    expect(istGzip(Buffer.alloc(1))).toBe(false);
  });

  it("erkennt die MaxMind-Kennung am Ende", () => {
    const daten = Buffer.concat([
      Buffer.alloc(100, 1),
      Buffer.from("\xab\xcd\xefMaxMind.com", "binary"),
      Buffer.alloc(20, 2),
    ]);
    expect(istMmdb(daten)).toBe(true);
    expect(istMmdb(Buffer.alloc(500, 3))).toBe(false);
  });
});
