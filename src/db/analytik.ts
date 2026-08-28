/**
 * Auswertungen für die Moderation.
 *
 * Die Warteschlange zeigt, was zu tun ist. Diese Abfragen zeigen, **was los
 * ist**: Wie verteilen sich die Bewertungen einer Schule auf die Zustände, wer
 * bewertet, wie entwickelt sich die Wertung, welche Signale schlagen wie oft an,
 * und wie schnell arbeitet die Redaktion ab.
 *
 * Alles hier ist lesend. Entschieden wird in der Warteschlange - eine Ansicht,
 * aus der heraus man freigeben kann, verführt dazu, aus der Statistik heraus zu
 * moderieren statt aus dem Vorgang.
 */

import { sql } from "./verbindung";
import type { Bundesland } from "../domain/bundesland";
import type { Zustand } from "../domain/bewertungsstatus";

export interface Gesamtlage {
  readonly bewertungen: number;
  readonly freigegeben: number;
  readonly inPruefung: number;
  readonly abgelehnt: number;
  readonly wartetAufBestaetigung: number;
  readonly schulenBewertet: number;
  readonly letzte24h: number;
  readonly letzte7Tage: number;
  /** Mittlere Dauer bis zur Entscheidung, in Stunden. */
  readonly bearbeitungsdauerStunden: number | null;
  readonly aeltesterOffenerVorgang: Date | null;
}

export async function gesamtlage(): Promise<Gesamtlage> {
  const [z] = await sql<
    {
      bewertungen: number;
      freigegeben: number;
      pruefung: number;
      abgelehnt: number;
      wartet: number;
      schulen: number;
      tag: number;
      woche: number;
      dauer: number | null;
      aeltester: Date | null;
    }[]
  >`
    select count(*)::int as bewertungen,
           count(*) filter (where status = 'freigegeben')::int as freigegeben,
           count(*) filter (where status in ('in_pruefung_geo', 'in_pruefung_betrug'))::int as pruefung,
           count(*) filter (where status = 'abgelehnt')::int as abgelehnt,
           count(*) filter (where status = 'wartet_auf_verifizierung')::int as wartet,
           count(distinct schule_id)::int as schulen,
           count(*) filter (where erstellt_am > now() - interval '24 hours')::int as tag,
           count(*) filter (where erstellt_am > now() - interval '7 days')::int as woche,
           avg(extract(epoch from (moderiert_am - erstellt_am)) / 3600)
             filter (where moderiert_am is not null) as dauer,
           min(erstellt_am) filter (where status in ('in_pruefung_geo', 'in_pruefung_betrug')) as aeltester
    from bewertungen
  `;

  return {
    bewertungen: z?.bewertungen ?? 0,
    freigegeben: z?.freigegeben ?? 0,
    inPruefung: z?.pruefung ?? 0,
    abgelehnt: z?.abgelehnt ?? 0,
    wartetAufBestaetigung: z?.wartet ?? 0,
    schulenBewertet: z?.schulen ?? 0,
    letzte24h: z?.tag ?? 0,
    letzte7Tage: z?.woche ?? 0,
    bearbeitungsdauerStunden: z?.dauer === null || z?.dauer === undefined ? null : Number(z.dauer),
    aeltesterOffenerVorgang: z?.aeltester ?? null,
  };
}

/** Wie oft welches Signal angeschlagen hat - über alle gespeicherten Befunde. */
export async function signalhaeufigkeit(): Promise<{ art: string; anzahl: number; gehalten: number }[]> {
  return sql<{ art: string; anzahl: number; gehalten: number }[]>`
    select s.wert ->> 'art' as art,
           count(*)::int as anzahl,
           count(*) filter (where b.status in ('in_pruefung_geo', 'in_pruefung_betrug', 'abgelehnt'))::int as gehalten
    from bewertungen b, jsonb_array_elements(b.signale) as s(wert)
    group by 1
    order by count(*) desc
  `;
}

/** Abgaben je Monat, für den Verlauf. */
export async function verlaufNachMonat(monate = 12): Promise<
  { monat: string; abgaben: number; freigegeben: number; abgelehnt: number }[]
> {
  return sql<{ monat: string; abgaben: number; freigegeben: number; abgelehnt: number }[]>`
    select to_char(date_trunc('month', erstellt_am), 'YYYY-MM') as monat,
           count(*)::int as abgaben,
           count(*) filter (where status = 'freigegeben')::int as freigegeben,
           count(*) filter (where status = 'abgelehnt')::int as abgelehnt
    from bewertungen
    where erstellt_am > date_trunc('month', now()) - ${`${monate} months`}::interval
    group by 1 order by 1
  `;
}

export interface Schulfund {
  id: string;
  slug: string;
  name: string;
  ort: string | null;
  bundesland: Bundesland;
  bewertungen: number;
}

/** Schulsuche für die Auswertung - über denselben Suchtext wie das Portal. */
export async function sucheSchulenFuerAnalyse(begriff: string, grenze = 20): Promise<Schulfund[]> {
  const wort = begriff.trim().toLowerCase();
  if (wort.length < 2) return [];
  return sql<Schulfund[]>`
    select s.id, s.slug, s.name, s.ort, s.bundesland,
           count(b.id)::int as bewertungen
    from schulen s left join bewertungen b on b.schule_id = s.id
    where s.suchtext like ${"%" + wort + "%"}
    group by s.id
    order by count(b.id) desc, s.name
    limit ${grenze}
  `;
}

