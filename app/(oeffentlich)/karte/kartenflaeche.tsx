"use client";

import { useEffect, useMemo, useRef, useState } from "react";
/**
 * **MapLibre 5, nicht 6.** Mit Fassung 6 blieb die Karte leer: Der Arbeiter,
 * in dem MapLibre Quellen auswertet, kam unter dem Bündler von Next nicht
 * hoch - weder die Vektorkacheln noch die eigene Punktquelle luden, und zwar
 * ohne eine einzige Fehlermeldung. Mit 5.24 lädt beides.
 */
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as Karte, MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { kartenstil } from "@/domain/kartenstil";
import { scorestufe } from "@/domain/scoring";
import type { Ausschnitt } from "@/domain/karte";
import type { BewerteteSchule } from "@/db/karte";

/**
 * Die Kartenfläche mit echtem Kartenhintergrund.
 *
 * **Alles kommt aus dem eigenen Haus.** Die Vektorkacheln liegen als eine Datei
 * auf unserem Server, die Zeichenbilder daneben; der Browser holt daraus über
 * `Range` genau die Bereiche für den sichtbaren Ausschnitt. Keine Kachel, kein
 * Zeichensatz, kein Zählpixel von einem fremden Server - was auch bedeutet:
 * kein Einwilligungsbanner, weil nichts übertragen wird, wofür es eine
 * Einwilligung bräuchte (§ 25 Abs. 2 Nr. 2 TDDDG).
 *
 * **Der Standort verlässt das Gerät nicht.** „In meiner Nähe“ fragt den Browser
 * nach der Position; gerechnet wird damit hier. An den Server geht davon
 * nichts - er könnte damit auch nichts anfangen, ausser es zu speichern.
 */

const LEER: FeatureCollection = { type: "FeatureCollection", features: [] };

function dunkelGewaehlt(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function sammlung(schulen: readonly BewerteteSchule[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: schulen.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: {
        slug: s.slug,
        name: s.name,
        ort: s.ort ?? "",
        stufe: scorestufe(Number(s.gesamtscore)),
        anzahl: s.anzahl,
      },
    })),
  };
}

function standortsammlung(standort: { lat: number; lon: number } | null): FeatureCollection {
  if (standort === null) return LEER;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [standort.lon, standort.lat] },
        properties: {},
      },
    ],
  };
}

