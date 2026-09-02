import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

/**
 * Der Kartenstil - in den Farben der Seite, nicht in denen der Vorlage.
 *
 * Die Ebenendefinitionen kommen aus `@protomaps/basemaps`. Das ist keine
 * Bequemlichkeit, sondern die einzige Art, die Kacheln nicht zu erraten: Das
 * Paket wird zusammen mit dem Kachelschema gepflegt, und ein handgeschriebener
 * Stil, der `source-layer` oder Feldnamen um eine Fassung verfehlt, zeichnet
 * eine leere Fläche - ohne Fehlermeldung.
 *
 * Übernommen wird also die Struktur, gesetzt werden die Farben. Eine Karte in
 * fremden Farben mitten in einer Seite sieht aus wie ein eingeklebtes Fenster;
 * es sind wenige Werte, die den Unterschied machen.
 *
 * **Zwei Schemata, weil die Seite zwei hat.** Ein heller Kartenausschnitt in
 * einer dunklen Seite blendet nachts - und die Zielgruppe ist abends am
 * Telefon unterwegs.
 */

/** Die Adressen der eigenen Auslieferung. Nichts davon liegt bei Dritten. */
export const KACHELARCHIV = "/karten/basis.pmtiles";
export const SCHRIFTEN = "/karten/schriften/{fontstack}/{range}.pbf";

interface Farbwahl {
  readonly grund: string;
  readonly land: string;
  readonly wasser: string;
  readonly gruen: string;
  readonly bebauung: string;
  readonly strasse: string;
  readonly strassenrand: string;
  readonly grenze: string;
  readonly schrift: string;
  readonly schrifthof: string;
}

/** Aus `globals.css`, hier als feste Werte: MapLibre kennt keine CSS-Variablen. */
const HELL: Farbwahl = {
  grund: "#eef1f7",
  land: "#f6f7fa",
  wasser: "#d7e3f6",
  gruen: "#e6efe6",
  bebauung: "#e7eaf1",
  strasse: "#ffffff",
  strassenrand: "#dde2ec",
  grenze: "#c3cbda",
  schrift: "#454e60",
  schrifthof: "#ffffff",
};

const DUNKEL: Farbwahl = {
  grund: "#101319",
  land: "#181c25",
  wasser: "#141d2c",
  gruen: "#161f1b",
  bebauung: "#1f242f",
  strasse: "#2a303c",
  strassenrand: "#222834",
  grenze: "#3a4252",
  schrift: "#b4bbc9",
  schrifthof: "#101319",
};

/**
 * Setzt unsere Farben in die Vorlage.
 *
 * Nur die Schlüssel, die man sieht. Die Vorlage kennt rund achtzig - Zoo,
 * Flughafen, Gletscher, Militärgelände -, und sie einzeln zu setzen hiesse,
 * bei der nächsten Fassung des Pakets achtzig Werte nachzuziehen. Was hier
 * nicht steht, bleibt in der Grundstimmung des jeweiligen Schemas und stört
 * nicht.
 */
function flavor(dunkel: boolean): ReturnType<typeof namedFlavor> {
  const f = dunkel ? DUNKEL : HELL;
  const vorlage = namedFlavor(dunkel ? "dark" : "light");

  return {
    ...vorlage,
    background: f.grund,
    /**
     * Die Bodenbedeckung wird auf einen Hauch zurückgenommen.
     *
     * Die Vorlage malt Wiese, Acker und Wald in kräftigem Grün. Auf einer
     * Übersicht über ganz Deutschland ergibt das eine grüne Fläche, auf der
     * die farbigen Punkte - das Eigentliche dieser Karte - untergehen. Die
     * Karte ist hier Hintergrund, nicht Gegenstand.
     */
    landcover: {
      grassland: f.gruen,
      farmland: f.gruen,
      forest: f.gruen,
      scrub: f.gruen,
      barren: f.land,
      glacier: f.land,
      urban_area: f.bebauung,
    },
    earth: f.land,
    water: f.wasser,
    park_a: f.gruen,
    park_b: f.gruen,
    wood_a: f.gruen,
    wood_b: f.gruen,
    scrub_a: f.gruen,
    scrub_b: f.gruen,
    buildings: f.bebauung,
    pedestrian: f.bebauung,
    industrial: f.bebauung,
    hospital: f.bebauung,
    school: f.bebauung,
    boundaries: f.grenze,
    major: f.strasse,
    minor_a: f.strasse,
    minor_b: f.strasse,
    highway: f.strasse,
    link: f.strasse,
    other: f.strassenrand,
    major_casing_early: f.strassenrand,
    major_casing_late: f.strassenrand,
    highway_casing_early: f.strassenrand,
    highway_casing_late: f.strassenrand,
    minor_casing: f.strassenrand,
    link_casing: f.strassenrand,
    city_label: f.schrift,
    city_label_halo: f.schrifthof,
    state_label: f.schrift,
    state_label_halo: f.schrifthof,
    country_label: f.schrift,
    subplace_label: f.schrift,
    subplace_label_halo: f.schrifthof,
    ocean_label: f.schrift,
    roads_label_major: f.schrift,
    roads_label_major_halo: f.schrifthof,
    roads_label_minor: f.schrift,
    roads_label_minor_halo: f.schrifthof,
  };
}

