/**
 * Führt einen Rohdatensatz aus jedeschule.codefor.de in die Form des Portals über.
 *
 * Bündelt Schulart-Zuordnung, Bundesland, Adresse, Koordinate und Suchtext.
 * Die Slug-Vergabe geschieht getrennt (`slug.ts`), weil sie den gesamten Bestand
 * zugleich betrachten muss.
 */

import { bundeslandAusId, type Bundesland } from "../domain/bundesland.js";
import { liegtImBundesland } from "./geokodierung.js";
import { ordneSchulartZu, type Schulart } from "./schulart.js";
import { slugify } from "./slug.js";

/** Felder der Quelle, soweit wir sie verwenden. */
export interface Rohschule {
  readonly id: string;
  readonly name?: string | null;
  readonly address?: string | null;
  readonly address2?: string | null;
  readonly zip?: string | null;
  readonly city?: string | null;
  readonly provider?: string | null;
  readonly school_type?: string | null;
  readonly website?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly update_timestamp?: string | null;
}

export type Koordinatengenauigkeit = "quelle" | "adresse" | "plz" | "ort";

export interface Schule {
  readonly quellId: string;
  readonly name: string;
  readonly schularten: readonly Schulart[];
  readonly schulartOriginal: string | null;
  readonly bundesland: Bundesland;
  readonly strasse: string | null;
  readonly plz: string | null;
  readonly ort: string | null;
  readonly traeger: string | null;
  readonly website: string | null;
  readonly telefon: string | null;
  readonly email: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly genauigkeit: Koordinatengenauigkeit | null;
  readonly suchtext: string;
  readonly quelleStand: string | null;
  /** Vermerkt, wenn die Koordinate der Quelle repariert oder verworfen wurde. */
  readonly koordinatenbefund: Koordinatenbefund["art"];
}

export type Verwerfungsgrund = "keine Schule" | "kein Bundesland" | "kein Name";

export type Normalisierungsergebnis =
  | { readonly ok: true; readonly schule: Schule }
  | { readonly ok: false; readonly grund: Verwerfungsgrund; readonly quellId: string };

function saeubere(wert: string | null | undefined): string | null {
  if (wert == null) return null;
  const s = wert.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Website mit Schema versehen — die Quelle liefert teils nur `www.…`. */
function normalisiereWebsite(wert: string | null): string | null {
  if (wert === null) return null;
  if (/^https?:\/\//i.test(wert)) return wert;
  if (/^www\./i.test(wert)) return `https://${wert}`;
  return wert.includes(".") ? `https://${wert}` : null;
}

/**
 * Text für die Volltextsuche.
 *
 * Enthält jeden Begriff in **zwei** Umlautformen: `unaccent` in Postgres macht
 * aus „Grünewald“ ein „Grunewald“, wer aber „Gruenewald“ tippt, fände damit
 * nichts. Beide Schreibweisen nebeneinander lösen das, ohne die Suchanfrage
 * verkomplizieren zu müssen.
 */
export function baueSuchtext(teile: ReadonlyArray<string | null>): string {
  const woerter = new Set<string>();
  for (const teil of teile) {
    if (teil === null) continue;
    const roh = teil.trim().toLowerCase();
    if (roh !== "") woerter.add(roh);
    const ausgeschrieben = slugify(teil).replace(/-/g, " ");
    if (ausgeschrieben !== "") woerter.add(ausgeschrieben);
  }
  return [...woerter].join(" ");
}

function koordinateGueltig(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0) &&
    lat >= 47.2 &&
    lat <= 55.1 &&
    lon >= 5.8 &&
    lon <= 15.1
  );
}

export type Koordinatenbefund =
  | { readonly art: "uebernommen"; readonly lat: number; readonly lon: number }
  | { readonly art: "vertauscht"; readonly lat: number; readonly lon: number }
  | { readonly art: "unbrauchbar" }
  | { readonly art: "falsches_bundesland" }
  | { readonly art: "fehlt" };

