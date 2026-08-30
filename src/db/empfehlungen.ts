/**
 * Empfehlungen in der Datenbank.
 *
 * Der Code hängt am Konto und wird beim ersten Bedarf erzeugt - nicht schon
 * beim Anlegen: Wer bewertet und nie bestätigt, braucht keinen Link, und ein
 * Code, der nie ausgegeben wurde, ist nur eine Zeile mehr im Index.
 */

import { sql } from "./verbindung";
import { istEmpfehlungscode } from "../domain/empfehlung";
import { erzeugeEmpfehlungscode } from "../domain/empfehlungscode";
import { istKennung } from "../domain/kennung";
import type { Zeitraum } from "../domain/verlosung";

/**
 * Der Code des Kontos - vorhandener oder neu erzeugter.
 *
 * Die Schleife fängt den seltenen Fall ab, dass zwei Konten denselben Code
 * ziehen. Bei 50 Bit ist das kaum zu erwarten, aber ein eindeutiger Index, der
 * einmal im Jahr eine Bestätigungsseite scheitern lässt, wäre teurer als drei
 * Zeilen Code.
 */
export async function empfehlungscodeFuer(kontoId: string): Promise<string | null> {
  if (!istKennung(kontoId)) return null;

  const [vorhanden] = await sql<{ empfehlungscode: string | null }[]>`
    select empfehlungscode from konten where id = ${kontoId}
  `;
  if (vorhanden === undefined) return null;
  if (vorhanden.empfehlungscode !== null) return vorhanden.empfehlungscode;

  for (let versuch = 0; versuch < 5; versuch++) {
    const code = erzeugeEmpfehlungscode();
    const zeilen = await sql<{ empfehlungscode: string }[]>`
      update konten set empfehlungscode = ${code}
      where id = ${kontoId} and empfehlungscode is null
        and not exists (select 1 from konten k where k.empfehlungscode = ${code})
      returning empfehlungscode
    `;
    if (zeilen[0] !== undefined) return zeilen[0].empfehlungscode;

    // Ein anderer Aufruf war schneller - dann steht der Code jetzt da.
    const [nachher] = await sql<{ empfehlungscode: string | null }[]>`
      select empfehlungscode from konten where id = ${kontoId}
    `;
    if (nachher?.empfehlungscode) return nachher.empfehlungscode;
  }
  return null;
}

/** Das werbende Konto zu einem Code. */
export async function kontoZuCode(code: string): Promise<string | null> {
  if (!istEmpfehlungscode(code)) return null;
  const [zeile] = await sql<{ id: string }[]>`
    select id from konten where empfehlungscode = ${code}
  `;
  return zeile?.id ?? null;
}

/**
 * Hält fest, dass ein Konto über eine Empfehlung entstanden ist.
 *
 * Läuft still ins Leere, wenn die Beziehung schon besteht, wenn jemand sich
 * selbst wirbt oder wenn der Code nicht zuzuordnen ist. Eine Fehlermeldung
 * hätte an dieser Stelle keinen Empfänger: Die Person hat gerade bewertet, und
 * die Bewertung ist wichtiger als die Empfehlung.
 */
export async function merkeEmpfehlung(
  werberKontoId: string,
  geworbenesKontoId: string,
  bewertungId: string,
): Promise<boolean> {
  if (!istKennung(werberKontoId) || !istKennung(geworbenesKontoId)) return false;
  if (werberKontoId === geworbenesKontoId) return false;

  const zeilen = await sql<{ id: string }[]>`
    insert into empfehlungen (werber_konto_id, geworbenes_konto_id, bewertung_id)
    values (${werberKontoId}, ${geworbenesKontoId}, ${bewertungId})
    on conflict (geworbenes_konto_id) do nothing
    returning id
  `;
  return zeilen.length > 0;
}

