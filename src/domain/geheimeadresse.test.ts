import { describe, expect, it } from "vitest";
import { adresseIstGeheim } from "./geheimeadresse";

function geheim(adresse: string): boolean {
  const u = new URL(adresse, "https://schulindex.com");
  return adresseIstGeheim(u.pathname, u.searchParams);
}

describe("adresseIstGeheim", () => {
  it("erkennt den Bestätigungslink - der Fall, um den es geht", () => {
    expect(geheim("/bestaetigen?token=abc123")).toBe(true);
    expect(geheim("/bestaetigen")).toBe(true);
    expect(geheim("/konto/eintreten?token=abc")).toBe(true);
    expect(geheim("/schulsupport/eintreten?token=abc")).toBe(true);
  });

  it("erkennt einen Token an jeder Adresse", () => {
    expect(geheim("/?token=abc")).toBe(true);
    expect(geheim("/schulen/beispielschule?TOKEN=abc")).toBe(true);
    expect(geheim("/irgendwas?auth=abc")).toBe(true);
  });

  it("lässt die gewöhnlichen Seiten in Ruhe", () => {
    expect(geheim("/")).toBe(false);
    expect(geheim("/schulen?ort=Berlin&art=gymnasium")).toBe(false);
    expect(geheim("/ranglisten?bundesland=by")).toBe(false);
    // Der Empfehlungscode ist zum Weitergeben gedacht und kein Geheimnis -
    // ohne ihn wuerde keine Kampagne mehr gemessen.
    expect(geheim("/lp2?freund=ABC123")).toBe(false);
  });
});
