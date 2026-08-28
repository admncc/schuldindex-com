import { describe, expect, it } from "vitest";
import {
  base32Dekodiere,
  base32Kodiere,
  erzeugeGeheimnis,
  hotp,
  otpauthUrl,
  pruefeCode,
  SCHRITT_SEKUNDEN,
  totp,
} from "./totp";

/** Das Geheimnis aus RFC 4226/6238: die ASCII-Ziffern „12345678901234567890“. */
const RFC_GEHEIMNIS = Buffer.from("12345678901234567890", "ascii");
const RFC_BASE32 = base32Kodiere(RFC_GEHEIMNIS);

describe("Base32", () => {
  it("kodiert das RFC-Geheimnis wie die Authenticator-Apps", () => {
    expect(RFC_BASE32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("kommt hin und zurück, auch bei unbequemen Längen", () => {
    for (let n = 1; n <= 24; n++) {
      const roh = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
      expect(base32Dekodiere(base32Kodiere(roh))).toEqual(roh);
    }
  });

  it("nimmt Leerzeichen und Auffüllzeichen hin - so steht es auf Ausdrucken", () => {
    expect(base32Dekodiere("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ")).toEqual(RFC_GEHEIMNIS);
    expect(base32Dekodiere("MZXW6YQ=")).toEqual(Buffer.from("foob", "ascii"));
  });

  it("weist ungültige Zeichen ab, statt sie stillschweigend zu verschlucken", () => {
    // 0, 1 und 8 fehlen im Alphabet, weil sie mit O, I und B verwechselt werden.
    expect(() => base32Dekodiere("GEZD0NBV")).toThrow(/Ungültiges Base32-Zeichen/);
  });

  it("erzeugt Geheimnisse mit 32 Zeichen und 20 Byte Inhalt", () => {
    const g = erzeugeGeheimnis();
    expect(g).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Dekodiere(g)).toHaveLength(20);
  });
});

describe("HOTP gegen die Testvektoren aus RFC 4226", () => {
  const ERWARTET = [
    "755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489",
  ];

  it.each(ERWARTET.map((code, zaehler) => ({ zaehler, code })))(
    "Zähler $zaehler ergibt $code",
    ({ zaehler, code }) => {
      expect(hotp(RFC_GEHEIMNIS, zaehler)).toBe(code);
    },
  );
});

describe("TOTP gegen die Testvektoren aus RFC 6238", () => {
  // Der RFC führt achtstellige Codes; sechsstellig sind es deren letzte sechs
  // Stellen, weil beide aus derselben Zahl modulo einer Zehnerpotenz entstehen.
  const ERWARTET: readonly [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  it.each(ERWARTET.map(([sekunden, code]) => ({ sekunden, code })))(
    "Sekunde $sekunden ergibt $code",
    ({ sekunden, code }) => {
      expect(totp(RFC_BASE32, new Date(sekunden * 1000))).toBe(code);
    },
  );
});

describe("pruefeCode", () => {
  const JETZT = new Date(1_600_000_000_000);

  it("nimmt den Code des laufenden Schrittes an", () => {
    const ergebnis = pruefeCode(RFC_BASE32, totp(RFC_BASE32, JETZT), JETZT);
    expect(ergebnis.ok).toBe(true);
  });

  it("verzeiht eine Uhr, die einen Schritt nach- oder vorgeht", () => {
    const vorher = new Date(JETZT.getTime() - SCHRITT_SEKUNDEN * 1000);
    const nachher = new Date(JETZT.getTime() + SCHRITT_SEKUNDEN * 1000);
    expect(pruefeCode(RFC_BASE32, totp(RFC_BASE32, vorher), JETZT).ok).toBe(true);
    expect(pruefeCode(RFC_BASE32, totp(RFC_BASE32, nachher), JETZT).ok).toBe(true);
  });

  it("verzeiht zwei Schritte nicht", () => {
    const weit = new Date(JETZT.getTime() - 2 * SCHRITT_SEKUNDEN * 1000);
    expect(pruefeCode(RFC_BASE32, totp(RFC_BASE32, weit), JETZT).ok).toBe(false);
  });

  it("weist alles ab, was nicht sechs Ziffern ist - ohne zu rechnen", () => {
    for (const müll of ["", "12345", "1234567", "abcdef", "12 34 56 78"]) {
      expect(pruefeCode(RFC_BASE32, müll, JETZT).ok).toBe(false);
    }
  });

  it("übergeht Leerzeichen in der Eingabe", () => {
    const code = totp(RFC_BASE32, JETZT);
    const mitLuecke = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(pruefeCode(RFC_BASE32, mitLuecke, JETZT).ok).toBe(true);
  });

  it("lässt denselben Code kein zweites Mal zu", () => {
    const code = totp(RFC_BASE32, JETZT);
    const erste = pruefeCode(RFC_BASE32, code, JETZT);
    expect(erste.ok).toBe(true);

    // Genau der Punkt, an dem eine naive Umsetzung durchfällt: der Code ist
    // dreißig Sekunden lang gültig, also auch für den, der ihn mitgelesen hat.
    const zweite = pruefeCode(RFC_BASE32, code, JETZT, erste.ok ? erste.schritt : null);
    expect(zweite.ok).toBe(false);
  });

  it("lässt den nächsten Code nach einem verbrauchten wieder zu", () => {
    const erste = pruefeCode(RFC_BASE32, totp(RFC_BASE32, JETZT), JETZT);
    const später = new Date(JETZT.getTime() + SCHRITT_SEKUNDEN * 1000);
    const zweite = pruefeCode(RFC_BASE32, totp(RFC_BASE32, später), später, erste.ok ? erste.schritt : null);
    expect(zweite.ok).toBe(true);
  });

  it("gibt den benutzten Schritt zurück, nicht bloß ein Ja", () => {
    const vorher = new Date(JETZT.getTime() - SCHRITT_SEKUNDEN * 1000);
    const ergebnis = pruefeCode(RFC_BASE32, totp(RFC_BASE32, vorher), JETZT);
    expect(ergebnis).toEqual({ ok: true, schritt: Math.floor(vorher.getTime() / 1000 / SCHRITT_SEKUNDEN) });
  });
});

describe("otpauthUrl", () => {
  it("enthält alles, was eine App zum Einrichten braucht", () => {
    const url = new URL(otpauthUrl("moderation@schulindex.de", RFC_BASE32));
    expect(url.protocol).toBe("otpauth:");
    expect(url.host).toBe("totp");
    expect(decodeURIComponent(url.pathname)).toBe("/SCHULINDEX:moderation@schulindex.de");
    expect(url.searchParams.get("secret")).toBe(RFC_BASE32);
    expect(url.searchParams.get("issuer")).toBe("SCHULINDEX");
    expect(url.searchParams.get("digits")).toBe("6");
    expect(url.searchParams.get("period")).toBe("30");
  });
});
