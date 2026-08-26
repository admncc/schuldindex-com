/**
 * Schulsuche — Autovervollständigung, Volltext und Umkreis.
 *
 * Die Suche ist der erste Kontakt mit dem Portal. Findet jemand seine Schule
 * nicht, ist alles Weitere belanglos. Deshalb drei Wege nebeneinander:
 *
 *  1. **Präfix** — „gymn…“ soll sofort Gymnasien zeigen. Schnell und exakt.
 *  2. **Trigramme** — fängt Tippfehler und Wortdreher ab („mühlenweg gymnasium“).
 *  3. **Umkreis** — „Schulen in meiner Nähe“ über den räumlichen Index.
 *
 * Umlaute funktionieren in beide Richtungen, weil `suchtext` jeden Begriff in
 * beiden Schreibweisen führt (siehe `import/normalisiere.ts`).
 */

import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";

export interface Suchtreffer {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly ort: string | null;
  readonly plz: string | null;
  readonly bundesland: Bundesland;
  readonly schularten: readonly Schulart[];
  readonly schulartOriginal: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  /** Entfernung in Kilometern — nur bei der Umkreissuche gesetzt. */
  readonly entfernungKm?: number;
}

export interface Suchfilter {
  readonly bundesland?: Bundesland;
  readonly schulart?: Schulart;
  readonly ort?: string;
}

/** Minimale Schnittstelle auf die Datenbank, damit die Abfragen testbar bleiben. */
export type SqlAusfuehrer = <T>(text: string, werte: readonly unknown[]) => Promise<T[]>;

/**
 * Bereitet eine Eingabe für die Suche auf.
 *
 * Wichtig: die Eingabe wird **nicht** umlautbereinigt. Der Suchtext in der
 * Datenbank führt bereits beide Schreibweisen, eine Bereinigung der Eingabe
 * würde „Gruenewald“ zu „gruenewald“ machen und damit weiterhin passen — aber
 * „Grünewald“ zu „Grunewald“, was dann *nicht* mehr passt.
 */
export function normalisiereEingabe(eingabe: string): string {
  return eingabe.toLowerCase().replace(/\s+/g, " ").trim();
}

function filterBedingungen(filter: Suchfilter, werte: unknown[]): string {
  const teile: string[] = [];
  if (filter.bundesland) {
    werte.push(filter.bundesland);
    teile.push(`and bundesland = $${werte.length}`);
  }
  if (filter.schulart) {
    werte.push(filter.schulart);
    teile.push(`and $${werte.length} = any(schularten)`);
  }
  if (filter.ort) {
    werte.push(`%${normalisiereEingabe(filter.ort)}%`);
    teile.push(`and lower(ort) like $${werte.length}`);
  }
  return teile.join("\n        ");
}

const SPALTEN = `
  id, slug, name, ort, plz, bundesland, schularten, schulart_original, lat, lon`;

/**
 * Autovervollständigung während der Eingabe.
 *
 * Präfixtreffer stehen vor Treffern mitten im Text: wer „gymn“ tippt, meint
 * Gymnasien und nicht das „…gymnasiale Oberstufe“ am Ende eines langen Namens.
 * Bei gleichem Rang entscheidet die Namenslänge — kurze Namen sind fast immer
 * die gesuchten.
 */
export async function autovervollstaendige(
  sql: SqlAusfuehrer,
  eingabe: string,
  filter: Suchfilter = {},
  grenze = 10,
): Promise<Suchtreffer[]> {
  const begriff = normalisiereEingabe(eingabe);
  if (begriff.length < 2) return [];

  const werte: unknown[] = [`${begriff}%`, `%${begriff}%`];
  const bedingungen = filterBedingungen(filter, werte);
  werte.push(grenze);

  const zeilen = await sql<Record<string, unknown>>(
    `select ${SPALTEN},
            case when suchtext like $1 then 0 else 1 end as rang
     from schulen
     where ist_aktiv and suchtext like $2
       ${bedingungen}
     order by rang, length(name), name
     limit $${werte.length}`,
    werte,
  );
  return zeilen.map(zuTreffer);
}

/**
 * Volltextsuche mit Tippfehlertoleranz.
 *
 * `%` ist der Ähnlichkeitsoperator aus `pg_trgm` und nutzt den GIN-Index. Der
 * Schwellenwert bleibt der Voreinstellung überlassen, damit er sich zentral
 * per `pg_trgm.similarity_threshold` nachziehen lässt.
 */
export async function suche(
  sql: SqlAusfuehrer,
  eingabe: string,
  filter: Suchfilter = {},
  grenze = 30,
): Promise<Suchtreffer[]> {
  const begriff = normalisiereEingabe(eingabe);
  if (begriff.length < 2) return [];

  const werte: unknown[] = [begriff, `%${begriff}%`];
  const bedingungen = filterBedingungen(filter, werte);
  werte.push(grenze);

  const zeilen = await sql<Record<string, unknown>>(
    `select ${SPALTEN}, similarity(suchtext, $1) as guete
     from schulen
     where ist_aktiv and (suchtext % $1 or suchtext like $2)
       ${bedingungen}
     order by guete desc, length(name), name
     limit $${werte.length}`,
    werte,
  );
  return zeilen.map(zuTreffer);
}

/**
 * Schulen im Umkreis, nach Entfernung sortiert.
 *
 * `earth_box` grenzt über den räumlichen Index grob ein, `earth_distance`
 * rechnet danach genau nach — der Kasten allein wäre an den Ecken zu großzügig.
 */
export async function imUmkreis(
  sql: SqlAusfuehrer,
  lat: number,
  lon: number,
  umkreisKm: number,
  filter: Suchfilter = {},
  grenze = 50,
): Promise<Suchtreffer[]> {
  const meter = umkreisKm * 1000;
  const werte: unknown[] = [lat, lon, meter];
  const bedingungen = filterBedingungen(filter, werte);
  werte.push(grenze);

  const zeilen = await sql<Record<string, unknown>>(
    `select ${SPALTEN},
            earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lon)) / 1000 as entfernung_km
     from schulen
     where ist_aktiv and lat is not null
       and earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(lat, lon)
       and earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lon)) <= $3
       ${bedingungen}
     order by entfernung_km
     limit $${werte.length}`,
    werte,
  );
  return zeilen.map(zuTreffer);
}

function zuTreffer(zeile: Record<string, unknown>): Suchtreffer {
  const entfernung = zeile["entfernung_km"];
  return {
    id: String(zeile["id"]),
    slug: String(zeile["slug"]),
    name: String(zeile["name"]),
    ort: (zeile["ort"] as string | null) ?? null,
    plz: (zeile["plz"] as string | null) ?? null,
    bundesland: zeile["bundesland"] as Bundesland,
    schularten: (zeile["schularten"] as Schulart[] | null) ?? [],
    schulartOriginal: (zeile["schulart_original"] as string | null) ?? null,
    lat: zeile["lat"] == null ? null : Number(zeile["lat"]),
    lon: zeile["lon"] == null ? null : Number(zeile["lon"]),
    ...(entfernung == null ? {} : { entfernungKm: Number(entfernung) }),
  };
}
