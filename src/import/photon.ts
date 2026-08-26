/**
 * Anbindung an Photon (photon.komoot.io), den OSM-Geocoder von Komoot.
 *
 * Gewählt, weil er ausdrücklich für höhere Lasten gedacht und selbst betreibbar
 * ist. Nominatim liefert genauer — im Test das Schulgebäude statt der
 * Bushaltestelle davor —, seine Nutzungsbedingungen sehen Massenabfragen aber
 * nicht gern. Für die Kartenanzeige reichen Photons rund 40 m Abweichung, für
 * die 150-km-Prüfung ohnehin.
 *
 * Der Dienst ist austauschbar: alles hier erfüllt die Schnittstelle `Geocoder`
 * aus `geokodierung.ts`. Ein Wechsel auf eine selbst betriebene Instanz ist
 * eine geänderte Basis-URL.
 */

import type { Geocoder, Koordinate } from "./geokodierung";

export interface PhotonEinstellungen {
  readonly basis?: string;
  /** Anfragen je Sekunde. Bewusst zurückhaltend gegenüber einem fremden Dienst. */
  readonly proSekunde?: number;
  readonly kennung?: string;
  readonly versuche?: number;
  /** Nur für Tests. */
  readonly holen?: typeof fetch;
  readonly warten?: (ms: number) => Promise<void>;
}

interface PhotonAntwort {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, unknown>;
  }>;
}

const schlaf = (ms: number) => new Promise<void>((f) => setTimeout(f, ms));

export class PhotonGeocoder implements Geocoder {
  readonly name = "Photon";
  private readonly basis: string;
  private readonly abstandMs: number;
  private readonly kennung: string;
  private readonly versuche: number;
  private readonly holen: typeof fetch;
  private readonly warten: (ms: number) => Promise<void>;
  private naechsteAnfrageAb = 0;

  /** Zähler für den Abschlussbericht. */
  anfragen = 0;
  treffer = 0;
  fehler = 0;

  constructor(e: PhotonEinstellungen = {}) {
    this.basis = e.basis ?? "https://photon.komoot.io/api/";
    this.abstandMs = Math.ceil(1000 / (e.proSekunde ?? 2));
    this.kennung = e.kennung ?? "schulindex-import/0.1 (kontakt@schulindex.com)";
    this.versuche = e.versuche ?? 3;
    this.holen = e.holen ?? fetch;
    this.warten = e.warten ?? schlaf;
  }

  /** Hält den Mindestabstand zwischen zwei Anfragen ein. */
  private async takt(): Promise<void> {
    const jetzt = Date.now();
    if (jetzt < this.naechsteAnfrageAb) await this.warten(this.naechsteAnfrageAb - jetzt);
    this.naechsteAnfrageAb = Math.max(jetzt, this.naechsteAnfrageAb) + this.abstandMs;
  }

  async suche(anfrage: string): Promise<Koordinate | null> {
    const url = `${this.basis}?${new URLSearchParams({
      q: anfrage,
      limit: "1",
      lang: "de",
      // Photon kennt keinen Ländercode-Filter, wohl aber eine Gewichtung um
      // einen Punkt. Die Mitte Deutschlands zieht Treffer ins Inland; die
      // eigentliche Absicherung bleibt die Plausibilitätsprüfung.
      lat: "51.16",
      lon: "10.45",
    })}`;

    for (let versuch = 1; versuch <= this.versuche; versuch++) {
      await this.takt();
      this.anfragen++;
      try {
        const antwort = await this.holen(url, { headers: { "user-agent": this.kennung } });

        // Zu viele Anfragen oder Serverfehler: abwarten und erneut versuchen.
        if (antwort.status === 429 || antwort.status >= 500) {
          if (versuch === this.versuche) {
            this.fehler++;
            return null;
          }
          await this.warten(2 ** versuch * 1000);
          continue;
        }
        if (!antwort.ok) {
          this.fehler++;
          return null;
        }

        const daten = (await antwort.json()) as PhotonAntwort;
        const punkt = daten.features?.[0]?.geometry?.coordinates;
        if (!punkt || punkt.length < 2) return null;

        // Achtung: GeoJSON führt [Länge, Breite] — nicht umgekehrt.
        const [lon, lat] = punkt;
        this.treffer++;
        const plz = daten.features?.[0]?.properties?.["postcode"];
        return { lat, lon, plz: typeof plz === "string" ? plz : null };
      } catch {
        if (versuch === this.versuche) {
          this.fehler++;
          return null;
        }
        await this.warten(2 ** versuch * 1000);
      }
    }
    return null;
  }
}

/**
 * Legt einen Zwischenspeicher um einen Geocoder.
 *
 * Der Lauf über 6.207 Schulen dauert je nach Takt eine halbe bis zwei Stunden.
 * Bricht er ab, soll der nächste Versuch nicht bei null anfangen — und
 * dieselbe Anfrage soll einen fremden Dienst nicht zweimal belasten.
 */
export function mitZwischenspeicher(
  geocoder: Geocoder,
  speicher: Map<string, Koordinate | null>,
): Geocoder {
  return {
    name: `${geocoder.name} (zwischengespeichert)`,
    async suche(anfrage: string) {
      if (speicher.has(anfrage)) return speicher.get(anfrage) ?? null;
      const ergebnis = await geocoder.suche(anfrage);
      speicher.set(anfrage, ergebnis);
      return ergebnis;
    },
  };
}
