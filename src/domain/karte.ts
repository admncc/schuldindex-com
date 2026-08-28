/**
 * Projektion für die Schulkarte.
 *
 * **Warum keine Kartenkacheln.** Eine Karte von MapTiler, Mapbox oder direkt
 * von openstreetmap.org lädt beim Betrachter Bilder von einem fremden Server -
 * und schickt dabei dessen IP-Adresse dorthin. Für ein Portal, dessen Nutzerkreis
 * überwiegend minderjährig ist, ist das dieselbe Frage wie bei den
 * Google-Schriften, die aus genau diesem Grund geflogen sind (LG München I,
 * 3 O 17493/20). Selbst gehostete Kacheln für Deutschland sind mehrere hundert
 * Gigabyte.
 *
 * Also andersherum gedacht: Wozu braucht die Karte einen Hintergrund? Um zu
 * zeigen, wo die Schulen sind. Das leisten 31.770 Punkte selbst - bei dieser
 * Dichte zeichnet der Schulbestand die Umrisse des Landes, die Ballungsräume
 * und die dünn besiedelten Gegenden von allein. Kein fremder Server, keine
 * Kachelkosten, kein Nachladen beim Verschieben.
 *
 * Gerechnet wird in Web-Mercator. Für Deutschland zwischen 47° und 55° Nord
 * wäre eine einfache Streckung fast ebenso gut - „fast“ heißt hier: das Land
 * sähe rund fünf Prozent zu breit aus, und jeder, der eine Deutschlandkarte
 * kennt, sieht das.
 */

import { UMRISSE, type Bundesland } from "./bundesland";

export interface Ausschnitt {
  readonly sued: number;
  readonly nord: number;
  readonly west: number;
  readonly ost: number;
}

/**
 * Ganz Deutschland, mit etwas Luft an den Rändern.
 *
 * Die Ränder sind so gewählt, dass jeder Landesausschnitt samt seiner Luft noch
 * hineinpasst - sonst ragte Bayern unten heraus.
 */
export const DEUTSCHLAND: Ausschnitt = { sued: 47.1, nord: 55.25, west: 5.7, ost: 15.25 };

export function ausschnittFuer(bundesland: Bundesland | null, luft = 0.15): Ausschnitt {
  if (bundesland === null) return DEUTSCHLAND;
  const [sued, nord, west, ost] = UMRISSE[bundesland];
  return { sued: sued - luft, nord: nord + luft, west: west - luft, ost: ost + luft };
}

/**
 * Mercator-Abszisse: der Längengrad im Bogenmaß.
 *
 * Das Bogenmaß ist hier keine Förmlichkeit. `mercatorY` liefert Bogenmaß, und
 * beide Achsen müssen dieselbe Einheit haben - sonst stimmt das Seitenverhältnis
 * nicht, und die Karte ist in der Höhe gestaucht.
 */
export function mercatorX(lon: number): number {
  return (lon * Math.PI) / 180;
}

/** Mercator-Ordinate. */
export function mercatorY(lat: number): number {
  const begrenzt = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (begrenzt * Math.PI) / 360));
}

export interface Bildfeld {
  readonly breite: number;
  readonly hoehe: number;
}

export interface Punkt {
  readonly x: number;
  readonly y: number;
}

/**
 * Passt die Bildhöhe an den Ausschnitt an.
 *
 * Damit bleibt das Seitenverhältnis das der Projektion - Deutschland ist höher
 * als breit, Nordrhein-Westfalen breiter als hoch. Eine feste Höhe würde beides
 * in dasselbe Rechteck quetschen.
 */
export function bildfeld(ausschnitt: Ausschnitt, breite: number): Bildfeld {
  const dx = mercatorX(ausschnitt.ost) - mercatorX(ausschnitt.west);
  const dy = mercatorY(ausschnitt.nord) - mercatorY(ausschnitt.sued);
  return { breite, hoehe: Math.round((breite * dy) / dx) };
}

/** Geografische Koordinate → Bildkoordinate. */
export function projiziere(lat: number, lon: number, ausschnitt: Ausschnitt, feld: Bildfeld): Punkt {
  const links = mercatorX(ausschnitt.west);
  const rechts = mercatorX(ausschnitt.ost);
  const x = ((mercatorX(lon) - links) / (rechts - links)) * feld.breite;
  const oben = mercatorY(ausschnitt.nord);
  const unten = mercatorY(ausschnitt.sued);
  // y wächst im Bild nach unten, die Breite nach oben - daher die Umkehrung.
  const y = ((oben - mercatorY(lat)) / (oben - unten)) * feld.hoehe;
  return { x, y };
}

export function liegtImAusschnitt(lat: number, lon: number, a: Ausschnitt): boolean {
  return lat >= a.sued && lat <= a.nord && lon >= a.west && lon <= a.ost;
}

/**
 * Kantenlänge der Zellen, in die die Schulen für die Anzeige gebündelt werden.
 *
 * 31.770 einzelne Kreise wären eine SVG-Datei von mehreren Megabyte, die jeder
 * Aufruf neu überträgt. Gebündelt auf ein Raster bleiben je nach Ausschnitt
 * wenige tausend Punkte - und weil die Punktgröße mit der Zahl der Schulen
 * wächst, sieht man die Ballungsräume danach besser als vorher.
 */
export function rasterweite(ausschnitt: Ausschnitt): number {
  const spanne = ausschnitt.ost - ausschnitt.west;
  if (spanne > 6) return 0.05; // ganz Deutschland
  if (spanne > 2.5) return 0.02; // Flächenland
  return 0.008; // Stadtstaat
}

/** Punktradius nach Zahl der Schulen in der Zelle. */
export function punktradius(anzahl: number): number {
  // Wurzel statt linear: sonst überdeckt eine Zelle mit 40 Schulen halb München.
  return Math.min(4.5, 0.9 + Math.sqrt(anzahl) * 0.55);
}
