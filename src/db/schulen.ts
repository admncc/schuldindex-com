/**
 * Abfragen für die Schulseiten.
 */
import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";
import { MINDESTZAHL_PROFIL } from "../domain/aggregation";
import { sql } from "./verbindung";
import { zerlegeEingabe } from "./schulsuche";

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
  /** Kategoriewerte auf der Antwortskala 1–5, für die Auswertung der Schule. */
  score_a: string | null;
  score_b: string | null;
  score_c: string | null;
  score_d: string | null;
  score_e: string | null;
  score_f: string | null;
  /** Vergleichsstand für den Sechs-Monats-Trend. */
  gesamtscore_vor_6m: string | null;
  anzahl_vor_6m: number;
  anzahl_je_rolle: Record<string, number>;
}

export async function holeSchule(slug: string): Promise<Schulprofil | null> {
  const [schule] = await sql<Schulprofil[]>`
    select s.id, s.slug, s.name, s.strasse, s.plz, s.ort, s.bundesland,
           s.schularten, s.schulart_original, s.traeger, s.website,
           s.lat, s.lon, s.genauigkeit::text as genauigkeit,
           a.gesamtscore, a.aggressionsindex,
           coalesce(a.anzahl, 0) as anzahl,
           coalesce(a.anzahl_mit_freitext, 0) as anzahl_mit_freitext,
           a.letzte_bewertung_am,
           a.score_a, a.score_b, a.score_c, a.score_d, a.score_e, a.score_f,
           a.gesamtscore_vor_6m, coalesce(a.anzahl_vor_6m, 0) as anzahl_vor_6m,
           coalesce(a.anzahl_je_rolle, '{}'::jsonb) as anzahl_je_rolle
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
  /** Zahl aller Treffer, nicht nur der ausgelieferten Seite. */
  gesamt: number;
}

export interface Trefferfilter {
  bundesland?: Bundesland;
  schulart?: Schulart;
  /** Ort oder Postleitzahl - beides steht im selben Feld der Suchmaske. */
  ort?: string;
  /** Nur Schulen mit veröffentlichter Wertung. */
  nurBewertet?: boolean;
}

/** Ist überhaupt etwas eingegrenzt? Ohne Eingrenzung und ohne Begriff wird nicht gesucht. */
export function istEingegrenzt(filter: Trefferfilter): boolean {
  return (
    filter.bundesland !== undefined ||
    filter.schulart !== undefined ||
    (filter.ort !== undefined && filter.ort.trim() !== "") ||
    filter.nurBewertet === true
  );
}

/**
 * Die gemeinsame Bedingung von Trefferliste und Facetten.
 *
 * `ohne` lässt genau eine Bedingung weg. Die Facetten brauchen das: Die Liste
 * der Bundesländer soll zeigen, wohin man wechseln kann, und nicht nur das
 * eine, in dem man schon steht.
 */
function bedingung(begriff: string, filter: Trefferfilter, ohne?: "bundesland" | "ort") {
  let b = sql`s.ist_aktiv`;

  // Jedes Wort muss vorkommen, aber nicht zusammenhängend: „schiller öhringen“
  // findet die Schillerschule in Öhringen, obwohl im Suchtext „grundschule“
  // dazwischensteht. Begründung ausführlich in `db/schulsuche.ts`.
  for (const wort of zerlegeEingabe(begriff)) {
    b = sql`${b} and s.suchtext like ${"%" + wort + "%"}`;
  }

  if (filter.bundesland !== undefined && ohne !== "bundesland") {
    b = sql`${b} and s.bundesland = ${filter.bundesland}`;
  }
  if (filter.schulart !== undefined) {
    b = sql`${b} and ${filter.schulart}::schulart = any(s.schularten)`;
  }
  const ort = filter.ort?.trim().toLowerCase() ?? "";
  if (ort !== "" && ohne !== "ort") {
    // Ein Feld für beides: Ziffern sind eine Postleitzahl, alles andere ein
    // Ortsname. Beim Ort von vorn, damit „Berg“ nicht jedes „…berg“ trifft.
    b = /^\d+$/.test(ort)
      ? sql`${b} and s.plz like ${ort + "%"}`
      : sql`${b} and lower(s.ort) like ${ort + "%"}`;
  }
  if (filter.nurBewertet === true) {
    b = sql`${b} and coalesce(a.anzahl, 0) >= ${MINDESTZAHL_PROFIL}`;
  }
  return b;
}

/**
 * Suche für die Ergebnisseite.
 *
 * Zwei Wege führen zu einer Liste: ein Suchbegriff oder eine Eingrenzung.
 * „Alle Gymnasien in Bayern“ ist eine sinnvolle Anfrage, auch ohne dass jemand
 * einen Namen tippt - deshalb reicht ein gesetzter Filter allein.
 *
 * Präfixtreffer stehen vor Treffern mitten im Text, danach entscheidet die
 * Namenslänge - kurze Namen sind fast immer die gesuchten. Bewertete Schulen
 * rutschen nach vorn, weil sie den Suchenden mehr nützen.
 */
export async function sucheSchulen(
  eingabe: string,
  filter: Trefferfilter = {},
  grenze = 40,
): Promise<Suchergebnis[]> {
  const begriff = eingabe.toLowerCase().replace(/\s+/g, " ").trim();
  if (begriff.length < 2 && !istEingegrenzt(filter)) return [];

  // Erst die zusammenhängenden Treffer, dann die verstreuten: Wer „gymnasium
  // nord“ tippt, will das Gymnasium Nord oben sehen, nicht die Grundschule Nord
  // mit gymnasialem Zweig. Ohne Begriff gibt es diese Stufe nicht, dann führt
  // die Zahl der Bewertungen.
  const reihenfolge =
    begriff === ""
      ? sql`coalesce(a.anzahl, 0) desc, length(s.name), s.name`
      : sql`case when s.suchtext like ${begriff + "%"} then 0
                 when s.suchtext like ${"%" + begriff + "%"} then 1
                 else 2 end,
            coalesce(a.anzahl, 0) desc, length(s.name), s.name`;

  return sql<Suchergebnis[]>`
    select s.slug, s.name, s.strasse, s.ort, s.plz, s.bundesland, s.schularten, s.schulart_original,
           coalesce(a.anzahl, 0) as anzahl,
           case when coalesce(a.anzahl, 0) >= ${MINDESTZAHL_PROFIL} then a.gesamtscore end as gesamtscore,
           count(*) over()::int as gesamt
    from schulen s
    left join schul_aggregate a on a.schule_id = s.id
    where ${bedingung(begriff, filter)}
    order by ${reihenfolge}
    limit ${grenze}
  `;
}

export interface Facette<T extends string> {
  wert: T;
  anzahl: number;
}

/**
 * Wie viele Treffer in welchem Bundesland liegen.
 *
 * Gezählt wird ohne den Bundeslandfilter - sonst zeigte die Leiste immer nur
 * das eine Land, das gerade gewählt ist, und man käme nicht mehr heraus.
 */
export async function bundeslandFacetten(
  eingabe: string,
  filter: Trefferfilter = {},
): Promise<Facette<Bundesland>[]> {
  const begriff = eingabe.toLowerCase().replace(/\s+/g, " ").trim();
  if (begriff.length < 2 && !istEingegrenzt(filter)) return [];

  return sql<Facette<Bundesland>[]>`
    select s.bundesland as wert, count(*)::int as anzahl
    from schulen s
    left join schul_aggregate a on a.schule_id = s.id
    where ${bedingung(begriff, filter, "bundesland")}
    group by s.bundesland
    order by anzahl desc, wert
  `;
}

/** Dasselbe für die Orte - die zehn größten Häufungen reichen als Angebot. */
export async function ortFacetten(
  eingabe: string,
  filter: Trefferfilter = {},
  grenze = 10,
): Promise<Facette<string>[]> {
  const begriff = eingabe.toLowerCase().replace(/\s+/g, " ").trim();
  if (begriff.length < 2 && !istEingegrenzt(filter)) return [];

  return sql<Facette<string>[]>`
    select s.ort as wert, count(*)::int as anzahl
    from schulen s
    left join schul_aggregate a on a.schule_id = s.id
    where ${bedingung(begriff, filter, "ort")} and s.ort is not null and s.ort <> ''
    group by s.ort
    order by anzahl desc, wert
    limit ${grenze}
  `;
}

/** Der ganze Bestand nach Bundesland - für die Einstiegskacheln ohne Suchbegriff. */
export async function schulzahlJeBundesland(): Promise<Facette<Bundesland>[]> {
  return sql<Facette<Bundesland>[]>`
    select bundesland as wert, count(*)::int as anzahl
    from schulen where ist_aktiv
    group by bundesland
  `;
}

export async function zaehleSchulen(): Promise<number> {
  const [zeile] = await sql<{ n: number }[]>`
    select count(*)::int as n from schulen where ist_aktiv
  `;
  return zeile?.n ?? 0;
}