/** Die Punktfarben - dieselben wie die Ampel der Wertungen auf der Seite. */
const PUNKTFARBEN = {
  hell: { gut: "#1b6e45", mittel: "#8a5b06", schlecht: "#a32820", rand: "#ffffff" },
  dunkel: { gut: "#6dc79a", mittel: "#d9a63f", schlecht: "#e68278", rand: "#101319" },
} as const;

export interface Stilangaben {
  readonly dunkel: boolean;
  readonly schulen: FeatureCollection;
  readonly standort: FeatureCollection;
  readonly gewaehlt: string | null;
}

/**
 * Die eigenen Ebenen: der Standort und die bewerteten Schulen.
 *
 * **Sie stehen im Stil und werden nicht nachgereicht.** Der erste Entwurf legte
 * sie mit `addLayer` an, sobald die Karte geladen sei - und lieferte eine leere
 * Fläche: `addLayer` wirft, solange der Stil nicht fertig ist, und das
 * Ereignis, auf das man dafür wartet, feuert nie, wenn eine Quelle nicht
 * antwortet. Aus einem fehlenden Kachelarchiv wurde so eine Karte ganz ohne
 * Schulen. Im Stil gibt es diesen Zeitpunkt nicht: Was dort steht, ist da,
 * sobald irgendetwas gezeichnet wird.
 */
function eigeneEbenen(a: Stilangaben): LayerSpecification[] {
  const f = a.dunkel ? PUNKTFARBEN.dunkel : PUNKTFARBEN.hell;

  return [
    {
      id: "standort-hof",
      type: "circle",
      source: "standort",
      paint: { "circle-radius": 18, "circle-color": f.gut, "circle-opacity": 0.16 },
    },
    {
      id: "standort-kern",
      type: "circle",
      source: "standort",
      paint: {
        "circle-radius": 5,
        "circle-color": f.gut,
        "circle-stroke-width": 2,
        "circle-stroke-color": f.rand,
      },
    },
    {
      id: "bewertet",
      type: "circle",
      source: "bewertet",
      paint: {
        // Grösse nach Zahl der Bewertungen, gedeckelt: Eine Schule mit 400
        // Bewertungen ist wichtiger als eine mit 12, aber nicht dreissigmal so
        // gross. Dazu wachsen die Punkte mit dem Zoom, damit sie beim
        // Hineinzoomen nicht zu Stecknadelköpfen werden.
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          ["+", 3.5, ["min", 4, ["*", 2, ["log10", ["max", 1, ["get", "anzahl"]]]]]],
          12,
          ["+", 8, ["min", 8, ["*", 4, ["log10", ["max", 1, ["get", "anzahl"]]]]]],
        ],
        "circle-color": [
          "match",
          ["get", "stufe"],
          "gut",
          f.gut,
          "mittel",
          f.mittel,
          f.schlecht,
        ],
        "circle-stroke-color": f.rand,
        "circle-stroke-width": ["case", ["==", ["get", "slug"], a.gewaehlt ?? ""], 3.5, 1.5],
        "circle-opacity": 0.92,
      },
    },
  ];
}

/**
 * Der vollständige Stil.
 *
 * `attribution` steht fest im Stil und nicht in einer Fussnote: Die
 * OpenStreetMap-Daten stehen unter der ODbL, und die verlangt den Hinweis
 * dort, wo die Karte ist.
 */
export function kartenstil(a: Stilangaben): StyleSpecification {
  return {
    version: 8,
    glyphs: SCHRIFTEN,
    sources: {
      basis: {
        type: "vector",
        url: `pmtiles://${KACHELARCHIV}`,
        attribution:
          '<a href="https://openstreetmap.org/copyright" rel="noreferrer">© OpenStreetMap</a>',
      },
      bewertet: { type: "geojson", data: a.schulen },
      standort: { type: "geojson", data: a.standort },
    },
    layers: [...layers("basis", flavor(a.dunkel), { lang: "de" }), ...eigeneEbenen(a)],
  } as StyleSpecification;
}
