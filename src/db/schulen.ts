/**
 * Abfragen für die Schulseiten.
 */
import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";
import { MINDESTZAHL_PROFIL } from "../domain/aggregation";
import { sql } from "./verbindung";

export interface Schulprofil {
  id: string;
  slug: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  bundesland: Bundesland;
  schularten: Schulart[];
  schulart_original: string | null;
  traeger: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  genauigkeit: string | null;
  gesamtscore: string | null;
  aggressionsindex: string | null;
  anzahl: number;
  anzahl_mit_freitext: number;
  letzte_bewertung_am: Date | null;
}

export async function holeSchule(slug: string): Promise<Schulprofil | null> {
  const [schule] = await sql<Schulprofil[]>`
    select s.id, s.slug, s.name, s.strasse, s.plz, s.ort, s.bundesland,
           s.schularten, s.schulart_original, s.traeger, s.website,
           s.lat, s.lon, s.genauigkeit::text as genauigkeit,
           a.gesamtscore, a.aggressionsindex,
           coalesce(a.anzahl, 0) as anzahl,
           coalesce(a.anzahl_mit_freitext, 0) as anzahl_mit_freitext,
           a.letzte_bewertung_am
    from schulen s
    left join schul_aggregate a on a.schule_id = s.id
    where s.slug = ${slug} and s.ist_aktiv
  `;
  return schule ?? null;
}

export interface Suchergebnis {
  slug: string;
  name: string;
  strasse: string | null;
  ort: string | null;
  plz: string | null;
  bundesland: Bundesland;
  schularten: Schulart[];
  schulart_original: string | null;
  anzahl: number;
  gesamtscore: string | null;
}

/**
 * Suche für die Ergebnisseite.
 *
 * Präfixtreffer stehen vor Treffern mitten im Text, danach entscheidet die
 * Namenslänge — kurze Namen sind fast immer die gesuchten. Bewertete Schulen
 * rutschen nach vorn, weil sie den Suchenden mehr nützen.
 */
export async function sucheSchulen(
  eingabe: string,
  filter: { bundesland?: Bundesland; schulart?: Schulart } = {},
  grenze = 40,
): Promise<Suchergebnis[]> {
  const begriff = eingabe.toLowerCase().replace(/\s+/g, " ").trim();
  if (begriff.length < 2) return [];

  return sql<Suchergebnis[]>`
    select s.slug, s.name, s.strasse, s.ort, s.plz, s.bundesland, s.schularten, s.schulart_original,
           coalesce(a.anzahl, 0) as anzahl,
           case when coalesce(a.anzahl, 0) >= ${MINDESTZAHL_PROFIL} then a.gesamtscore end as gesamtscore
    from schulen s
    left join schul_aggregate a on a.schule_id = s.id
    where s.ist_aktiv
      and s.suchtext like ${"%" + begriff + "%"}
      ${filter.bundesland ? sql`and s.bundesland = ${filter.bundesland}` : sql``}
      ${filter.schulart ? sql`and ${filter.schulart}::schulart = any(s.schularten)` : sql``}
    order by
      case when s.suchtext like ${begriff + "%"} then 0 else 1 end,
      coalesce(a.anzahl, 0) desc,
      length(s.name),
      s.name
    limit ${grenze}
  `;
}

export async function zaehleSchulen(): Promise<number> {
  const [zeile] = await sql<{ n: number }[]>`
    select count(*)::int as n from schulen where ist_aktiv
  `;
  return zeile?.n ?? 0;
}
