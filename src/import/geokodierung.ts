/**
 * Nachgeocodierung der Schulen ohne Koordinaten.
 *
 * Ausgangslage: 5.048 der 33.450 Schulen (15,1 %) liefern keine Koordinaten —
 * Niedersachsen zu 100 %, Sachsen-Anhalt zu 52 %, das Saarland zu 47 %.
 * Ohne Koordinaten funktionieren weder die 150-km-Prüfung noch die Karte noch
 * die Umkreissuche.
 *
 * **Der Entwurf hängt an einer Beobachtung:** die beiden Zwecke brauchen
 * völlig unterschiedliche Genauigkeit.
 *
 *   - Die **150-km-Prüfung** verträgt einen Fehler von einigen Kilometern
 *     mühelos. Ein PLZ-Zentroid genügt vollständig.
 *   - Die **Karte** braucht den Standort auf einige Dutzend Meter, sonst steht
 *     die Schule im Nachbarort.
 *
 * Deshalb wird die erreichte Genauigkeit mitgespeichert statt verworfen. Eine
 * Schule mit PLZ-Koordinate ist für die Betrugsprüfung voll verwendbar und wird
 * auf der Karte lediglich anders dargestellt. Das erlaubt den Start, ohne auf
 * die letzte Adresse zu warten.
 */

import { BUNDESLAND_LABEL, type Bundesland } from "../domain/bundesland.js";

export type Genauigkeit = "adresse" | "plz" | "ort" | "keine";

export interface Koordinate {
  readonly lat: number;
  readonly lon: number;
  /** Postleitzahl des Treffers, soweit der Dienst sie mitliefert. */
  readonly plz?: string | null;
}

export interface Anschrift {
  readonly strasse: string | null;
  readonly plz: string | null;
  readonly ort: string | null;
  readonly bundesland: Bundesland;
  readonly name: string;
}

export interface Geokodierungsergebnis {
  readonly koordinate: Koordinate | null;
  readonly genauigkeit: Genauigkeit;
  /** Gesetzt, wenn ein Ergebnis kam, aber verworfen wurde. */
  readonly verworfenWeil?: string;
}

/**
 * Anfragen in absteigender Genauigkeit. Die erste, die ein plausibles Ergebnis
 * liefert, gewinnt.
 *
 * Der Schulname steht bewusst in der ersten Stufe: OSM kennt viele Schulen als
 * benanntes Objekt, und „Grundschule Nordholz, Nordweg 75“ trifft das Gebäude,
 * während die Adresse allein nur die Straße trifft.
 */
export function baueAnfragen(a: Anschrift): ReadonlyArray<{ text: string; genauigkeit: Genauigkeit }> {
  const anfragen: { text: string; genauigkeit: Genauigkeit }[] = [];
  const ortsteil = [a.plz, a.ort].filter(Boolean).join(" ");

  if (a.strasse && ortsteil) {
    anfragen.push({ text: `${a.name}, ${a.strasse}, ${ortsteil}`, genauigkeit: "adresse" });
    anfragen.push({ text: `${a.strasse}, ${ortsteil}`, genauigkeit: "adresse" });
  }
  if (a.plz) {
    anfragen.push({ text: `${a.plz} ${a.ort ?? ""}`.trim(), genauigkeit: "plz" });
  }
  if (a.ort) {
    anfragen.push({ text: `${a.ort}, ${BUNDESLAND_LABEL[a.bundesland]}`, genauigkeit: "ort" });
  }
  return anfragen;
}

/**
 * Grobe Umrisse der Bundesländer, großzügig gefasst.
 *
 * Zweck ist nicht die exakte Grenze, sondern das Aussortieren grober Fehlgriffe:
 * ein Geocoder, der „Neustadt“ in Bayern statt in Schleswig-Holstein findet, ist
 * ein realer und häufiger Fall. Ohne diese Prüfung landen solche Schulen
 * hunderte Kilometer entfernt auf der Karte — und jede Bewertung aus ihrer
 * Nachbarschaft fiele durch die 150-km-Prüfung.
 */
const UMRISSE: Readonly<Record<Bundesland, readonly [number, number, number, number]>> = {
  //          [südlichster, nördlichster, westlichster, östlichster Punkt]
  SH: [53.36, 55.06, 7.86, 11.31],
  HH: [53.39, 53.97, 8.42, 10.33],
  NI: [51.29, 53.90, 6.35, 11.60],
  HB: [53.01, 53.61, 8.48, 8.99],
  NW: [50.32, 52.53, 5.87, 9.46],
  HE: [49.39, 51.66, 7.77, 10.24],
  RP: [48.97, 50.94, 6.11, 8.51],
  BW: [47.53, 49.79, 7.51, 10.50],
  BY: [47.27, 50.56, 8.98, 13.84],
  SL: [49.11, 49.64, 6.36, 7.40],
  BE: [52.34, 52.68, 13.09, 13.76],
  BB: [51.36, 53.56, 11.27, 14.77],
  MV: [53.11, 54.68, 10.59, 14.41],
  SN: [50.17, 51.68, 11.87, 15.04],
  ST: [50.94, 53.04, 10.56, 13.19],
  TH: [50.20, 51.65, 9.88, 12.65],
};

