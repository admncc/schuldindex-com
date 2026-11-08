import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Skripte } from "./skripte";

/**
 * **Warum es diese Prüfung gibt.** Die ganze Einbettung hängt daran, dass der
 * Schnipsel den Weg durch React unverändert und **in der eingetragenen
 * Reihenfolge** übersteht. Fällt etwas weg oder wird vertauscht, erscheint das
 * Banner nicht - ohne Fehlermeldung, denn ein nicht ausgeliefertes Skript
 * meldet nichts. Genau diese Prüfung hat den ersten Entwurf widerlegt: React
 * zog dort `<script async src>` nach vorn und trennte den Stub vom Lader.
 */
function markup(inhalt: string): string {
  return renderToStaticMarkup(<Skripte platz="einwilligung" inhalt={inhalt} />);
}

describe("Skripte", () => {
  it("liefert die Adresse eines externen Skripts aus", () => {
    const html = markup('<script async src="https://cmp.inmobi.com/choice/x/y/choice.js"></script>');
    expect(html).toContain("https://cmp.inmobi.com/choice/x/y/choice.js");
    expect(html).toContain("s.async=true");
  });

  it("liefert den Code eines eingebetteten Skripts wörtlich aus", () => {
    const html = markup("<script>window.__tcfapi = window.__tcfapi || function() {};</script>");
    // Nicht entschärft: Aus < darf kein &lt; werden, sonst ist der Code tot.
    expect(html).toContain("window.__tcfapi || function() {}");
    expect(html).not.toContain("&lt;");
  });

  it("behält die Reihenfolge - der Stub vor dem Lader", () => {
    const html = markup(
      "<script>var vorher = 1;</script>" +
        '<script async src="https://cmp.inmobi.com/choice/x/y/choice.js"></script>',
    );
    expect(html.indexOf("var vorher")).toBeLessThan(html.indexOf("cmp.inmobi.com"));
    // Und zwar in *einem* Element, das React nicht umsortieren kann.
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it("hält mehrere externe Skripte ohne async/defer in der Reihenfolge", () => {
    const html = markup(
      '<script src="https://a.example/eins.js"></script>' +
        '<script src="https://a.example/zwei.js"></script>',
    );
    expect(html.indexOf("eins.js")).toBeLessThan(html.indexOf("zwei.js"));
    expect(html).toContain("s.async=false");
  });

  it("gibt weitere Attribute mit", () => {
    const html = markup(
      '<script src="https://a.example/b.js" crossorigin="anonymous" data-cmp="1"></script>',
    );
    expect(html).toContain("crossorigin");
    expect(html).toContain("data-cmp");
  });

  it("entschärft Anführungszeichen im Code, statt sie auszuliefern", () => {
    const html = markup(`<script>var a = "x\\"y";</script>`);
    // JSON.stringify sorgt dafür, dass nichts aus der Zeichenkette ausbricht.
    expect(html).not.toContain('var a = "x"y"');
  });

  it("liefert nichts aus, was die Prüfung nicht besteht", () => {
    expect(markup('<iframe src="https://a.example"></iframe>')).toBe("");
    expect(markup("")).toBe("");
  });
});
