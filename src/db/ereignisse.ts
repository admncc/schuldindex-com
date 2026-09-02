/**
 * Das Ereignisprotokoll schreiben, lesen und wieder loswerden.
 *
 * Bisher verschwand jeder Serverfehler in die Konsole des Dienstes. Wer nicht
 * in derselben Minute `journalctl` offen hatte, erfuhr nichts davon - und
 * genau die Fehler, die selten sind, sind die, die man sucht.
 */

import { sql } from "./verbindung";
import { PROTOKOLL_STUNDEN, saeubere, saeubereWert, type Ereignisart } from "../domain/diagnose";

export interface Ereignis {
  readonly art: Ereignisart;
  readonly bereich: string;
  readonly meldung: string;
  readonly einzelheiten?: Record<string, unknown>;
  readonly pfad?: string | null;
  readonly status?: number | null;
  readonly dauerMs?: number | null;
}

export interface Ereigniszeile {
  readonly id: string;
  readonly art: Ereignisart;
  readonly bereich: string;
  readonly meldung: string;
  readonly einzelheiten: Record<string, unknown>;
  readonly pfad: string | null;
  readonly status: number | null;
  readonly dauer_ms: number | null;
  readonly erstellt_am: Date;
}

/**
 * Schreibt ein Ereignis.
 *
 * **Wirft nie.** Ein Protokollschreiber, der eine Anfrage mitreißt, wenn die
 * Datenbank klemmt, verwandelt eine Störung in einen Ausfall - und zwar
 * ausgerechnet in dem Moment, in dem das Protokoll gebraucht würde.
 */
export async function protokolliere(e: Ereignis): Promise<void> {
  try {
    await sql`
      insert into ereignisse (art, bereich, meldung, einzelheiten, pfad, status, dauer_ms)
      values (
        ${e.art}, ${saeubere(e.bereich).slice(0, 60)}, ${saeubere(e.meldung)},
        ${sql.json(saeubereWert(e.einzelheiten ?? {}) as never)},
        ${e.pfad === undefined || e.pfad === null ? null : saeubere(e.pfad).slice(0, 500)},
        ${e.status ?? null}, ${e.dauerMs ?? null}
      )
    `;
  } catch {
    // Bewusst still. Ein `console.error` hier landete in derselben Konsole,
    // die niemand liest, und ein erneuter Versuch träfe dieselbe Störung.
  }
  void raeumeAuf();
}

let zuletztGeraeumt = 0;
const RAEUMABSTAND_MS = 10 * 60_000;

/**
 * Löscht, was älter als 72 Stunden ist.
 *
 * Kein Zeitplan, sondern beiläufig: Es gibt im Portal nichts, was regelmäßig
 * läuft - kein Cron, kein Worker -, und eine Frist, die von einem Zeitplan
 * abhängt, den niemand eingerichtet hat, ist keine Frist. Ausgelöst wird sie
 * deshalb von dem, was ohnehin passiert: vom Schreiben und vom Lesen. Der
 * Abstand von zehn Minuten hält den Aufwand aus dem heissen Pfad.
 */
export async function raeumeAuf(erzwingen = false): Promise<number> {
  const jetzt = Date.now();
  if (!erzwingen && jetzt - zuletztGeraeumt < RAEUMABSTAND_MS) return 0;
  zuletztGeraeumt = jetzt;

  try {
    const weg = await sql`
      delete from ereignisse
      where erstellt_am < now() - ${`${PROTOKOLL_STUNDEN} hours`}::interval
    `;
    return weg.count;
  } catch {
    return 0;
  }
}

export interface Protokollfilter {
  readonly art?: Ereignisart | undefined;
  readonly bereich?: string | undefined;
  readonly suche?: string | undefined;
  readonly grenze?: number | undefined;
  readonly vorId?: string | undefined;
}

export async function leseEreignisse(filter: Protokollfilter = {}): Promise<Ereigniszeile[]> {
  const grenze = Math.min(Math.max(filter.grenze ?? 100, 1), 500);

  return sql<Ereigniszeile[]>`
    select id::text, art::text, bereich, meldung, einzelheiten, pfad, status, dauer_ms, erstellt_am
    from ereignisse
    where erstellt_am >= now() - ${`${PROTOKOLL_STUNDEN} hours`}::interval
      ${filter.art ? sql`and art = ${filter.art}` : sql``}
      ${filter.bereich ? sql`and bereich = ${filter.bereich}` : sql``}
      ${filter.suche ? sql`and meldung ilike ${"%" + filter.suche + "%"}` : sql``}
      ${filter.vorId ? sql`and id < ${filter.vorId}::bigint` : sql``}
    order by id desc
    limit ${grenze}
  `;
}

export interface Bereichszahl {
  readonly bereich: string;
  readonly art: Ereignisart;
  readonly anzahl: number;
}

/** Womit man anfängt: was ist überhaupt da, und wovon viel? */
export async function ereigniszahlen(): Promise<Bereichszahl[]> {
  return sql<Bereichszahl[]>`
    select bereich, art::text, count(*)::int as anzahl
    from ereignisse
    where erstellt_am >= now() - ${`${PROTOKOLL_STUNDEN} hours`}::interval
    group by bereich, art
    order by count(*) desc
  `;
}
