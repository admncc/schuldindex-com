/**
 * Abfragen für die Schulkarte.
 *
 * Zwei Ebenen, zwei Abfragen:
 *
 *  - **Der Bestand**, gebündelt auf ein Raster. Er ist der Hintergrund der
 *    Karte - statt Kacheln von einem fremden Server (siehe `domain/karte.ts`).
 *  - **Die bewerteten Schulen**, einzeln und mit Namen. Davon gibt es zunächst
 *    wenige; sie sind das, worauf jemand klickt.
 */

import { sql } from "./verbindung";
import { MINDESTZAHL_PROFIL } from "../domain/aggregation";
import type { Ausschnitt } from "../domain/karte";
import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";

export interface Rasterzelle {
  lat: number;
  lon: number;
  anzahl: number;
}

/**
 * Der Schulbestand im Ausschnitt, gebündelt.
 *
 * Gerundet wird in der Datenbank: 31.770 Zeilen zu holen und in Node zu bündeln
 * hieße, für jede Kartenansicht ein paar Megabyte durch die Verbindung zu
 * schieben, von denen 95 Prozent im selben Punkt landen.
 */
export async function rasterpunkte(
  a: Ausschnitt,
  weite: number,
  bundesland: Bundesland | null = null,
): Promise<Rasterzelle[]> {
  return sql<Rasterzelle[]>`
    select round((lat / ${weite})::numeric)::float8 * ${weite} as lat,
           round((lon / ${weite})::numeric)::float8 * ${weite} as lon,
           count(*)::int as anzahl
    from schulen
    where ist_aktiv and lat is not null and lon is not null
      and lat between ${a.sued} and ${a.nord}
      and lon between ${a.west} and ${a.ost}
      -- Bei gewähltem Bundesland nur dessen Schulen. Der Ausschnitt ist ein
      -- Rechteck und reicht über die Landesgrenze hinaus; ohne diese Zeile
      -- stünde unter der Karte „518 Schulen dargestellt“, gezeichnet wären
      -- 1.325.
      ${bundesland ? sql`and bundesland = ${bundesland}::bundesland` : sql``}
    group by 1, 2
  `;
}

export interface BewerteteSchule {
  slug: string;
  name: string;
  ort: string | null;
  plz: string | null;
  bundesland: Bundesland;
  schularten: Schulart[];
  lat: number;
  lon: number;
  gesamtscore: string;
  anzahl: number;
  /** Aggressionsindex der Schule, 1-5. Für den Kartenfilter „Mobbing“. */
  aggressionsindex: string | null;
  /** Wertung vor sechs Monaten - für den Trendpfeil in der Auswahl. */
  gesamtscore_vor_6m: string | null;
}

/**
 * Die Schulen mit veröffentlichtem Score im Ausschnitt.
 *
 * Es kommen mehr Felder mit als früher: Die Karte filtert und beschreibt jetzt
 * selbst, statt nur Punkte zu setzen, und dafür braucht sie Schulart, Land und
 * Trend. Das sind wenige hundert Zeilen - die Alternative wäre ein zweiter
 * Abruf beim Antippen jedes Punktes.
 */
export async function bewerteteSchulen(
  a: Ausschnitt,
  grenze = 2000,
  bundesland: Bundesland | null = null,
): Promise<BewerteteSchule[]> {
  return sql<BewerteteSchule[]>`
    select s.slug, s.name, s.ort, s.plz, s.bundesland, s.schularten, s.lat, s.lon,
           ag.gesamtscore, ag.anzahl, ag.aggressionsindex, ag.gesamtscore_vor_6m
    from schul_aggregate ag
    join schulen s on s.id = ag.schule_id
    where s.ist_aktiv and s.lat is not null and s.lon is not null
      and ag.gesamtscore is not null and ag.anzahl >= ${MINDESTZAHL_PROFIL}
      and s.lat between ${a.sued} and ${a.nord}
      and s.lon between ${a.west} and ${a.ost}
      ${bundesland ? sql`and s.bundesland = ${bundesland}::bundesland` : sql``}
    order by ag.anzahl desc
    limit ${grenze}
  `;
}

export interface Kartenzahlen {
  readonly imAusschnitt: number;
  readonly ohneKoordinate: number;
  readonly gesamt: number;
}

export async function kartenzahlen(a: Ausschnitt, bundesland: Bundesland | null): Promise<Kartenzahlen> {
  const [zeile] = await sql<{ im: number; ohne: number; gesamt: number }[]>`
    select
      count(*) filter (
        where lat is not null and lon is not null
          and lat between ${a.sued} and ${a.nord}
          and lon between ${a.west} and ${a.ost}
      )::int as im,
      count(*) filter (where lat is null or lon is null)::int as ohne,
      count(*)::int as gesamt
    from schulen
    where ist_aktiv
      ${bundesland ? sql`and bundesland = ${bundesland}::bundesland` : sql``}
  `;
  return {
    imAusschnitt: zeile?.im ?? 0,
    ohneKoordinate: zeile?.ohne ?? 0,
    gesamt: zeile?.gesamt ?? 0,
  };
}