/** Zugabe in Grad, damit Schulen dicht an der Landesgrenze nicht durchfallen. */
const ZUGABE = 0.12;

export function liegtImBundesland(k: Koordinate, bundesland: Bundesland): boolean {
  const [sued, nord, west, ost] = UMRISSE[bundesland];
  return (
    k.lat >= sued - ZUGABE &&
    k.lat <= nord + ZUGABE &&
    k.lon >= west - ZUGABE &&
    k.lon <= ost + ZUGABE
  );
}

/** Deutschland insgesamt — fängt Ergebnisse aus dem Ausland ab. */
export function liegtInDeutschland(k: Koordinate): boolean {
  return k.lat >= 47.2 && k.lat <= 55.1 && k.lon >= 5.8 && k.lon <= 15.1;
}

export function pruefe(k: Koordinate, bundesland: Bundesland): string | null {
  if (!Number.isFinite(k.lat) || !Number.isFinite(k.lon)) return "keine gültige Koordinate";
  if (k.lat === 0 && k.lon === 0) return "Nullinsel";
  if (!liegtInDeutschland(k)) return "außerhalb Deutschlands";
  if (!liegtImBundesland(k, bundesland)) return `außerhalb von ${BUNDESLAND_LABEL[bundesland]}`;
  return null;
}

/**
 * Ein Geocoder-Dienst. Als Schnittstelle geführt, damit die Ablauflogik ohne
 * Netzzugriff getestet werden kann und der Anbieter austauschbar bleibt.
 */
export interface Geocoder {
  readonly name: string;
  suche(anfrage: string): Promise<Koordinate | null>;
}

/**
 * Prüft die Postleitzahl des Treffers gegen die gesuchte.
 *
 * Der Grund ist ein realer Fehlgriff: für „Grundschule Klixbüll, Schulstraße 5,
 * 25899 Klixbüll“ fand der Dienst eine Schulstraße 5 rund 110 km weiter
 * südlich. Beide Orte liegen in Schleswig-Holstein, weshalb die Prüfung gegen
 * den Landesumriss nichts merkte — das Land ist 200 km lang.
 *
 * Verlangt wird **Gleichheit**, nicht Ähnlichkeit. Ein Vergleich der ersten
 * beiden Stellen reicht nicht: in Schleswig-Holstein beginnt jede Postleitzahl
 * mit 25 oder 24, und die 110 km auseinanderliegenden Orte des Fehlgriffs
 * trugen beide eine 25.
 *
 * Die Strenge kostet wenig: wer die Prüfung nicht besteht, fällt auf die
 * Postleitzahl-Stufe zurück und bekommt eine Koordinate, die für die
 * 150-km-Prüfung vollwertig und für die Karte brauchbar ist. Eine Schule
 * hunderte Kilometer entfernt zu verorten wäre der weit größere Schaden.
 */
export function plzPasst(gesucht: string | null, gefunden: string | null | undefined): boolean {
  if (!gesucht || !gefunden) return true; // ohne Angabe nicht prüfbar
  return gesucht.trim() === gefunden.trim();
}

/**
 * Arbeitet die Anfragestufen ab und gibt das erste plausible Ergebnis zurück.
 * Ein unplausibles Ergebnis beendet die Suche nicht — es wird verworfen und die
 * nächste, gröbere Stufe versucht.
 */
export async function geokodiere(a: Anschrift, geocoder: Geocoder): Promise<Geokodierungsergebnis> {
  let letzterEinwand: string | undefined;

  for (const { text, genauigkeit } of baueAnfragen(a)) {
    const treffer = await geocoder.suche(text);
    if (!treffer) continue;

    const einwand = pruefe(treffer, a.bundesland);
    if (einwand) {
      letzterEinwand = einwand;
      continue;
    }
    // Auf der Ortsstufe ist eine abweichende Postleitzahl zu erwarten und kein
    // Einwand — dort wurde bewusst nur nach dem Ort gefragt.
    if (genauigkeit !== "ort" && !plzPasst(a.plz, treffer.plz)) {
      letzterEinwand = `Postleitzahl ${treffer.plz} statt ${a.plz}`;
      continue;
    }
    return { koordinate: treffer, genauigkeit };
  }

  return letzterEinwand === undefined
    ? { koordinate: null, genauigkeit: "keine" }
    : { koordinate: null, genauigkeit: "keine", verworfenWeil: letzterEinwand };
}
