/**
 * Entfernungsprüfung bei der Abgabe einer Bewertung.
 *
 * Die Regel: liegt der Absender weiter als 150 km von der Schule entfernt, geht
 * die Bewertung in die Moderation statt direkt online (Entscheidung vom
 * 26.08.2026, einheitlich, ohne Sonderregeln je Schulart).
 *
 * **Die IP wird nie gespeichert.** Sie existiert nur im Request, wird dort
 * geolokalisiert, und in die Datenbank wandert allein das Ergebnis: Entfernung,
 * Bundesland, Konfidenz. Die Moderation braucht die Entfernung, nicht die Adresse.
 */

import type { Bundesland } from "./bundesland";

export interface Punkt {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Erdradius — bewusst derselbe Wert, den Postgres' `earthdistance` verwendet.
 *
 * Die Erweiterung rechnet mit dem Äquatorradius (6378,168 km), nicht mit dem
 * mittleren (6371,0088 km). Der Unterschied beträgt 0,11 % — auf 600 km rund
 * 670 Meter. Für die 150-km-Grenze ist das bedeutungslos, für die
 * Nachvollziehbarkeit nicht: die Anwendung prüft die Entfernung bei der Abgabe,
 * die Datenbank bei der Umkreissuche. Rechnen beide unterschiedlich, kann
 * dieselbe Schule je nach Weg drin oder draußen liegen.
 *
 * Deshalb gilt hier der Wert der Datenbank, nicht der theoretisch bessere.
 * Ein Test in `scripts/pruefe-koordinaten.test.ts` hält beide zusammen.
 */
const ERDRADIUS_KM = 6378.168;

const imBogenmass = (grad: number) => (grad * Math.PI) / 180;

/**
 * Großkreisentfernung nach der Haversine-Formel.
 *
 * Bewusst hier und nicht in der Datenbank: bei der Abgabe liegen beide Punkte
 * ohnehin vor, ein Datenbankbesuch wäre reine Latenz. Ein Test gleicht das
 * Ergebnis gegen `earth_distance` aus Postgres ab, damit beide Wege nicht
 * auseinanderlaufen.
 */
export function entfernungKm(a: Punkt, b: Punkt): number {
  const dLat = imBogenmass(b.lat - a.lat);
  const dLon = imBogenmass(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(imBogenmass(a.lat)) * Math.cos(imBogenmass(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const SCHWELLE_KM = 150;

export interface Einreichung {
  /** Standort des Absenders, `null` wenn die Geolokalisierung nichts ergab. */
  readonly absender: Punkt | null;
  /** Standort der Schule, `null` solange sie nicht geokodiert ist. */
  readonly schule: Punkt | null;
  readonly bundeslandAbsender?: Bundesland | null;
}

export interface Geobefund {
  readonly entfernungKm: number | null;
  readonly unbekannt: boolean;
  /** true, wenn die Bewertung wegen der Entfernung in die Moderation muss. */
  readonly haltenWegenEntfernung: boolean;
  readonly begruendung: string | null;
}

/**
 * Wertet eine Einreichung aus.
 *
 * Zwei Fälle führen ebenfalls in die Moderation, obwohl keine Entfernung
 * vorliegt:
 *
 *  - **Absender nicht lokalisierbar** (Proxy, VPN, unbekannter Adressbereich).
 *    Das ist genau das Verhalten, das eine Kampagne zeigt.
 *  - **Schule ohne Koordinate.** Betrifft aktuell noch Schulen, deren
 *    Nachgeocodierung nichts ergab. Ohne Bezugspunkt lässt sich nichts prüfen —
 *    die Bewertung ungeprüft durchzulassen wäre die schlechtere Wahl.
 */
export function pruefeEinreichung(e: Einreichung, schwelleKm = SCHWELLE_KM): Geobefund {
  if (e.schule === null) {
    return {
      entfernungKm: null,
      unbekannt: true,
      haltenWegenEntfernung: true,
      begruendung: "Schule ohne Koordinate — Entfernung nicht prüfbar",
    };
  }
  if (e.absender === null) {
    return {
      entfernungKm: null,
      unbekannt: true,
      haltenWegenEntfernung: true,
      begruendung: "Absender nicht lokalisierbar",
    };
  }

  const km = entfernungKm(e.absender, e.schule);
  const zuWeit = km > schwelleKm;
  return {
    entfernungKm: Math.round(km * 10) / 10,
    unbekannt: false,
    haltenWegenEntfernung: zuWeit,
    begruendung: zuWeit ? `${Math.round(km)} km entfernt, Grenze ${schwelleKm} km` : null,
  };
}
