/**
 * Standortbestimmung aus der IP - im eigenen Haus.
 *
 * Bisher gab es sie gar nicht: `ortungDesAbsenders` lieferte `null`, jede
 * Abgabe galt als „Ort unbekannt“ und ging in die Moderation. Das war die
 * ehrliche Zwischenlösung, solange kein Dienst angebunden war.
 *
 * Jetzt liegt eine MaxMind-Datenbank auf dem Server, und die Auflösung
 * geschieht **lokal**. Das ist nicht nur bequemer als ein fremder Dienst,
 * sondern der ganze Punkt: Bei einem Anbieter nachzufragen hieße, ihm die
 * IP-Adresse jeder bewertenden Person zu schicken - bei einer überwiegend
 * minderjährigen Nutzerschaft dieselbe Frage wie bei den Google-Schriften und
 * den Kartenkacheln, und dieselbe Antwort.
 *
 * **Die IP wird weiterhin nirgends gespeichert** (Entscheidung E3). Sie wird
 * gelesen, nachgeschlagen, und was bleibt, ist die Entfernung in Kilometern.
 *
 * Zur Genauigkeit: Die Datenbank nennt zu jedem Treffer einen Radius, oft 20
 * bis 200 Kilometer. Deutsche Mobilfunkadressen orten regelmäßig auf den
 * Netzknoten statt auf die Person. Deshalb ist die Entfernung ein Signal und
 * kein Beweis - genau so wird sie auch verwendet.
 */

import { existsSync, statSync } from "node:fs";
import { open, type Reader, type CityResponse } from "maxmind";

/** Wo die Datenbank liegt. Über die Umgebung verlegbar. */
export function datenbankpfad(): string {
  return process.env["GEOIP_DB"] ?? "daten/geoip/city.mmdb";
}

export interface Ortung {
  readonly lat: number;
  readonly lon: number;
  /** Radius in Kilometern, den die Datenbank selbst angibt. */
  readonly genauigkeitKm: number | null;
  readonly land: string | null;
  readonly ort: string | null;
}

/**
 * Der geladene Leser, zwischengespeichert.
 *
 * Die Datei ist 46 MB groß; sie bei jeder Abgabe neu zu öffnen wäre teuer. Der
 * Speicher überlebt in der Entwicklung auch das Neuladen des Moduls - sonst
 * hätte man nach jeder Änderung eine zweite Kopie im Arbeitsspeicher.
 */
const global_ = globalThis as unknown as {
  __geoip?: { leser: Reader<CityResponse>; pfad: string; geladenAm: number } | null;
};

export function vergissLeser(): void {
  global_.__geoip = null;
}

async function leser(): Promise<Reader<CityResponse> | null> {
  const pfad = datenbankpfad();
  if (global_.__geoip && global_.__geoip.pfad === pfad) return global_.__geoip.leser;
  if (!existsSync(pfad)) return null;

  try {
    const geladen = await open<CityResponse>(pfad);
    global_.__geoip = { leser: geladen, pfad, geladenAm: Date.now() };
    return geladen;
  } catch (fehler) {
    // Eine kaputte Datei darf keine Abgabe verhindern: Ohne Ortung geht die
    // Bewertung in die Moderation, und das ist der sichere Weg.
    console.error("GeoIP-Datenbank ließ sich nicht öffnen:", fehler);
    return null;
  }
}

export async function ortungFuerIp(ip: string | null): Promise<Ortung | null> {
  if (ip === null || ip.trim() === "") return null;
  const l = await leser();
  if (l === null) return null;

  try {
    const treffer = l.get(ip.trim());
    const lat = treffer?.location?.latitude;
    const lon = treffer?.location?.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return null;

    return {
      lat,
      lon,
      genauigkeitKm: treffer?.location?.accuracy_radius ?? null,
      land: treffer?.country?.iso_code ?? null,
      ort: treffer?.city?.names?.de ?? treffer?.city?.names?.en ?? null,
    };
  } catch {
    // Ungültige Adressen (etwa aus einem gefälschten Kopf) sind kein Fehlerfall,
    // sondern schlicht „kein Treffer“.
    return null;
  }
}

export interface Datenbanklage {
  readonly vorhanden: boolean;
  readonly pfad: string;
  readonly groesseMb: number | null;
  readonly art: string | null;
  readonly standAm: Date | null;
  readonly eintraege: number | null;
}

export async function datenbanklage(): Promise<Datenbanklage> {
  const pfad = datenbankpfad();
  if (!existsSync(pfad)) {
    return { vorhanden: false, pfad, groesseMb: null, art: null, standAm: null, eintraege: null };
  }

  const l = await leser();
  const groesse = statSync(pfad).size / 1024 / 1024;
  const m = l?.metadata;

  return {
    vorhanden: true,
    pfad,
    groesseMb: Math.round(groesse * 10) / 10,
    art: m?.databaseType ?? null,
    standAm: m?.buildEpoch ?? null,
    eintraege: m?.nodeCount ?? null,
  };
}

/**
 * Wie viele eigene Proxys vor der Anwendung stehen (`VERTRAUTE_PROXYS`).
 *
 * Ohne Angabe: keiner. Dann wird `X-Forwarded-For` **nicht ausgewertet**, und
 * der Ort bleibt unbekannt - was die Bewertung in die Moderation schickt,
 * statt sie ungeprüft durchzulassen.
 */
function vertrauteProxys(): number {
  const roh = Number(process.env["VERTRAUTE_PROXYS"] ?? "0");
  return Number.isInteger(roh) && roh > 0 ? roh : 0;
}

/**
 * Die Adresse des Absenders aus den Kopfzeilen.
 *
 * **Der Kopf kommt vom Client, nicht vom Netz.** Hier stand einmal „nimm den
 * ersten Eintrag“ - und der erste Eintrag ist genau der, den der Browser selbst
 * schreiben kann. Wer `X-Forwarded-For: <IP in der Nähe der Schule>` setzte,
 * schaltete damit das Entfernungssignal ab, das schwerste der ganzen Prüfung.
 *
 * Vertrauenswürdig ist nur, was die **eigenen** Proxys angehängt haben: Jeder
 * Proxy hängt hinten an, also ist die Adresse `n` Stellen von rechts die, die
 * der äußerste eigene Proxy gesehen hat. Alles links davon ist Behauptung des
 * Absenders. Steht kein Proxy davor (`VERTRAUTE_PROXYS` nicht gesetzt), wird
 * der Kopf gar nicht erst gelesen.
 *
 * **Nichts davon wird gespeichert.** Der Rückgabewert lebt bis zum Ende der
 * Anfrage.
 */
export function absenderadresse(kopf: Headers, proxys = vertrauteProxys()): string | null {
  if (proxys <= 0) return null;

  const weitergereicht = kopf.get("x-forwarded-for");
  if (weitergereicht) {
    const kette = weitergereicht.split(",").map((t) => t.trim()).filter((t) => t !== "");
    // Der äußerste eigene Proxy hat als letzter angehängt. Sind es weniger
    // Einträge als Proxys, hat jemand den Kopf entfernt - dann ist keine
    // Angabe belastbar.
    const stelle = kette.length - proxys;
    if (stelle >= 0 && kette[stelle]) return kette[stelle]!;
    return null;
  }

  // `X-Real-IP` setzt der Proxy selbst und überschreibt dabei, was der Client
  // geschickt hat - deshalb ist er hier brauchbar, sobald überhaupt ein
  // eigener Proxy davorsteht.
  return kopf.get("x-real-ip")?.trim() ?? null;
}
