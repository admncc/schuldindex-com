import { describe, expect, it } from "vitest";
import { HOECHSTLAENGE, hostsAus, pruefeSchnipsel } from "./einbettung";

/** So sieht der Schnipsel eines CMP-Anbieters aus: erst ein Stub, dann der Lader. */
const CMP = `
<script type="text/javascript" async=true>
(function() {
  var host = 'schulindex.com';
  window.__tcfapi = window.__tcfapi || function() {};
})();
</script>
<script async src="https://cmp.inmobi.com/choice/abc123/schulindex.com/choice.js"></script>
`;

function nimmAn(roh: string) {
  const p = pruefeSchnipsel(roh);
  if (!p.ok) throw new Error(`unerwartet abgelehnt: ${p.meldung}`);
  return p;
}

function lehntAb(roh: string): string {
  const p = pruefeSchnipsel(roh);
  if (p.ok) throw new Error("unerwartet angenommen");
  return p.meldung;
}

describe("pruefeSchnipsel", () => {
  it("nimmt den Schnipsel eines CMP-Anbieters an und nennt den Host", () => {
    const p = nimmAn(CMP);
    expect(p.skripte).toHaveLength(2);
    expect(p.skripte[0]!.src).toBeNull();
    expect(p.skripte[0]!.code).toContain("__tcfapi");
    expect(p.skripte[1]!.src).toBe("https://cmp.inmobi.com/choice/abc123/schulindex.com/choice.js");
    expect(p.skripte[1]!.attribute).toHaveProperty("async");
    expect(p.hosts).toEqual(["cmp.inmobi.com"]);
    expect(p.hinweise).toEqual([]);
  });

  it("nimmt den gtag-Schnipsel an", () => {
    const p = nimmAn(
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>\n' +
        "<script>window.dataLayer = window.dataLayer || [];</script>",
    );
    expect(p.hosts).toEqual(["www.googletagmanager.com"]);
  });

  it("hält ein leeres Feld für „nichts eingebettet“, nicht für einen Fehler", () => {
    const p = nimmAn("   \n  ");
    expect(p.skripte).toEqual([]);
    expect(p.hosts).toEqual([]);
  });

  // Der eigentliche Zweck der Prüfung: Das Feld darf kein Einfallstor sein.
  it("lehnt alles ab, was kein Skript ist", () => {
    expect(lehntAb('<iframe src="https://example.com"></iframe>')).toContain("<iframe>");
    expect(lehntAb('<img src=x onerror="alert(1)">')).toContain("<img>");
    expect(lehntAb('<link rel="stylesheet" href="https://example.com/a.css">')).toContain("<link>");
    expect(lehntAb("<style>body{display:none}</style>")).toContain("<style>");
  });

  it("lehnt Ereignisattribute an einem Skript ab", () => {
    expect(lehntAb('<script src="https://a.example/b.js" onload="alert(1)"></script>')).toContain(
      "onload",
    );
  });

  it("lehnt unbekannte Attribute ab, erlaubt aber data-*", () => {
    expect(lehntAb('<script src="https://a.example/b.js" srcdoc="x"></script>')).toContain("srcdoc");
    const p = nimmAn('<script src="https://a.example/b.js" data-cmp-ab="1"></script>');
    expect(p.skripte[0]!.attribute["data-cmp-ab"]).toBe("1");
  });

  it("verlangt https und eine vollständige Adresse", () => {
    expect(lehntAb('<script src="http://a.example/b.js"></script>')).toContain("http:");
    expect(lehntAb('<script src="//a.example/b.js"></script>')).toContain("https://");
    expect(lehntAb('<script src="/lokal.js"></script>')).toContain("https://");
    expect(lehntAb("<script src=\"javascript:alert(1)\"></script>")).toContain("javascript:");
  });

  it("lehnt ein Skript mit src und Code zugleich ab", () => {
    // Der Browser würde den Code stillschweigend verwerfen - der Betreiber
    // soll nicht glauben, er laufe.
    expect(lehntAb('<script src="https://a.example/b.js">init()</script>')).toContain("verwerfen");
  });

  it("lehnt Text zwischen den Skripten ab", () => {
    expect(lehntAb('Hier einfügen: <script src="https://a.example/b.js"></script>')).toContain(
      "Text",
    );
  });

  it("lehnt ein nicht geschlossenes Skript ab", () => {
    expect(lehntAb('<script src="https://a.example/b.js">')).toContain("</script>");
  });

  it("lässt Kommentare durch und verwirft <noscript> mit Hinweis", () => {
    const p = nimmAn(
      "<!-- Google Tag Manager -->\n" +
        '<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>\n' +
        '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>',
    );
    expect(p.skripte).toHaveLength(1);
    expect(p.hinweise.join(" ")).toContain("noscript");
  });

  it("warnt vor document.write, ohne abzulehnen", () => {
    const p = nimmAn("<script>document.write('<b>x</b>')</script>");
    expect(p.hinweise.join(" ")).toContain("document.write");
  });

  it("löst HTML-Entitäten in Attributwerten auf", () => {
    // Schnipsel von Tag-Verwaltungen tragen ihre Parameter regelmaessig als
    // `&amp;`. Roh weitergereicht laedt der Browser eine Adresse mit einem
    // literalen „&amp;" darin - das Banner erscheint dann nicht.
    const p = nimmAn('<script src="https://a.example/b.js?id=X&amp;v=2"></script>');
    expect(p.skripte[0]!.src).toBe("https://a.example/b.js?id=X&v=2");

    const q = nimmAn('<script src="https://a.example/b.js" data-t="A&quot;B"></script>');
    expect(q.skripte[0]!.attribute["data-t"]).toBe('A"B');
  });

  it("fängt ein als Entität verstecktes </script ab", () => {
    // Die Auflösung laeuft **vor** der Pruefung - sonst kaeme ein
    // `&lt;/script&gt;` ungeprueft durch und braeche beim Ausliefern aus dem
    // umgebenden Element aus.
    expect(
      lehntAb('<script src="https://a.example/b.js" data-x="&lt;/script&gt;"></script>'),
    ).toContain("</script");
  });

  it("lehnt einen Ausbruch über </script ab", () => {
    // `</script >` zaehlt in HTML als Schluss-Tag, der Zerleger schneidet aber
    // nur bei `</script>`. Ohne diese Regel kaeme der Rest als HTML in die
    // Seite - und damit waere die Prueferei umgangen.
    expect(lehntAb("<script>var a = '</script >';</script>")).toContain("</script");
    // In einem Attributwert faellt derselbe Versuch schon der
    // Attributzerlegung auf - die Begruendung lautet dann anders, abgelehnt
    // wird er trotzdem, und darauf kommt es an.
    lehntAb('<script src="https://a.example/b.js" data-x="</script >"></script>');
  });

  it("begrenzt die Länge", () => {
    const lang = "<script>" + "a".repeat(HOECHSTLAENGE) + "</script>";
    expect(lehntAb(lang)).toContain(String(HOECHSTLAENGE));
  });

  it("lehnt Steuerzeichen ab", () => {
    expect(lehntAb(`<script>var a = 1${String.fromCharCode(0x2028)}</script>`)).toContain(
      "Steuerzeichen",
    );
  });
});

describe("hostsAus", () => {
  it("fasst die Hosts mehrerer Schnipsel zusammen und übergeht Unlesbares", () => {
    expect(hostsAus([CMP, '<script src="https://www.googletagmanager.com/gtag/js"></script>', "<iframe>"]))
      .toEqual(["cmp.inmobi.com", "www.googletagmanager.com"]);
  });
});