export default function Kartenflaeche({
  schulen,
  ausschnitt,
  standort,
  gewaehlt,
  aufWahl,
}: {
  schulen: readonly BewerteteSchule[];
  ausschnitt: Ausschnitt;
  standort: { lat: number; lon: number } | null;
  gewaehlt: string | null;
  aufWahl: (slug: string | null) => void;
}) {
  const behaelter = useRef<HTMLDivElement>(null);
  const karte = useRef<Karte | null>(null);
  const [dunkel, setzeDunkel] = useState(dunkelGewaehlt);

  const punkte = useMemo(() => sammlung(schulen), [schulen]);
  const ort = useMemo(() => standortsammlung(standort), [standort]);

  /**
   * Die neuesten Werte für Rückrufe, die nur einmal angemeldet werden.
   *
   * Ohne diese Ablage müsste der Klickrückruf bei jeder Auswahl neu angemeldet
   * werden - und zwischen Abmelden und Anmelden geht ein Klick verloren.
   */
  const frisch = useRef({ punkte, ort, gewaehlt, aufWahl });
  frisch.current = { punkte, ort, gewaehlt, aufWahl };

  // Das PMTiles-Protokoll einmal je Seite anmelden. MapLibre führt eine
  // globale Liste; ein zweites Anmelden desselben Namens wirft.
  useEffect(() => {
    const protokoll = new Protocol();
    maplibregl.addProtocol("pmtiles", protokoll.tile);
    return () => maplibregl.removeProtocol("pmtiles");
  }, []);

  useEffect(() => {
    const medium = window.matchMedia("(prefers-color-scheme: dark)");
    const beiWechsel = () => setzeDunkel(medium.matches);
    medium.addEventListener("change", beiWechsel);
    return () => medium.removeEventListener("change", beiWechsel);
  }, []);

  useEffect(() => {
    if (behaelter.current === null) return;

    const k = new maplibregl.Map({
      container: behaelter.current,
      style: kartenstil({
        dunkel: dunkelGewaehlt(),
        schulen: frisch.current.punkte,
        standort: frisch.current.ort,
        gewaehlt: frisch.current.gewaehlt,
      }),
      bounds: [ausschnitt.west, ausschnitt.sued, ausschnitt.ost, ausschnitt.nord],
      fitBoundsOptions: { padding: 16 },
      maxZoom: 17,
      // Die Kacheln decken Deutschland ab. Ohne diese Grenze schiebt man die
      // Karte nach Polen und sieht eine graue Fläche - was wie ein Fehler
      // aussieht und keiner ist.
      maxBounds: [
        [3.5, 45.5],
        [17.5, 56.5],
      ],
      attributionControl: { compact: true },
      // Die Tastaturbedienung ist hier kein Zusatz: Ohne sie wäre die Karte
      // für einen Teil der Leute nur über die Liste daneben erreichbar.
      keyboard: true,
    });

    k.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    k.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    const beiKlick = (e: MapMouseEvent) => {
      const treffer = k.queryRenderedFeatures(e.point, { layers: ["bewertet"] });
      const slug = treffer[0]?.properties?.["slug"];
      frisch.current.aufWahl(typeof slug === "string" ? slug : null);
    };
    const beiZeiger = (e: MapMouseEvent) => {
      const treffer = k.queryRenderedFeatures(e.point, { layers: ["bewertet"] });
      k.getCanvas().style.cursor = treffer.length > 0 ? "pointer" : "";
    };
    k.on("click", beiKlick);
    k.on("mousemove", beiZeiger);

    // Ein fehlendes oder beschädigtes Kachelarchiv ist ein
    // Einrichtungszustand, kein Absturz. Die Fläche bleibt dann in der
    // Grundfarbe, die Schulen liegen trotzdem darauf, und die Liste daneben
    // arbeitet weiter.
    k.on("error", () => {});

    karte.current = k;
    return () => {
      k.remove();
      karte.current = null;
    };
    // Bewusst nur einmal: Ein Neuaufbau bei jedem Filterklick liesse die Karte
    // jedes Mal zurückspringen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Farbschema wechseln, ohne die Kameraposition zu verlieren. */
  useEffect(() => {
    karte.current?.setStyle(kartenstil({ dunkel, schulen: punkte, standort: ort, gewaehlt }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dunkel]);

  /** Gefilterte Punkte und Standort nachziehen. */
  useEffect(() => {
    const k = karte.current;
    if (k === null) return;
    (k.getSource("bewertet") as GeoJSONSource | undefined)?.setData(punkte);
    (k.getSource("standort") as GeoJSONSource | undefined)?.setData(ort);
  }, [punkte, ort]);

  /** Die Auswahl dicker umranden. */
  useEffect(() => {
    const k = karte.current;
    if (k === null || k.getLayer("bewertet") === undefined) return;
    k.setPaintProperty("bewertet", "circle-stroke-width", [
      "case",
      ["==", ["get", "slug"], gewaehlt ?? ""],
      3.5,
      1.5,
    ]);
  }, [gewaehlt]);

  /** Auf die gewählte Schule schwenken - aber nur, wenn sie ausserhalb liegt. */
  useEffect(() => {
    const k = karte.current;
    if (k === null || gewaehlt === null) return;
    const s = schulen.find((x) => x.slug === gewaehlt);
    if (s === undefined || k.getBounds().contains([s.lon, s.lat])) return;
    k.easeTo({ center: [s.lon, s.lat], duration: 500 });
  }, [gewaehlt, schulen]);

  /** Auf den eigenen Standort zoomen, sobald er das erste Mal vorliegt. */
  useEffect(() => {
    if (standort === null) return;
    karte.current?.easeTo({ center: [standort.lon, standort.lat], zoom: 10, duration: 700 });
  }, [standort]);

  return (
    <div className="karte-flaeche" ref={behaelter} role="application" aria-label="Karte der Schulen" />
  );
}
