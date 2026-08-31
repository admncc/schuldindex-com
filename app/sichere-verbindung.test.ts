import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anfrageIstSicher, istBasisadresse } from "./sichere-verbindung";

function anfrage(kopf: Record<string, string>, url = "http://beispiel.de/x"): Request {
  return new Request(url, { headers: kopf });
}

describe("anfrageIstSicher hinter einem eigenen Proxy", () => {
  // Ohne diese Angabe wird der Kopf gar nicht gelesen: Er kommt sonst vom
  // Absender selbst und ist keine Auskunft, sondern eine Behauptung.
  beforeEach(() => {
    process.env["VERTRAUTE_PROXYS"] = "1";
  });
  afterEach(() => {
    delete process.env["VERTRAUTE_PROXYS"];
  });

  it("glaubt dem vorgeschalteten Server", () => {
    expect(anfrageIstSicher(anfrage({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(anfrageIstSicher(anfrage({ "x-forwarded-proto": "http" }))).toBe(false);
  });

  it("nimmt bei mehreren Proxys den äußeren", () => {
    // "https,http" heißt: Der Browser sprach https, intern ging es unverschlüsselt
    // weiter. Für das Cookie zählt, was der Browser gesehen hat.
    expect(anfrageIstSicher(anfrage({ "x-forwarded-proto": "https,http" }))).toBe(true);
    expect(anfrageIstSicher(anfrage({ "x-forwarded-proto": "http, https" }))).toBe(false);
  });

  it("versteht den Forwarded-Kopf nach RFC 7239", () => {
    expect(anfrageIstSicher(anfrage({ forwarded: 'for=1.2.3.4;proto=https;by=proxy' }))).toBe(true);
    expect(anfrageIstSicher(anfrage({ forwarded: 'for=1.2.3.4;proto="https"' }))).toBe(true);
    expect(anfrageIstSicher(anfrage({ forwarded: "for=1.2.3.4;proto=http" }))).toBe(false);
  });

  it("glaubt dem Kopf nicht, wenn kein eigener Proxy davorsteht", () => {
    delete process.env["VERTRAUTE_PROXYS"];
    expect(anfrageIstSicher(anfrage({ "x-forwarded-proto": "https" }))).toBe(false);
  });
});

describe("anfrageIstSicher ohne Proxy", () => {
  it("fällt auf die Adresse zurück", () => {
    expect(anfrageIstSicher(anfrage({}, "https://beispiel.de/x"))).toBe(true);
    expect(anfrageIstSicher(anfrage({}, "http://65.21.50.61:3000/x"))).toBe(false);
  });

  it("hält den Testserver über die nackte IP für unsicher - und genau darum geht es", () => {
    // Der Fehler, der das ausgelöst hat: Im Produktionsmodus wurde das
    // Sitzungscookie als `Secure` gesetzt, obwohl die Seite über http lief. Der
    // Browser nahm es nicht an, und die Moderation fiel bei jedem Klick auf die
    // Anmeldeseite zurück.
    expect(anfrageIstSicher(anfrage({ host: "65.21.50.61:3000" }, "http://65.21.50.61:3000/moderation"))).toBe(
      false,
    );
  });
});

describe("istBasisadresse - ohne eigenen Proxy entscheidet die Basisadresse", () => {
  afterEach(() => {
    delete process.env["BASIS_URL"];
  });

  it("hält eine Anfrage unter der Basisadresse für gesichert", () => {
    process.env["BASIS_URL"] = "https://schulindex.com";
    expect(istBasisadresse("schulindex.com")).toBe(true);
    expect(istBasisadresse("SCHULINDEX.COM")).toBe(true);
  });

  it("sperrt niemanden aus, der über eine andere Adresse kommt", () => {
    // **Der Fehler, gegen den das steht.** `BASIS_URL` hat zwei Aufgaben, und
    // im Testbetrieb laufen sie auseinander: Sie baut die Links in den
    // Nachrichten - dort soll die endgültige Domain stehen - und sie
    // entscheidet über das `Secure`-Attribut. Stand sie auf der Domain,
    // während jemand den Server über seine IP aufrief, bekam das
    // Sitzungscookie `Secure`, der Browser verwarf es über http, und die
    // Moderation fiel bei jedem Klick auf die Anmeldeseite zurück - ohne einen
    // Weg zurück, der nicht über die `.env` führt.
    process.env["BASIS_URL"] = "https://schulindex.com";
    expect(istBasisadresse("65.21.50.61:3000")).toBe(false);
    expect(istBasisadresse("localhost:3000")).toBe(false);
  });

  it("achtet auf den Port - eine andere Tür ist eine andere Adresse", () => {
    process.env["BASIS_URL"] = "https://schulindex.com:8443";
    expect(istBasisadresse("schulindex.com:8443")).toBe(true);
    expect(istBasisadresse("schulindex.com")).toBe(false);
  });

  it("bleibt bei fehlender Gastgeberangabe beim alten Stand", () => {
    process.env["BASIS_URL"] = "https://schulindex.com";
    expect(istBasisadresse(null)).toBe(true);
  });

  it("sagt nein, wenn die Basisadresse nicht auf https steht", () => {
    process.env["BASIS_URL"] = "http://65.21.50.61:3000";
    expect(istBasisadresse("65.21.50.61:3000")).toBe(false);
    delete process.env["BASIS_URL"];
    expect(istBasisadresse("irgendwo")).toBe(false);
  });

  it("verschluckt sich nicht an einer unbrauchbaren Basisadresse", () => {
    process.env["BASIS_URL"] = "https://";
    expect(istBasisadresse("schulindex.com")).toBe(false);
  });
});
