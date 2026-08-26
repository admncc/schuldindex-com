import { beforeAll, describe, expect, it } from "vitest";
import {
  erzeugeSitzung,
  hashePasswort,
  hasheSitzung,
  pruefePasswort,
  pruefeSperre,
  SITZUNG_STUNDEN,
  SPERRDAUER_MINUTEN,
  SPERRE_NACH,
  sitzungscookie,
  SITZUNGSCOOKIE_NAMEN,
  sperrhinweis,
  stimmtPasswort,
} from "./anmeldung";

beforeAll(() => {
  process.env["SITZUNG_HMAC_SCHLUESSEL"] = Buffer.alloc(32, 7).toString("base64");
});

describe("pruefePasswort", () => {
  it("nimmt eine lange Wortfolge an — ohne Sonderzeichen zu verlangen", () => {
    expect(pruefePasswort("korrektes pferd batterie klammer")).toEqual([]);
  });

  it("weist zu kurze Kennwörter ab", () => {
    expect(pruefePasswort("kurz1!")).toContain("Das Kennwort muss mindestens 12 Zeichen lang sein.");
  });

  it("weist das ab, was Menschen tatsächlich eingeben", () => {
    expect(pruefePasswort("Schulindex2026!")).toEqual(["Das Kennwort enthält ein zu naheliegendes Wort."]);
    expect(pruefePasswort("Passwort123456")).toHaveLength(1);
  });

  it("weist eine Reihe gleicher Zeichen ab", () => {
    expect(pruefePasswort("aaaaaaaaaaaaaaaa")).toEqual(["Das Kennwort besteht nur aus einem einzigen Zeichen."]);
  });
});

describe("Kennwortabdruck", () => {
  it("prüft das richtige Kennwort und weist das falsche ab", async () => {
    const abdruck = await hashePasswort("korrektes pferd batterie klammer");
    expect(await stimmtPasswort("korrektes pferd batterie klammer", abdruck)).toBe(true);
    expect(await stimmtPasswort("korrektes pferd batterie klammar", abdruck)).toBe(false);
  }, 20_000);

  it("ergibt für dasselbe Kennwort zwei verschiedene Abdrücke", async () => {
    const [a, b] = await Promise.all([hashePasswort("dieselbe lange Folge"), hashePasswort("dieselbe lange Folge")]);
    expect(a).not.toBe(b); // sonst verrät die Tabelle, wer dasselbe Kennwort nutzt
    expect(await stimmtPasswort("dieselbe lange Folge", b)).toBe(true);
  }, 20_000);

  it("vergleicht Umlaute unabhängig von der Unicode-Zerlegung", async () => {
    // macOS liefert „ä“ zerlegt, Windows zusammengesetzt. Ohne Normalisierung
    // käme jemand auf dem einen Gerät nicht mehr hinein.
    const abdruck = await hashePasswort("Schlüsselbund für alle");
    expect(await stimmtPasswort("Schlüsselbund für alle", abdruck)).toBe(true);
  }, 20_000);

  it("liest die Parameter aus dem gespeicherten Wert, nicht aus den Konstanten", async () => {
    // Ein alter Abdruck mit schwächeren Parametern muss weiter prüfbar bleiben,
    // sonst sperrt eine Erhöhung von N alle Bestandskonten aus.
    const alt = ["scrypt", 16384, 8, 1].join("$");
    const abdruck = await hashePasswort("egal welche lange Folge");
    const [, , , , salz, hash] = abdruck.split("$");
    expect(await stimmtPasswort("egal welche lange Folge", `${alt}$${salz}$${hash}`)).toBe(false);
  }, 20_000);

  it("stürzt bei unbrauchbaren gespeicherten Werten nicht ab", async () => {
    for (const müll of ["", "$", "argon2$x$y", "scrypt$a$b$c$d"]) {
      expect(await stimmtPasswort("beliebig", müll)).toBe(false);
    }
  });
});

describe("Sitzungstoken", () => {
  it("speichert nur den Hash und gibt den Klartext genau einmal heraus", () => {
    const s = erzeugeSitzung(new Date(1_700_000_000_000));
    expect(s.klartext).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.hash).not.toBe(s.klartext);
    expect(hasheSitzung(s.klartext)).toBe(s.hash);
    expect(s.gueltigBis.getTime()).toBe(1_700_000_000_000 + SITZUNG_STUNDEN * 3600_000);
  });

  it("erzeugt keine zwei gleichen Token", () => {
    const menge = new Set(Array.from({ length: 200 }, () => erzeugeSitzung().klartext));
    expect(menge.size).toBe(200);
  });
});

describe("pruefeSperre", () => {
  const JETZT = new Date("2026-08-26T14:00:00Z");

  it("sperrt nicht, solange die Schwelle nicht erreicht ist", () => {
    const zustand = { fehlversuche: SPERRE_NACH - 1, letzterFehlversuchAm: JETZT };
    expect(pruefeSperre(zustand, JETZT)).toEqual({ gesperrt: false, freiAb: null });
  });

  it("sperrt ab der Schwelle und nennt den Zeitpunkt der Freigabe", () => {
    const zustand = { fehlversuche: SPERRE_NACH, letzterFehlversuchAm: JETZT };
    const sperre = pruefeSperre(zustand, JETZT);
    expect(sperre.gesperrt).toBe(true);
    expect(sperre.freiAb?.getTime()).toBe(JETZT.getTime() + SPERRDAUER_MINUTEN * 60_000);
  });

  it("läuft von selbst ab", () => {
    const zustand = { fehlversuche: 99, letzterFehlversuchAm: JETZT };
    const später = new Date(JETZT.getTime() + (SPERRDAUER_MINUTEN + 1) * 60_000);
    expect(pruefeSperre(zustand, später).gesperrt).toBe(false);
  });

  it("sperrt nicht ohne Zeitpunkt des letzten Fehlversuchs", () => {
    expect(pruefeSperre({ fehlversuche: 99, letzterFehlversuchAm: null }, JETZT).gesperrt).toBe(false);
  });
});

describe("sperrhinweis", () => {
  it("nennt eine Uhrzeit in deutscher Schreibweise", () => {
    expect(sperrhinweis(new Date("2026-08-26T14:05:00Z"))).toMatch(/^Zu viele Fehlversuche\. Nächster Versuch ab \d{2}:\d{2} Uhr\.$/);
  });
});

describe("Sitzungscookie", () => {
  it("trägt das __Host-Präfix nur dort, wo es auch Secure bekommt", () => {
    // Ohne Secure ist ein __Host-Cookie ungültig; Chromium nahm es über
    // localhost zwar an, schickte es aber nicht mehr zu den Server Actions.
    expect(sitzungscookie(true)).toBe("__Host-schulindex_moderation");
    expect(sitzungscookie(false)).toBe("schulindex_moderation");
  });

  it("liest beide Namen, damit ein Wechsel auf https niemanden abmeldet", () => {
    expect(SITZUNGSCOOKIE_NAMEN).toEqual(["__Host-schulindex_moderation", "schulindex_moderation"]);
    expect(SITZUNGSCOOKIE_NAMEN).toContain(sitzungscookie(true));
    expect(SITZUNGSCOOKIE_NAMEN).toContain(sitzungscookie(false));
  });
});
