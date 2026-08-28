/**
 * Abfragen für die Ranglisten.
 *
 * Zwei Listen, bewusst gleichwertig nebeneinander: die bestbewerteten Schulen
 * und die mit dem höchsten Verbesserungsbedarf. Nur die erste zu zeigen wäre
 * bequemer, gäbe aber ein schiefes Bild - und die zweite ist für Eltern bei der
 * Schulwahl die nützlichere.
 *
 * Die Schwelle liegt höher als beim Schulprofil: **20** statt 10 Bewertungen.
 * Ein Platz in einer Rangliste ist eine Aussage im Vergleich zu allen anderen
 * Schulen; dafür muss die Zahl tragen.
 */

import { sql } from "./verbindung";
import { MINDESTZAHL_RANGLISTE, trendAusScores, type Trend } from "../domain/aggregation";
import type { Bundesland } from "../domain/bundesland";
import type { Schulart } from "../import/schulart";

export interface Ranglisteneintrag {
  slug: string;
  name: string;
  ort: string | null;
  bundesland: Bundesland;
  schularten: Schulart[];
  gesamtscore: string;
  anzahl: number;
  gesamtscore_vor_6m: string | null;
  anzahl_vor_6m: number;
}

export interface Ranglistenfilter {
  readonly bundesland?: Bundesland | undefined;
  readonly schulart?: Schulart | undefined;
  readonly limit?: number | undefined;
}

export type Richtung = "beste" | "verbesserungsbedarf";

/**
 * Eine Rangliste.
 *
 * `nulls last` fehlt bewusst nicht: Schulen ohne veröffentlichten Score haben in
 * keiner der beiden Listen etwas zu suchen, weder oben noch unten. Sie werden
 * über die `where`-Bedingung ausgeschlossen, nicht über die Sortierung.
 */
export async function rangliste(
  richtung: Richtung,
  f: Ranglistenfilter = {},
): Promise<Ranglisteneintrag[]> {
  const grenze = f.limit ?? 25;
  return sql<Ranglisteneintrag[]>`
    select s.slug, s.name, s.ort, s.bundesland, s.schularten,
           a.gesamtscore, a.anzahl, a.gesamtscore_vor_6m, a.anzahl_vor_6m
    from schul_aggregate a
    join schulen s on s.id = a.schule_id
    where a.anzahl >= ${MINDESTZAHL_RANGLISTE}
      and a.gesamtscore is not null
      and s.ist_aktiv
      ${f.bundesland ? sql`and s.bundesland = ${f.bundesland}::bundesland` : sql``}
      ${f.schulart ? sql`and ${f.schulart}::schulart = any(s.schularten)` : sql``}
    order by ${richtung === "beste" ? sql`a.gesamtscore desc` : sql`a.gesamtscore asc`}, a.anzahl desc
    limit ${grenze}
  `;
}

/** Der Sechs-Monats-Trend zu einem Eintrag, aus den vorberechneten Ständen. */
export function trendZu(eintrag: Ranglisteneintrag): Trend {
  return trendAusScores(
    { score: Number(eintrag.gesamtscore), anzahl: eintrag.anzahl },
    {
      score: eintrag.gesamtscore_vor_6m === null ? null : Number(eintrag.gesamtscore_vor_6m),
      anzahl: eintrag.anzahl_vor_6m,
    },
    MINDESTZAHL_RANGLISTE,
  );
}

export interface Ranglistenlage {
  /** Wie viele Schulen die Schwelle überhaupt erreichen. */
  readonly ranglistenfaehig: number;
  /** Wie viele Schulen mindestens eine freigegebene Bewertung haben. */
  readonly mitBewertung: number;
  readonly gesamt: number;
}

/**
 * Wie tragfähig die Ranglisten gerade sind.
 *
 * Steht über den Listen, weil eine Rangliste aus vier Schulen sonst aussieht
 * wie eine Aussage über Deutschland. In den ersten Monaten nach dem Start ist
 * genau das der Normalfall.
 */
export async function ranglistenlage(
  bundesland?: Bundesland,
  schulart?: Schulart,
): Promise<Ranglistenlage> {
  // Der Filter gilt auch für die Zählung. Sonst stünde über einer Liste mit
  // drei Hamburger Schulen, dass 412 Schulen die Schwelle erreichen.
  const [zeile] = await sql<{ faehig: number; mit: number; gesamt: number }[]>`
    select
      count(*) filter (where a.anzahl >= ${MINDESTZAHL_RANGLISTE} and a.gesamtscore is not null)::int as faehig,
      count(*) filter (where a.anzahl > 0)::int as mit,
      (select count(*)::int from schulen s2
        where s2.ist_aktiv
          ${bundesland ? sql`and s2.bundesland = ${bundesland}::bundesland` : sql``}
          ${schulart ? sql`and ${schulart}::schulart = any(s2.schularten)` : sql``}
      ) as gesamt
    from schul_aggregate a
    join schulen s on s.id = a.schule_id and s.ist_aktiv
    where true
      ${bundesland ? sql`and s.bundesland = ${bundesland}::bundesland` : sql``}
      ${schulart ? sql`and ${schulart}::schulart = any(s.schularten)` : sql``}
  `;
  return {
    ranglistenfaehig: zeile?.faehig ?? 0,
    mitBewertung: zeile?.mit ?? 0,
    gesamt: zeile?.gesamt ?? 0,
  };
}
