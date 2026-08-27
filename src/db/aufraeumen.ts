/**
 * Der Aufräumlauf: setzt die Aufbewahrungsfristen tatsächlich um.
 *
 * Jede Regel aus `domain/aufbewahrung.ts` hat hier genau eine Abfrage. Der Lauf
 * kann trocken laufen — dann zählt er nur —, und er hinterlässt in jedem Fall
 * eine Zeile in `aufraeumlaeufe`. Ohne diese Spur wäre ein Lauf, der seit
 * Monaten mit einem Fehler abbricht, von einem, bei dem nichts fällig war, nicht
 * zu unterscheiden.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { stichtag, type Aufbewahrungsart, type Aufraeumbilanz } from "../domain/aufbewahrung";

type Ausfuehrer = postgres.Sql | postgres.TransactionSql;

/**
 * Legt ein ruhendes Konto still: Kontakt weg, Zeile bleibt.
 *
 * Die Zeile bleibt, weil die Bewertungen an ihr hängen und mit ihr fielen. Was
 * bleibt, ist ein Anker ohne Person — genau das, was ein anonymes Bewertungs-
 * portal nach Ablauf der Frist noch haben darf.
 *
 * Als Nutzung zählt jede Anmeldung **und** jede Bewertung: wer bewertet und sich
 * nie anmeldet, benutzt das Portal trotzdem.
 */
async function legeKontenStill(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("konto_stilllegen", jetzt);

  const bedingung = tx`
    from konten k
    where k.stillgelegt_am is null
      and greatest(
        coalesce(k.letzte_anmeldung, k.erstellt_am),
        coalesce((select max(b.aktualisiert_am) from bewertungen b where b.konto_id = k.id), k.erstellt_am)
      ) < ${grenze}
  `;

  if (trocken) {
    const [zeile] = await tx<{ n: number }[]>`select count(*)::int as n ${bedingung}`;
    return zeile?.n ?? 0;
  }

  const [zeile] = await tx<{ n: number }[]>`
    with faellig as (select k.id ${bedingung})
    , stillgelegt as (
      update konten set kontakt_chiffre = null, kontakt_hash = null, stillgelegt_am = now()
      where id in (select id from faellig)
      returning id
    )
    select count(*)::int as n from stillgelegt
  `;
  return zeile?.n ?? 0;
}

async function loescheToken(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("token_loeschen", jetzt);
  if (trocken) {
    const [z] = await tx<{ n: number }[]>`
      select count(*)::int as n from verifizierungstoken where gueltig_bis < ${grenze}
    `;
    return z?.n ?? 0;
  }
  const ergebnis = await tx`delete from verifizierungstoken where gueltig_bis < ${grenze}`;
  return ergebnis.count;
}

/** Drei Sitzungstabellen, eine Frist: Konten, Moderation, Schulzugänge. */
async function loescheSitzungen(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("sitzungen_loeschen", jetzt);
  let summe = 0;

  for (const tabelle of ["konto_sitzungen", "moderator_sitzungen", "schulzugang_sitzungen"] as const) {
    if (trocken) {
      const [z] = await tx<{ n: number }[]>`
        select count(*)::int as n from ${tx(tabelle)} where gueltig_bis < ${grenze}
      `;
      summe += z?.n ?? 0;
    } else {
      const ergebnis = await tx`delete from ${tx(tabelle)} where gueltig_bis < ${grenze}`;
      summe += ergebnis.count;
    }
  }
  return summe;
}

async function loescheAbgelehnte(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("abgelehnte_loeschen", jetzt);
  // `moderiert_am` ist der Zeitpunkt der Entscheidung. Fehlt er — etwa bei einer
  // Ablehnung aus der Frühzeit —, zählt die letzte Änderung.
  if (trocken) {
    const [z] = await tx<{ n: number }[]>`
      select count(*)::int as n from bewertungen
      where status = 'abgelehnt' and coalesce(moderiert_am, aktualisiert_am) < ${grenze}
    `;
    return z?.n ?? 0;
  }
  const ergebnis = await tx`
    delete from bewertungen
    where status = 'abgelehnt' and coalesce(moderiert_am, aktualisiert_am) < ${grenze}
  `;
  return ergebnis.count;
}