/**
 * Höchstens so viele zählende Empfehlungen je Werber und Gerät.
 *
 * Die Regel „Empfehlungen aus demselben Browser zählen nicht" verglich bisher
 * nur gegen die Bewertungen **des Werbers**. Wer das Werberkonto auf dem Handy
 * anlegt und danach hundert Strohkonten der Reihe nach im selben
 * Laptop-Browser durchklickt, wurde von keiner Zeile erfasst: Keine der
 * hundert Kennungen stimmt mit der des Handys überein. Kein privates Fenster,
 * kein gelöschtes Cookie nötig.
 *
 * Gezählt werden deshalb zusätzlich die Geworbenen **untereinander**. Zwei je
 * Gerät, nicht eins: In einer Familie oder im Computerraum ist derselbe
 * Browser der Normalfall, und wer seine Schwester am eigenen Rechner bewerten
 * lässt, soll dafür nicht bestraft werden. Hundert sind es dort nicht.
 */
export const HOECHSTENS_JE_GERAET = 2;

/**
 * Die Empfehlungen eines Zeitraums, die zählen - als Unterabfrage.
 *
 * **Eine Stelle für alle.** Vorher rechneten Kontoseite, Panel und Ziehung
 * drei verschiedene Zahlen aus derselben Tabelle: Die Kontoseite filterte das
 * gleiche Gerät heraus, das Panel nicht, und die Ziehung noch einmal anders.
 * Im Panel stand dann die Plakette „Mega-Verlosung" an einem Konto, das die
 * Ziehung gar nicht in den Topf nahm - eine Abweichung, die erst auffällt,
 * wenn jemand reklamiert.
 *
 * Drei Bedingungen, alle drei aus der Missbrauchsabwehr:
 *
 *  - Die geworbene Bewertung ist **veröffentlicht**. Eine gehaltene oder
 *    abgelehnte zählt nicht, sonst wäre die Ablehnung zu versilbern.
 *  - Sie trägt eine **Gerätekennung**. Ohne sie liefe die Prüfung darunter ins
 *    Leere (`null = null` ist nicht wahr), und weil die Kennung aus einem
 *    Cookie kommt, das sich weglassen lässt, wäre das Weglassen die Umgehung.
 *    Für die normale Verlosung bleibt eine solche Bewertung gültig - dort geht
 *    es um die eigene Abgabe, nicht um eine Werbeprämie.
 *  - Sie kommt **nicht** aus dem Browser des Werbers und nicht als dritte aus
 *    demselben Browser wie zwei andere Geworbene desselben Werbers.
 */
export function zaehlendeEmpfehlungen(zeitraum: Zeitraum) {
  return sql`
    select k.id, k.werber_konto_id
    from (
      select e.id, e.werber_konto_id,
             row_number() over (
               partition by e.werber_konto_id, gb.geraet_hash
               order by e.erstellt_am, e.id
             ) as je_geraet
      from empfehlungen e
      join bewertungen gb on gb.id = e.bewertung_id
      where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}
        and gb.status = 'freigegeben'
        and gb.geraet_hash is not null
        and not exists (
          select 1 from bewertungen sb
          where sb.konto_id = e.werber_konto_id
            and sb.geraet_hash is not null
            and sb.geraet_hash = gb.geraet_hash
        )
    ) k
    where k.je_geraet <= ${HOECHSTENS_JE_GERAET}
  `;
}

export interface Empfehlungsstand {
  /** Wie viele geworbene Personen bewertet haben - unabhängig vom Zustand. */
  readonly geworben: number;
  /** Davon mit veröffentlichter Bewertung - nur die zählen für die Super-Verlosung. */
  readonly zaehlend: number;
}

