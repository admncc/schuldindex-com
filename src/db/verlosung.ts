/**
 * Abfragen und Ziehung der monatlichen Verlosung.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import {
  GEWINNE,
  baueLose,
  erzeugeZufallswert,
  monatszeitraum,
  pruefeZiehung,
  ziehe,
  zieheMehrere,
  type Los,
  type Teilnahme,
  type Verlosungsart,
} from "../domain/verlosung";
import { entschluesseleWennMoeglich, verschleiere, type Kontaktart } from "../domain/kontakt";
import { istKennung } from "../domain/kennung";

/**
 * Die Teilnahmen eines Monats.
 *
 * Nur freigegebene Bewertungen: eine gehaltene oder abgelehnte Bewertung nimmt
 * nicht teil, sonst wäre die Verlosung ein Weg, Ablehnungen zu versilbern.
 * Und nur bestätigte Konten - bei einem unbestätigten wüssten wir nicht einmal,
 * wohin der Gewinn ginge.
 */
export async function teilnahmen(
  jahr: number,
  monat: number,
  art: Verlosungsart = "normal",
): Promise<Teilnahme[]> {
  const { von, bis } = monatszeitraum(jahr, monat);
  const mindestens = GEWINNE[art].mindestEmpfehlungen;

  const zeilen = await sql<{ konto_id: string; id: string; rolle: string }[]>`
    select b.konto_id, b.id, b.rolle::text as rolle
    from bewertungen b
    join konten k on k.id = b.konto_id
    where b.verlosung_teilnahme
      and b.status = 'freigegeben'
      and k.verifiziert_am is not null
      and b.erstellt_am >= ${von} and b.erstellt_am < ${bis}
      ${
        art === "normal"
          ? // Wer in der normalen Ziehung schon einmal gewonnen hat, ist dort
            // heraus. Sonst gewinnt auf Dauer, wer am längsten dabei ist.
            sql`and not exists (
                  select 1 from verlosungsgewinne g
                  join verlosungen v on v.id = g.verlosung_id
                  where g.konto_id = b.konto_id and v.art = 'normal'
                )`
          : // Super- und Mega-Verlosung: Es zählt, wie viele im selben Monat
            // geworbene Personen eine **veröffentlichte** Bewertung haben.
            sql`and (
                  select count(*) from empfehlungen e
                  join bewertungen gb on gb.id = e.bewertung_id
                  where e.werber_konto_id = b.konto_id
                    and gb.status = 'freigegeben'
                    and e.erstellt_am >= ${von} and e.erstellt_am < ${bis}
                ) >= ${mindestens}`
      }
    order by b.konto_id, b.id
  `;
  return zeilen.map((z) => ({ kontoId: z.konto_id, bewertungId: z.id, rolle: z.rolle }));
}

export interface Ziehung {
  id: string;
  jahr: number;
  monat: number;
  art: Verlosungsart;
  zufallswert: string;
  lose_gesamt: number;
  gewinner_index: number | null;
  losliste: string[];
  gewinner_konto_id: string | null;
  benachrichtigt_am: Date | null;
  gezogen_am: Date;
}

export async function holeZiehung(
  jahr: number,
  monat: number,
  art: Verlosungsart = "normal",
): Promise<Ziehung | null> {
  const [zeile] = await sql<Ziehung[]>`
    select id, jahr, monat, art::text as art, zufallswert, lose_gesamt, gewinner_index, losliste,
           gewinner_konto_id, benachrichtigt_am, gezogen_am
    from verlosungen where jahr = ${jahr} and monat = ${monat} and art = ${art}::verlosungsart
  `;
  return zeile ?? null;
}

export async function letzteZiehungen(grenze = 12): Promise<Ziehung[]> {
  return sql<Ziehung[]>`
    select id, jahr, monat, art::text as art, zufallswert, lose_gesamt, gewinner_index, losliste,
           gewinner_konto_id, benachrichtigt_am, gezogen_am
    from verlosungen order by jahr desc, monat desc, art limit ${grenze}
  `;
}

export type Ziehungsfehler = "schon_gezogen" | "keine_lose";

export type Ziehungsantwort =
  | { readonly ok: true; readonly ziehung: Ziehung; readonly lose: Los[] }
  | { readonly ok: false; readonly grund: Ziehungsfehler };

/**
 * Zieht den Gewinner eines Monats und schreibt das Ergebnis fest.
 *
 * In einer Transaktion mit einer Sperre auf der Monatszeile: zwei gleichzeitig
 * gestartete Ziehungen desselben Monats dürfen nicht zwei Gewinner ergeben.
 * Die eindeutige Bedingung in der Tabelle fängt den Rest ab.
 */