async function loescheMeldungen(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("meldungen_loeschen", jetzt);
  if (trocken) {
    const [z] = await tx<{ n: number }[]>`
      select count(*)::int as n from meldungen
      where status in ('erledigt', 'abgelehnt') and entschieden_am < ${grenze}
    `;
    return z?.n ?? 0;
  }
  const ergebnis = await tx`
    delete from meldungen
    where status in ('erledigt', 'abgelehnt') and entschieden_am < ${grenze}
  `;
  return ergebnis.count;
}

async function loescheZugaenge(tx: Ausfuehrer, jetzt: Date, trocken: boolean): Promise<number> {
  const grenze = stichtag("zugaenge_loeschen", jetzt);
  // Aktive Zugänge bleiben unberührt, solange sie gelten — auch dann, wenn sie
  // älter als die Frist sind.
  const bedingung = tx`
    from schulzugaenge
    where (status = 'abgelehnt' and entschieden_am < ${grenze})
       or (status <> 'aktiv' and erstellt_am < ${grenze})
       or (status = 'aktiv' and gueltig_bis < ${grenze})
  `;
  if (trocken) {
    const [z] = await tx<{ n: number }[]>`select count(*)::int as n ${bedingung}`;
    return z?.n ?? 0;
  }
  const ergebnis = await tx`delete ${bedingung}`;
  return ergebnis.count;
}

const LAEUFE: Readonly<
  Record<Aufbewahrungsart, (tx: Ausfuehrer, jetzt: Date, trocken: boolean) => Promise<number>>
> = {
  konto_stilllegen: legeKontenStill,
  token_loeschen: loescheToken,
  sitzungen_loeschen: loescheSitzungen,
  abgelehnte_loeschen: loescheAbgelehnte,
  meldungen_loeschen: loescheMeldungen,
  zugaenge_loeschen: loescheZugaenge,
};

export interface Laufergebnis {
  readonly bilanzen: readonly Aufraeumbilanz[];
  readonly dauerMs: number;
  readonly trocken: boolean;
}

/**
 * Räumt auf.
 *
 * Nicht in einer einzigen Transaktion: die Regeln hängen nicht voneinander ab,
 * und ein Fehler in der letzten soll die ersten fünf nicht zurücknehmen. Was
 * gelöscht ist, bleibt gelöscht.
 */
export async function raeumeAuf(trocken = false, jetzt = new Date()): Promise<Laufergebnis> {
  const begonnen = Date.now();
  const bilanzen: Aufraeumbilanz[] = [];

  for (const [art, lauf] of Object.entries(LAEUFE) as [Aufbewahrungsart, (typeof LAEUFE)[Aufbewahrungsart]][]) {
    bilanzen.push({ art, betroffen: await lauf(sql, jetzt, trocken) });
  }

  const dauerMs = Date.now() - begonnen;
  await sql`
    insert into aufraeumlaeufe (bilanz, trocken, dauer_ms)
    values (${sql.json(bilanzen as never)}, ${trocken}, ${dauerMs})
  `;

  return { bilanzen, dauerMs, trocken };
}

export interface Aufraeumlauf {
  id: string;
  bilanz: Aufraeumbilanz[];
  trocken: boolean;
  gelaufen_am: Date;
  dauer_ms: number | null;
}

export async function letzteLaeufe(grenze = 10): Promise<Aufraeumlauf[]> {
  return sql<Aufraeumlauf[]>`
    select id, bilanz, trocken, gelaufen_am, dauer_ms
    from aufraeumlaeufe order by gelaufen_am desc limit ${grenze}
  `;
}
