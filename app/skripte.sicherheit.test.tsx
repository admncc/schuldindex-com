import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pruefeSchnipsel } from "@/domain/einbettung";
import { Skripte } from "./skripte";

/**
 * Die Sicherheitszusage dieses Feldes, als Prüfung statt als Behauptung.
 *
 * Das Panel verspricht zweierlei: Was eingetragen wird, verlässt sein
 * `<script>`-Element nicht, und es wird nichts anderes daraus als
 * `<script>`-Elemente. Beides lässt sich nicht durch Hinsehen belegen - eine
 * Zerlegung von Hand hat immer eine Ecke, an die niemand gedacht hat. Deshalb
 * hier ein Fundus böswilliger Eingaben und drei Eigenschaften, die für **jede**
 * angenommene Eingabe gelten müssen.
 */
const BOESARTIG: readonly string[] = [
  // Ausbruch aus dem umgebenden Skript
  "<script>var a = 1; </script ><img src=x onerror=alert(1)>",
  "<script>var a = '</SCRIPT\\t>';</script>",
  '<script src="https://a.example/b.js" data-x="</script><b>"></script>',
  // Fremde Elemente, auch versteckt
  '<noscript><iframe src="https://b.example"></iframe></noscript>',
  "<!-- <script src=\"https://a.example/x.js\"></script> -->",
  '<svg onload="alert(1)"></svg>',
  '<script><!--\n</script><img src=x onerror=alert(1)>\n--></script>',
  // Ereignisattribute in jeder Schreibweise
  '<script SRC="https://a.example/b.js" OnLoad="alert(1)"></script>',
  '<script src="https://a.example/b.js" onerror=alert(1)></script>',
  // Adressen, die kein https sind
  '<script src="javascript:alert(1)"></script>',
  '<script src="data:text/javascript,alert(1)"></script>',
  '<script src="//a.example/b.js"></script>',
  '<script src=" https://a.example/b.js"></script>',
  // Ausbruch aus der erzeugten Zeichenkette
  '<script>var a = "\\\\"; alert(1); //";</script>',
  "<script>var a = `${alert(1)}`;</script>",
  '<script src="https://a.example/b.js?x=&quot;);alert(1);//"></script>',
  // Harmlose Fassungen, die angenommen werden sollen
  '<script async src="https://cmp.inmobi.com/choice/a/b/choice.js"></script>',
  "<script>window.__tcfapi = window.__tcfapi || function() {};</script>",
];

describe("Einbettung: Sicherheitszusagen", () => {
  for (const eingabe of BOESARTIG) {
    const kurz = eingabe.slice(0, 48).replace(/\s+/g, " ");

    it(`hält die Zusagen für: ${kurz}`, () => {
      const geprueft = pruefeSchnipsel(eingabe);
      if (!geprueft.ok) return; // Abgelehnt ist das beste Ergebnis.

      const html = renderToStaticMarkup(<Skripte platz="einwilligung" inhalt={eingabe} />);
      if (html === "") return;

      // 1. Genau ein Element, und zwar ein <script>.
      expect(html.match(/<script/gi)).toHaveLength(1);
      expect(html.match(/<\/script>/gi)).toHaveLength(1);
      expect(html.startsWith("<script")).toBe(true);

      // 2. Nichts, was das Element vorzeitig beendet. Der HTML-Zerleger kennt
      //    `</script` mit beliebigem Folgezeichen als Schluss - nicht nur `>`.
      const inhalt = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
      expect(/<\/script/i.test(inhalt)).toBe(false);
      expect(/<!--/.test(inhalt)).toBe(false);

      // 3. Das Erzeugte ist gültiges JavaScript. Wäre die Maskierung der
      //    Zeichenketten fehlerhaft, stünde hier in aller Regel ein
      //    Syntaxfehler - das ist der schärfste Test, den es ohne Browser gibt.
      expect(() => new Function(inhalt)).not.toThrow();
    });
  }

  it("nimmt an, was angenommen werden soll", () => {
    expect(pruefeSchnipsel(BOESARTIG.at(-1)!).ok).toBe(true);
    expect(pruefeSchnipsel(BOESARTIG.at(-2)!).ok).toBe(true);
  });

  it("lehnt jede Eingabe mit einem fremden Element ab", () => {
    for (const e of BOESARTIG.filter((e) => /<(iframe|img|svg|link|style)\b/i.test(e))) {
      const p = pruefeSchnipsel(e);
      // Entweder abgelehnt - oder das fremde Element steht nachweislich nicht
      // in der Ausgabe.
      if (p.ok) {
        const html = renderToStaticMarkup(<Skripte platz="einwilligung" inhalt={e} />);
        expect(/<(iframe|img|svg|link|style)\b/i.test(html)).toBe(false);
      }
    }
  });
});