/**
 * Prüft die gelieferte Koordinate und repariert den häufigsten Fehler.
 *
 * In Nordrhein-Westfalen liefert die Quelle bei 13 Schulen **Breite und Länge
 * vertauscht**: `7.35 / 51.45` liegt rechnerisch im Südsudan, gedreht aber
 * genau in Hagen. Da sich Deutschland zwischen 47–55° Nord und 6–15° Ost
 * erstreckt, sind die beiden Bereiche überschneidungsfrei — eine Vertauschung
 * ist damit eindeutig erkennbar und gefahrlos zu beheben.
 *
 * Eine Schule wegen eines einzigen kaputten Feldes ganz zu verwerfen wäre
 * falsch: sie bleibt erhalten und geht ohne Koordinate in die Nachgeocodierung.
 *
 * Geprüft wird zusätzlich gegen den Umriss des Bundeslandes. In
 * Rheinland-Pfalz liefert die Quelle 24 Schulen mit Koordinaten, die zwar in
 * Deutschland liegen, aber hunderte Kilometer daneben: eine Grundschule bei
 * Kaiserslautern steht auf Dresden, eine bei Trier auf Bayreuth. Übernähme man
 * sie ungeprüft, fiele jede Bewertung aus der echten Nachbarschaft dieser
 * Schulen durch die 150-km-Prüfung — und niemand käme dem auf die Spur.
 */
export function pruefeKoordinate(
  lat: number | null | undefined,
  lon: number | null | undefined,
  bundesland: Bundesland,
): Koordinatenbefund {
  if (lat == null || lon == null) return { art: "fehlt" };

  if (koordinateGueltig(lat, lon)) {
    return liegtImBundesland({ lat, lon }, bundesland)
      ? { art: "uebernommen", lat, lon }
      : { art: "falsches_bundesland" };
  }
  if (koordinateGueltig(lon, lat) && liegtImBundesland({ lat: lon, lon: lat }, bundesland)) {
    return { art: "vertauscht", lat: lon, lon: lat };
  }
  return { art: "unbrauchbar" };
}

export function normalisiere(roh: Rohschule): Normalisierungsergebnis {
  const name = saeubere(roh.name);
  if (name === null) return { ok: false, grund: "kein Name", quellId: roh.id };

  const zuordnung = ordneSchulartZu(roh.school_type, name);
  if (!zuordnung.istSchule) return { ok: false, grund: "keine Schule", quellId: roh.id };

  const bundesland = bundeslandAusId(roh.id);
  if (bundesland === null) return { ok: false, grund: "kein Bundesland", quellId: roh.id };

  // Manche Länder verteilen die Anschrift auf zwei Felder.
  const strasse = [saeubere(roh.address), saeubere(roh.address2)].filter(Boolean).join(", ") || null;
  const plz = saeubere(roh.zip);
  const ort = saeubere(roh.city);

  const befund = pruefeKoordinate(roh.latitude, roh.longitude, bundesland);
  const hatKoordinate = befund.art === "uebernommen" || befund.art === "vertauscht";
  const lat = hatKoordinate ? befund.lat : null;
  const lon = hatKoordinate ? befund.lon : null;
  const genauigkeit: Koordinatengenauigkeit | null = hatKoordinate ? "quelle" : null;

  return {
    ok: true,
    schule: {
      quellId: roh.id,
      name,
      schularten: zuordnung.arten,
      schulartOriginal: zuordnung.bezeichnung,
      bundesland,
      strasse,
      plz,
      ort,
      traeger: saeubere(roh.provider),
      website: normalisiereWebsite(saeubere(roh.website)),
      telefon: saeubere(roh.phone),
      email: saeubere(roh.email),
      lat,
      lon,
      genauigkeit,
      suchtext: baueSuchtext([name, ort, plz, zuordnung.bezeichnung]),
      quelleStand: saeubere(roh.update_timestamp),
      koordinatenbefund: befund.art,
    },
  };
}
