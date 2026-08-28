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

export async function GET(anfrage: Request): Promise<Response> {
  const roh = new URL(anfrage.url).searchParams.get("bundesland");
  const bundesland: Bundesland | null = roh !== null && istBundesland(roh) ? roh : null;

  const ausschnitt = ausschnittFuer(bundesland);
  const feld = bildfeld(ausschnitt, BREITE);
  const zellen = await rasterpunkte(ausschnitt, rasterweite(ausschnitt));

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

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Der Schulbestand ändert sich mit dem Import, nicht mit der Minute.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