export interface Schulanalyse {
  readonly schule: { id: string; slug: string; name: string; ort: string | null; bundesland: Bundesland };
  readonly zustaende: Record<string, number>;
  readonly rollen: { rolle: string; anzahl: number }[];
  readonly kategorien: { kategorie: string; schnitt: number | null }[];
  readonly verlauf: { monat: string; anzahl: number; schnitt: number | null }[];
  readonly signale: { art: string; anzahl: number }[];
  readonly aggregat: { anzahl: number; gesamtscore: string | null; aggressionsindex: string | null } | null;
}

export async function analysiereSchule(schuleId: string): Promise<Schulanalyse | null> {
  const [schule] = await sql<
    { id: string; slug: string; name: string; ort: string | null; bundesland: Bundesland }[]
  >`
    select id, slug, name, ort, bundesland from schulen where id = ${schuleId}
  `;
  if (schule === undefined) return null;

  const [zustaende, rollen, kategorien, verlauf, signale, aggregat] = await Promise.all([
    sql<{ status: string; anzahl: number }[]>`
      select status::text as status, count(*)::int as anzahl
      from bewertungen where schule_id = ${schuleId} group by 1
    `,
    sql<{ rolle: string; anzahl: number }[]>`
      select rolle::text as rolle, count(*)::int as anzahl
      from bewertungen where schule_id = ${schuleId} group by 1 order by 2 desc
    `,
    sql<{ kategorie: string; schnitt: number | null }[]>`
      select k.kategorie, avg(k.wert)::float8 as schnitt
      from bewertungen b
      join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
      cross join lateral (values
        ('A', v.score_a), ('B', v.score_b), ('C', v.score_c),
        ('D', v.score_d), ('E', v.score_e), ('F', v.score_f)
      ) as k(kategorie, wert)
      where b.schule_id = ${schuleId} and b.status = 'freigegeben' and k.wert is not null
      group by 1 order by 1
    `,
    sql<{ monat: string; anzahl: number; schnitt: number | null }[]>`
      select to_char(date_trunc('month', b.erstellt_am), 'YYYY-MM') as monat,
             count(*)::int as anzahl,
             avg(v.gesamtscore)::float8 as schnitt
      from bewertungen b
      join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
      where b.schule_id = ${schuleId}
      group by 1 order by 1
    `,
    sql<{ art: string; anzahl: number }[]>`
      select s.wert ->> 'art' as art, count(*)::int as anzahl
      from bewertungen b, jsonb_array_elements(b.signale) as s(wert)
      where b.schule_id = ${schuleId}
      group by 1 order by 2 desc
    `,
    sql<{ anzahl: number; gesamtscore: string | null; aggressionsindex: string | null }[]>`
      select anzahl, gesamtscore, aggressionsindex from schul_aggregate where schule_id = ${schuleId}
    `,
  ]);

  return {
    schule,
    zustaende: Object.fromEntries(zustaende.map((z) => [z.status, z.anzahl])),
    rollen,
    kategorien,
    verlauf,
    signale,
    aggregat: aggregat[0] ?? null,
  };
}

/**
 * Die Angaben, die die KI-Analyse braucht - ohne alles, was zur Person führt.
 *
 * Kein Kontakt, keine Kontokennung, kein Ort: Das Modell soll Muster in den
 * Abgaben erkennen, nicht Menschen.
 */
export interface Analysegrundlage {
  id: string;
  erstellt_am: Date;
  rolle: string;
  gesamtscore: string | null;
  signale: { art: string }[];
  signalpunkte: number | null;
  klickmuster: { medianMs: number; streuung: number } | null;
  freitexte: Record<string, string>;
}

export async function grundlageFuerAnalyse(schuleId: string, grenze = 300): Promise<Analysegrundlage[]> {
  return sql<Analysegrundlage[]>`
    select b.id, b.erstellt_am, b.rolle::text as rolle, v.gesamtscore,
           b.signale, b.signalpunkte, b.klickmuster, v.freitexte
    from bewertungen b
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.schule_id = ${schuleId}
    order by coalesce(b.signalpunkte, 0) desc, b.erstellt_am desc
    limit ${grenze}
  `;
}

export interface Bewertungszeile {
  id: string;
  status: Zustand;
  rolle: string;
  klassenstufe: number | null;
  erstellt_am: Date;
  moderiert_am: Date | null;
  gesamtscore: string | null;
  signalpunkte: number | null;
  hat_freitext: boolean;
  ist_demo: boolean;
  ablehnungsgrund: string | null;
  signale: { art: string; gewicht: number; erlaeuterung: string }[];
}

/**
 * Die Bewertungen einer Schule, nach Zustand filterbar.
 *
 * Auch die abgelehnten und die noch nicht bestätigten - genau darum geht es
 * hier. Die öffentliche Seite zeigt nur die freigegebenen; wer die Qualität des
 * Bestandes beurteilen will, muss die anderen sehen.
 */
export async function bewertungenDerSchule(
  schuleId: string,
  status: Zustand | "alle" = "alle",
  grenze = 200,
): Promise<Bewertungszeile[]> {
  return sql<Bewertungszeile[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe,
           b.erstellt_am, b.moderiert_am, v.gesamtscore, b.signalpunkte,
           v.freitexte <> '{}'::jsonb as hat_freitext, b.ist_demo, b.ablehnungsgrund, b.signale
    from bewertungen b
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.schule_id = ${schuleId}
      ${status === "alle" ? sql`` : sql`and b.status = ${status}::bewertungsstatus`}
    order by b.erstellt_am desc
    limit ${grenze}
  `;
}