/** Der Stand eines Kontos im laufenden Monat. */
export async function empfehlungsstand(
  kontoId: string,
  zeitraum: Zeitraum,
): Promise<Empfehlungsstand> {
  if (!istKennung(kontoId)) return { geworben: 0, zaehlend: 0 };

  const [zeile] = await sql<{ geworben: number; zaehlend: number }[]>`
    select
      (select count(*)::int from empfehlungen e
       where e.werber_konto_id = ${kontoId}
         and e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}) as geworben,
      -- Genau die Menge, aus der die Ziehung rechnet. Stünde hier eine andere
      -- Zahl, verspräche die Kontoseite eine Teilnahme, die es nicht gibt.
      (select count(*)::int from (${zaehlendeEmpfehlungen(zeitraum)}) z
       where z.werber_konto_id = ${kontoId}) as zaehlend
  `;
  return { geworben: zeile?.geworben ?? 0, zaehlend: zeile?.zaehlend ?? 0 };
}

/** Wie viele Empfehlungen es insgesamt gab - für die Übersicht im Panel. */
export async function empfehlungszahlen(zeitraum: Zeitraum): Promise<{
  gesamt: number;
  zaehlend: number;
  werber: number;
}> {
  const [zeile] = await sql<{ gesamt: number; zaehlend: number; werber: number }[]>`
    select
      (select count(*)::int from empfehlungen e
       where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}) as gesamt,
      (select count(*)::int from (${zaehlendeEmpfehlungen(zeitraum)}) z) as zaehlend,
      (select count(distinct e.werber_konto_id)::int from empfehlungen e
       where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}) as werber
  `;
  return zeile ?? { gesamt: 0, zaehlend: 0, werber: 0 };
}

export interface Empfehlungszeile {
  readonly id: string;
  readonly erstelltAm: Date;
  /**
   * Kennung des werbenden Kontos.
   *
   * **Nicht** die Kennung aus dem Empfehlungslink - dort steht der zehnstellige
   * Code (`werbercode`). Die Kontokennung verlässt den Server sonst nirgends;
   * hier steht sie, weil sich „wer hat wen geworben" ohne eine stabile Kennung
   * nicht prüfen lässt, und weil sie kein Anmeldemittel ist: Angemeldet wird
   * ausschliesslich über Tokenabdrücke.
   */
  readonly werberId: string;
  readonly werbercode: string | null;
  /** Kennung des geworbenen Kontos. */
  readonly geworbenId: string;
  readonly bewertungId: string | null;
  readonly status: string | null;
  readonly schulname: string | null;
  readonly schulslug: string | null;
  /**
   * Kam die geworbene Bewertung aus demselben Browser wie eine des Werbers?
   *
   * Das ist der Fall, auf den es in dieser Liste ankommt: Wer sich selbst
   * wirbt, tut das in aller Regel im selben Fenster oder im privaten Tab
   * desselben Geräts. **Kein Beweis** - in einer Familie oder im Computerraum
   * ist derselbe Browser der Normalfall -, aber der erste Ort, an dem man
   * hinsieht.
   */
  readonly gleichesGeraet: boolean;
  /** Wie viele Empfehlungen dieses Werbers im Zeitraum bereits zählen. */
  readonly zaehlendeDesWerbers: number;
}

/**
 * Die Empfehlungen eines Zeitraums, neueste zuerst.
 *
 * Zeigt beide Kennungen: die des werbenden Kontos (das ist die UUID, die im
 * Link steht) und die des geworbenen. Dazu, ob die Bewertung schon
 * veröffentlicht ist - denn erst dann zählt die Empfehlung - und ob beide aus
 * demselben Browser kamen.
 */
