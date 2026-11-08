import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findeInTar, istGzip, istMmdb , istTar } from "./tar";

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

describe("istTar - die Falle, die 44 MB unbrauchbar machte", () => {
  const KENNUNG = Buffer.from("\xab\xcd\xefMaxMind.com", "binary");

  /** Ein tar mit einer kleinen Textdatei und danach einer „Datenbank". */
  function archivMitDatenbank(): { archiv: Buffer; datenbank: Buffer } {
    const datenbank = Buffer.concat([
      Buffer.alloc(4096, 0x42),
      KENNUNG,
      Buffer.from('{"database_type":"GeoIP2-City-Europe"}'),
    ]);
    const lizenz = Buffer.from("COPYRIGHT 2026\n");
    const archiv = Buffer.concat([
      tarMitglied("GeoIP2-City-Europe_20260827/COPYRIGHT.txt", lizenz),
      tarMitglied("GeoIP2-City-Europe_20260827/GeoIP2-City-Europe.mmdb", datenbank),
      Buffer.alloc(1024, 0),
    ]);
    return { archiv, datenbank };
  }

  function tarMitglied(name: string, inhalt: Buffer): Buffer {
    const kopf = Buffer.alloc(512, 0);
    kopf.write(name, 0, "ascii");
    kopf.write(inhalt.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
    kopf.write("ustar\0", 257, "ascii");
    kopf.write("00", 263, "ascii");
    const rest = (512 - (inhalt.length % 512)) % 512;
    return Buffer.concat([kopf, inhalt, Buffer.alloc(rest, 0)]);
  }

  /**
   * **Das ist der Fehler, in einer Zeile.** Die mmdb-Erkennung sucht die
   * Kennung in den letzten 100 KB - und weil die Datenbank das letzte Mitglied
   * des Archivs ist, steht sie auch dort. Das Archiv galt damit als Datenbank
   * und wurde unverändert auf die Platte geschrieben: lesbare Metadaten,
   * plausible Größe, kein einziger Treffer.
   */
  it("hält ein Archiv fälschlich für eine Datenbank - deshalb genügt istMmdb nicht", () => {
    const { archiv } = archivMitDatenbank();
    expect(istMmdb(archiv)).toBe(true);
  });

  it("erkennt das Archiv an der ustar-Kennung an fester Stelle", () => {
    const { archiv, datenbank } = archivMitDatenbank();
    expect(istTar(archiv)).toBe(true);
    // Die Datenbank selbst ist kein Archiv - sonst liefe die Prüfung ins Leere.
    expect(istTar(datenbank)).toBe(false);
  });

  it("holt die Datenbank aus dem Archiv, nicht das Archiv selbst", () => {
    const { archiv, datenbank } = archivMitDatenbank();
    const gefunden = findeInTar(archiv, ".mmdb");
    expect(gefunden).not.toBeNull();
    expect(gefunden!.inhalt.length).toBe(datenbank.length);
    expect(gefunden!.inhalt.equals(datenbank)).toBe(true);
    expect(istMmdb(gefunden!.inhalt)).toBe(true);
  });
});
