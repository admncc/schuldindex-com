/**
 * Abfragen rund um die KI-Zusammenfassungen.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { MINDESTZAHL_FREITEXTE, type Beanstandung } from "../ki/pruefung";
import { istFaellig, type Ergebnis } from "../ki/zusammenfassung";

type Ausfuehrer = postgres.Sql | postgres.TransactionSql;

export interface VeroeffentlichteZusammenfassung {
  text: string;
  positive_themen: string[];
  kritische_themen: string[];
  aus_anzahl: number;
  erstellt_am: Date;
}

export async function holeZusammenfassung(
  schuleId: string,
  tx: Ausfuehrer = sql,
): Promise<VeroeffentlichteZusammenfassung | null> {
  const [zeile] = await tx<VeroeffentlichteZusammenfassung[]>`
    select text, positive_themen, kritische_themen, aus_anzahl, erstellt_am
    from schul_zusammenfassungen
    where schule_id = ${schuleId} and status = 'veroeffentlicht'
    order by erstellt_am desc
    limit 1
  `;
  return zeile ?? null;
}

/**
 * Die Freitexte einer Schule, jüngste zuerst.
 *
 * Nur freigegebene Bewertungen und nur die jeweils aktuelle Fassung: eine
 * zurückgezogene oder überschriebene Aussage darf in der Zusammenfassung nicht
 * weiterleben.
 */
export async function holeFreitexte(schuleId: string, grenze = 200): Promise<string[]> {
  const zeilen = await sql<{ text: string }[]>`
    select jsonb_each.value #>> '{}' as text
    from bewertungen b
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    cross join lateral jsonb_each(v.freitexte)
    where b.schule_id = ${schuleId}
      and b.status = 'freigegeben'
      and jsonb_typeof(jsonb_each.value) = 'string'
      and length(jsonb_each.value #>> '{}') > 0
    order by b.erstellt_am desc
    limit ${grenze}
  `;
  return zeilen.map((z) => z.text);
}

export interface FaelligeSchule {
  id: string;
  name: string;
  slug: string;
  anzahl_mit_freitext: number;
  zuletzt_am: Date | null;
  zuletzt_aus_anzahl: number | null;
}

/**
 * Welche Schulen eine neue Zusammenfassung brauchen.
 *
 * Die Vorauswahl trifft die Datenbank (Mindestmenge), die Entscheidung trifft
 * `istFaellig` — dieselbe Funktion, die auch geprüft ist. Ohne die Vorauswahl
 * liefe die Abfrage über alle 31.770 Schulen, von denen die allermeisten gar
 * keine Bewertung haben.
 */
export async function faelligeSchulen(jetzt = new Date(), grenze = 100): Promise<FaelligeSchule[]> {
  const kandidaten = await sql<FaelligeSchule[]>`
    select s.id, s.name, s.slug,
           a.anzahl_mit_freitext,
           z.erstellt_am as zuletzt_am,
           z.aus_anzahl as zuletzt_aus_anzahl
    from schul_aggregate a
    join schulen s on s.id = a.schule_id
    left join lateral (
      select erstellt_am, aus_anzahl from schul_zusammenfassungen
      where schule_id = a.schule_id and status <> 'fehlgeschlagen'
      order by erstellt_am desc limit 1
    ) z on true
    where a.anzahl_mit_freitext >= ${MINDESTZAHL_FREITEXTE}
    order by coalesce(z.erstellt_am, 'epoch'::timestamptz) asc
    limit ${grenze}
  `;

  return kandidaten.filter((k) =>
    istFaellig(
      {
        anzahlMitFreitext: k.anzahl_mit_freitext,
        zuletztAm: k.zuletzt_am,
        zuletztAusAnzahl: k.zuletzt_aus_anzahl,
      },
      jetzt,
    ),
  );
}

/** Schreibt das Ergebnis eines Laufs fort — auch das misslungene. */
export async function speichereErgebnis(
  schuleId: string,
  ergebnis: Ergebnis,
  ausAnzahl: number,
): Promise<void> {
  if (ergebnis.status === "zu_wenig_grundlage") return;

  const gemeinsam = { schuleId, ausAnzahl };

  if (ergebnis.status === "fehlgeschlagen") {
    await sql`
      insert into schul_zusammenfassungen (schule_id, status, aus_anzahl, modell, fehlergrund)
      values (${gemeinsam.schuleId}, 'fehlgeschlagen', ${gemeinsam.ausAnzahl}, 'unbekannt', ${ergebnis.grund})
    `;
    return;
  }

  const beanstandungen: readonly Beanstandung[] = ergebnis.beanstandungen;
  const positive = ergebnis.status === "veroeffentlicht" ? ergebnis.positiveThemen : [];
  const kritische = ergebnis.status === "veroeffentlicht" ? ergebnis.kritischeThemen : [];

  await sql`
    insert into schul_zusammenfassungen
      (schule_id, status, text, positive_themen, kritische_themen, beanstandungen, aus_anzahl, modell)
    values (
      ${gemeinsam.schuleId}, ${ergebnis.status}::zusammenfassungstatus, ${ergebnis.text},
      ${sql.json(positive as never)}, ${sql.json(kritische as never)},
      ${sql.json(beanstandungen as never)}, ${gemeinsam.ausAnzahl}, ${ergebnis.modell}
    )
  `;
}

export interface EskalierteZusammenfassung {
  id: string;
  schule_name: string;
  schule_slug: string;
  text: string;
  beanstandungen: Beanstandung[];
  aus_anzahl: number;
  erstellt_am: Date;
}

/** Für die Moderation: Zusammenfassungen, die die Nachprüfung aufgehalten hat. */
export async function eskalierteZusammenfassungen(grenze = 50): Promise<EskalierteZusammenfassung[]> {
  return sql<EskalierteZusammenfassung[]>`
    select z.id, s.name as schule_name, s.slug as schule_slug, z.text,
           z.beanstandungen, z.aus_anzahl, z.erstellt_am
    from schul_zusammenfassungen z
    join schulen s on s.id = z.schule_id
    where z.status = 'eskaliert'
      -- Nur solange nichts Neueres für dieselbe Schule vorliegt: ein späterer
      -- Lauf, der durchging, erledigt den alten Fund.
      and not exists (
        select 1 from schul_zusammenfassungen n
        where n.schule_id = z.schule_id and n.erstellt_am > z.erstellt_am
      )
    order by z.erstellt_am desc
    limit ${grenze}
  `;
}
