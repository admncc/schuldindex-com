import { gzipSync } from "node:zlib";
import { istBundesland, type Bundesland } from "@/domain/bundesland";
import { ausschnittFuer, bildfeld, projiziere, punktradius, rasterweite } from "@/domain/karte";
import { rasterpunkte } from "@/db/karte";

/**
 * Die Bestandsebene der Karte als eigene SVG-Datei.
 *
 * Sie war zuerst Teil der Seite. Das ergab eine HTML-Antwort von 3,4 MB: rund
 * elftausend Punkte, und weil React sie zusätzlich in seine eigene Nutzlast
 * schreibt, standen sie zweimal darin.
 *
 * Als eigene Datei wird sie einmal geladen, vom Browser zwischengespeichert und
 * beim nächsten Aufruf nicht erneut übertragen. Die Seite selbst bleibt klein
 * und trägt nur noch die bewerteten Schulen - die, auf die jemand klickt.
 *
 * Gleicher Ursprung, kein fremder Server: die Datei kommt aus derselben
 * Anwendung wie die Seite.
 */
export const dynamic = "force-dynamic";

const BREITE = 800;

/**
 * Fertig gepackt im Arbeitsspeicher, je Bundesland eine Fassung.
 *
 * **Warum ueberhaupt gepackt.** Die Datei ging mit 144 KB unkomprimiert
 * hinaus - gemessen ueber die Leitung, ohne `content-encoding`. Als XML laesst
 * sie sich auf 37 KB packen, ein Viertel. Auf der Startseite, die sie als
 * Hintergrund traegt, war sie damit mehr als die Haelfte des ganzen
 * Seitengewichts, und die Startseite ist der Einstieg fuer jeden Klick aus
 * einer Story. Next packt sie nicht selbst: Was ein Route Handler als
 * `Response` zurueckgibt, laeuft an der eingebauten Kompression vorbei.
 *
 * **Warum zwischengespeichert.** Der Bestand aendert sich mit dem Import, nicht
 * mit der Minute - dieselbe Begruendung, die schon in `cache-control` steht.
 * Ohne den Speicher kostete jeder Aufruf eine Rasterabfrage ueber 31.770
 * Schulen und einen Packvorgang, und die Datei wird auf zwei Seiten geladen.
 * Siebzehn Fassungen zu je 37 KB sind gut ein halbes Megabyte - tragbar.
 */
const SPEICHERDAUER = 3600_000;
const speicher = new Map<string, { gepackt: Buffer; roh: string; bis: number }>();

export async function GET(anfrage: Request): Promise<Response> {
  const rohLand = new URL(anfrage.url).searchParams.get("bundesland");
  const bundesland: Bundesland | null =
    rohLand !== null && istBundesland(rohLand) ? rohLand : null;

  const packen = (anfrage.headers.get("accept-encoding") ?? "").includes("gzip");
  const schluessel = bundesland ?? "alle";
  const abgelegt = speicher.get(schluessel);
  if (abgelegt !== undefined && abgelegt.bis > Date.now()) {
    return antwort(abgelegt, packen);
  }

  const ausschnitt = ausschnittFuer(bundesland);
  const feld = bildfeld(ausschnitt, BREITE);
  const zellen = await rasterpunkte(ausschnitt, rasterweite(ausschnitt), bundesland);

  /**
   * Die Punkte als wenige Pfade statt als elftausend Kreise.
   *
   * Ein `<circle>` kostet rund 45 Zeichen, ein Punkt in einem Pfad rund 14: ein
   * Nullstrich (`M x y h.01`) mit runder Strichkappe ist ein Kreis vom
   * Durchmesser der Strichbreite. Nach Größe gebündelt bleiben ein halbes
   * Dutzend Pfade übrig - und ein Drittel der Dateigröße.
   */
  const nachGroesse = new Map<number, string[]>();
  for (const z of zellen) {
    const p = projiziere(z.lat, z.lon, ausschnitt, feld);
    // Auf Viertelpunkte gerundet: feiner sieht niemand, und jede Stufe mehr ist
    // ein weiterer Pfad.
    const r = Math.round(punktradius(z.anzahl) * 4) / 4;
    const eintrag = nachGroesse.get(r) ?? [];
    eintrag.push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}h.01`);
    nachGroesse.set(r, eintrag);
  }

  const punkte = [...nachGroesse.entries()]
    .map(([r, teile]) => `<path stroke-width="${r * 2}" d="${teile.join("")}"/>`)
    .join("");

  // Die Farbe kommt aus dem SVG selbst, nicht aus dem Stylesheet der Seite: ein
  // über <img> eingebundenes SVG erbt keine Stile von der einbindenden Seite.
  // Deshalb steht hier auch die Umschaltung auf das dunkle Erscheinungsbild.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${feld.breite} ${feld.hoehe}" width="${feld.breite}" height="${feld.hoehe}">`
    + `<style>path{fill:none;stroke:#aab4c6;stroke-linecap:round;opacity:.85}`
    + `@media (prefers-color-scheme:dark){path{stroke:#454e60;opacity:1}}</style>`
    + punkte
    + `</svg>`;

  const eintrag = { roh: svg, gepackt: gzipSync(svg), bis: Date.now() + SPEICHERDAUER };
  speicher.set(schluessel, eintrag);
  return antwort(eintrag, packen);
}

function antwort(
  eintrag: { gepackt: Buffer; roh: string },
  packen: boolean,
): Response {
  const kopf: Record<string, string> = {
    "content-type": "image/svg+xml; charset=utf-8",
    // Der Schulbestand ändert sich mit dem Import, nicht mit der Minute.
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    // Ohne diese Zeile legte ein Zwischenspeicher die gepackte Fassung auch
    // für einen Browser ab, der sie nicht lesen kann.
    vary: "Accept-Encoding",
  };
  if (!packen) return new Response(eintrag.roh, { headers: kopf });
  return new Response(new Uint8Array(eintrag.gepackt), {
    headers: { ...kopf, "content-encoding": "gzip" },
  });
}