export async function ziehen(
  jahr: number,
  monat: number,
  moderatorId: string | null = null,
  art: Verlosungsart = "normal",
): Promise<Ziehungsantwort> {
  const liste = await teilnahmen(jahr, monat, art);
  const lose = baueLose(liste);
  const anzahl = GEWINNE[art].anzahl;

  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [vorhanden] = await tx<{ id: string }[]>`
      select id from verlosungen
      where jahr = ${jahr} and monat = ${monat} and art = ${art}::verlosungsart
      for update
    `;
    if (vorhanden) return { ok: false as const, grund: "schon_gezogen" as const };

    const zufallswert = erzeugeZufallswert();
    const ergebnis = zieheMehrere(lose, zufallswert, anzahl);
    const erster = ergebnis.gewinner[0];

    // Auch ein Monat ohne Teilnahmen wird festgehalten. Sonst ließe sich später
    // nicht unterscheiden zwischen „niemand hat mitgemacht“ und „es hat niemand
    // gezogen“.
    const [zeile] = await tx<Ziehung[]>`
      insert into verlosungen (
        jahr, monat, art, zufallswert, lose_gesamt, gewinner_index, losliste,
        gewinner_konto_id, gezogen_von
      ) values (
        ${jahr}, ${monat}, ${art}::verlosungsart, ${zufallswert}, ${lose.length},
        ${erster?.index ?? null},
        ${tx.json(lose.map((l) => l.kontoId) as never)},
        ${erster?.los.kontoId ?? null}, ${moderatorId}
      )
      returning id, jahr, monat, art::text as art, zufallswert, lose_gesamt, gewinner_index,
                losliste, gewinner_konto_id, benachrichtigt_am, gezogen_am
    `;

    // Alle Gewinner einzeln - die Spalte `gewinner_konto_id` trägt weiterhin
    // den ersten, damit die bereits gezogenen Monate lesbar bleiben.
    for (const [platz, g] of ergebnis.gewinner.entries()) {
      await tx`
        insert into verlosungsgewinne (verlosung_id, konto_id, platz, los_index)
        values (${zeile!.id}, ${g.los.kontoId}, ${platz + 1}, ${g.index})
        on conflict (verlosung_id, konto_id) do nothing
      `;
    }

    return { ok: true as const, ziehung: zeile!, lose };
  });
}

export interface Gewinn {
  readonly id: string;
  readonly kontoId: string;
  readonly platz: number;
  readonly benachrichtigtAm: Date | null;
}

/** Die Gewinner einer Ziehung, in der Reihenfolge der Ziehung. */
export async function gewinner(ziehungId: string): Promise<Gewinn[]> {
  if (!istKennung(ziehungId)) return [];
  const zeilen = await sql<
    { id: string; konto_id: string; platz: number; benachrichtigt_am: Date | null }[]
  >`
    select id, konto_id, platz, benachrichtigt_am
    from verlosungsgewinne where verlosung_id = ${ziehungId}
    order by platz
  `;
  return zeilen.map((z) => ({
    id: z.id,
    kontoId: z.konto_id,
    platz: z.platz,
    benachrichtigtAm: z.benachrichtigt_am,
  }));
}

/**
 * Der Kontakt der gewinnenden Person - nur für die Benachrichtigung.
 *
 * Wie in der Moderation getrennt gehalten: die Übersicht kommt ohne aus, und
 * was nicht gebraucht wird, soll nicht beiläufig mitlaufen.
 */
export async function gewinnerkontakt(
  gewinnId: string,
): Promise<{ klartext: string; verschleiert: string; art: Kontaktart } | null> {
  if (!istKennung(gewinnId)) return null;
  const [zeile] = await sql<{ kontakt_chiffre: Uint8Array | null; kontaktart: Kontaktart }[]>`
    select k.kontakt_chiffre, k.kontaktart
    from verlosungsgewinne g join konten k on k.id = g.konto_id
    where g.id = ${gewinnId}
  `;
  if (!zeile) return null;

  const klartext =
    zeile.kontakt_chiffre === null
      ? null
      : entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));
  if (klartext === null) return null;
  return { klartext, verschleiert: verschleiere(klartext, zeile.kontaktart), art: zeile.kontaktart };
}

export async function merkeBenachrichtigung(gewinnId: string): Promise<void> {
  if (!istKennung(gewinnId)) return;
  await sql`update verlosungsgewinne set benachrichtigt_am = now() where id = ${gewinnId}`;
}

/**
 * Rechnet eine gespeicherte Ziehung nach.
 *
 * Gebraucht, wenn jemand die Ziehung anzweifelt - und als Prüfung, dass die
 * gespeicherte Losliste zum eingetragenen Gewinner passt.
 */
export async function pruefeGespeicherteZiehung(jahr: number, monat: number): Promise<boolean | null> {
  const ziehung = await holeZiehung(jahr, monat);
  if (ziehung === null) return null;
  if (ziehung.gewinner_konto_id === null) return ziehung.lose_gesamt === 0;

  const lose: Los[] = ziehung.losliste.map((kontoId) => ({ kontoId, bewertungIds: [] }));
  return pruefeZiehung(lose, ziehung.zufallswert, ziehung.gewinner_konto_id);
}