export async function empfehlungsliste(
  zeitraum: Zeitraum,
  optionen: { nurAuffaellig?: boolean; grenze?: number } = {},
): Promise<Empfehlungszeile[]> {
  const grenze = Math.min(500, Math.max(1, optionen.grenze ?? 200));

  const zeilen = await sql<
    {
      id: string;
      erstellt_am: Date;
      werber_id: string;
      werbercode: string | null;
      geworben_id: string;
      bewertung_id: string | null;
      status: string | null;
      schulname: string | null;
      schulslug: string | null;
      gleiches_geraet: boolean;
      zaehlende: number;
    }[]
  >`
    select e.id, e.erstellt_am,
           w.id as werber_id, w.empfehlungscode as werbercode,
           g.id as geworben_id,
           b.id as bewertung_id, b.status::text as status,
           s.name as schulname, s.slug as schulslug,
           coalesce(
             exists (
               select 1 from bewertungen wb
               where wb.konto_id = w.id
                 and wb.geraet_hash is not null
                 and wb.geraet_hash = b.geraet_hash
             ),
             false
           ) as gleiches_geraet,
           (
             select count(*)::int from (${zaehlendeEmpfehlungen(zeitraum)}) z
             where z.werber_konto_id = w.id
           ) as zaehlende
    from empfehlungen e
    join konten w on w.id = e.werber_konto_id
    join konten g on g.id = e.geworbenes_konto_id
    left join bewertungen b on b.id = e.bewertung_id
    left join schulen s on s.id = b.schule_id
    where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}
      ${
        optionen.nurAuffaellig === true
          ? sql`and exists (
                  select 1 from bewertungen wb
                  where wb.konto_id = w.id
                    and wb.geraet_hash is not null
                    and wb.geraet_hash = b.geraet_hash
                )`
          : sql``
      }
    order by e.erstellt_am desc
    limit ${grenze}
  `;

  return zeilen.map((z) => ({
    id: z.id,
    erstelltAm: z.erstellt_am,
    werberId: z.werber_id,
    werbercode: z.werbercode,
    geworbenId: z.geworben_id,
    bewertungId: z.bewertung_id,
    status: z.status,
    schulname: z.schulname,
    schulslug: z.schulslug,
    gleichesGeraet: z.gleiches_geraet,
    zaehlendeDesWerbers: z.zaehlende,
  }));
}

export interface Werberzeile {
  readonly kontoId: string;
  readonly code: string | null;
  readonly geworben: number;
  readonly zaehlend: number;
  readonly vomSelbenGeraet: number;
}

/**
 * Die aktivsten Werber eines Zeitraums.
 *
 * `vomSelbenGeraet` steht bewusst daneben: Eine hohe Zahl geworbener Personen
 * ist erst dann eine gute Nachricht, wenn sie nicht alle aus demselben Browser
 * kommen.
 */
export async function topWerber(zeitraum: Zeitraum, grenze = 25): Promise<Werberzeile[]> {
  const zeilen = await sql<
    {
      konto_id: string;
      code: string | null;
      geworben: number;
      zaehlend: number;
      vom_selben_geraet: number;
    }[]
  >`
    select w.id as konto_id, w.empfehlungscode as code,
           count(*)::int as geworben,
           -- Dieselbe Menge wie in der Ziehung, nicht bloss „veröffentlicht":
           -- Sonst trägt die Plakette „Mega-Verlosung" an einem Konto, das die
           -- Ziehung nicht aufnimmt.
           (select count(*)::int from (${zaehlendeEmpfehlungen(zeitraum)}) z
            where z.werber_konto_id = w.id)::int as zaehlend,
           count(*) filter (
             where exists (
               select 1 from bewertungen wb
               where wb.konto_id = w.id
                 and wb.geraet_hash is not null
                 and wb.geraet_hash = b.geraet_hash
             )
           )::int as vom_selben_geraet
    from empfehlungen e
    join konten w on w.id = e.werber_konto_id
    left join bewertungen b on b.id = e.bewertung_id
    where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}
    group by w.id, w.empfehlungscode
    order by zaehlend desc, geworben desc
    limit ${grenze}
  `;

  return zeilen.map((z) => ({
    kontoId: z.konto_id,
    code: z.code,
    geworben: z.geworben,
    zaehlend: z.zaehlend,
    vomSelbenGeraet: z.vom_selben_geraet,
  }));
}
