/**
 * Abfragen und Ziehung der monatlichen Verlosung.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import {
  baueLose,
  erzeugeZufallswert,
  monatszeitraum,
  pruefeZiehung,
  ziehe,
  type Los,
  type Teilnahme,
} from "../domain/verlosung";
import { entschluesseleWennMoeglich, verschleiere, type Kontaktart } from "../domain/kontakt";

/**
 * Die Teilnahmen eines Monats.
 *
 * Nur freigegebene Bewertungen: eine gehaltene oder abgelehnte Bewertung nimmt
 * nicht teil, sonst wäre die Verlosung ein Weg, Ablehnungen zu versilbern.
 * Und nur bestätigte Konten - bei einem unbestätigten wüssten wir nicht einmal,
 * wohin der Gewinn ginge.
 */
export async function teilnahmen(jahr: number, monat: number): Promise<Teilnahme[]> {
  const { von, bis } = monatszeitraum(jahr, monat);
  const zeilen = await sql<{ konto_id: string; id: string; rolle: string }[]>`
    select b.konto_id, b.id, b.rolle::text as rolle
    from bewertungen b
    join konten k on k.id = b.konto_id
    where b.verlosung_teilnahme
      and b.status = 'freigegeben'
      and k.verifiziert_am is not null
      and b.erstellt_am >= ${von} and b.erstellt_am < ${bis}
    order by b.konto_id, b.id
  `;
  return zeilen.map((z) => ({ kontoId: z.konto_id, bewertungId: z.id, rolle: z.rolle }));
}

export interface Ziehung {
  id: string;
  jahr: number;
  monat: number;
  zufallswert: string;
  lose_gesamt: number;
  gewinner_index: number | null;
  losliste: string[];
  gewinner_konto_id: string | null;
  benachrichtigt_am: Date | null;
  gezogen_am: Date;
}

export async function holeZiehung(jahr: number, monat: number): Promise<Ziehung | null> {
  const [zeile] = await sql<Ziehung[]>`
    select id, jahr, monat, zufallswert, lose_gesamt, gewinner_index, losliste,
           gewinner_konto_id, benachrichtigt_am, gezogen_am
    from verlosungen where jahr = ${jahr} and monat = ${monat}
  `;
  return zeile ?? null;
}

export async function letzteZiehungen(grenze = 12): Promise<Ziehung[]> {
  return sql<Ziehung[]>`
    select id, jahr, monat, zufallswert, lose_gesamt, gewinner_index, losliste,
           gewinner_konto_id, benachrichtigt_am, gezogen_am
    from verlosungen order by jahr desc, monat desc limit ${grenze}
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
): Promise<Ziehungsantwort> {
  const liste = await teilnahmen(jahr, monat);
  const lose = baueLose(liste);

  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [vorhanden] = await tx<{ id: string }[]>`
      select id from verlosungen where jahr = ${jahr} and monat = ${monat} for update
    `;
    if (vorhanden) return { ok: false as const, grund: "schon_gezogen" as const };

    const zufallswert = erzeugeZufallswert();
    const ergebnis = ziehe(lose, zufallswert);

    // Auch ein Monat ohne Teilnahmen wird festgehalten. Sonst ließe sich später
    // nicht unterscheiden zwischen „niemand hat mitgemacht“ und „es hat niemand
    // gezogen“.
    const [zeile] = await tx<Ziehung[]>`
      insert into verlosungen (
        jahr, monat, zufallswert, lose_gesamt, gewinner_index, losliste,
        gewinner_konto_id, gezogen_von
      ) values (
        ${jahr}, ${monat}, ${zufallswert}, ${lose.length}, ${ergebnis?.index ?? null},
        ${tx.json(lose.map((l) => l.kontoId) as never)},
        ${ergebnis?.gewinner.kontoId ?? null}, ${moderatorId}
      )
      returning id, jahr, monat, zufallswert, lose_gesamt, gewinner_index, losliste,
                gewinner_konto_id, benachrichtigt_am, gezogen_am
    `;

    return { ok: true as const, ziehung: zeile!, lose };
  });
}

/**
 * Der Kontakt der gewinnenden Person - nur für die Benachrichtigung.
 *
 * Wie in der Moderation getrennt gehalten: die Übersicht kommt ohne aus, und
 * was nicht gebraucht wird, soll nicht beiläufig mitlaufen.
 */
export async function gewinnerkontakt(
  ziehungId: string,
): Promise<{ klartext: string; verschleiert: string; art: Kontaktart } | null> {
  const [zeile] = await sql<{ kontakt_chiffre: Uint8Array | null; kontaktart: Kontaktart }[]>`
    select k.kontakt_chiffre, k.kontaktart
    from verlosungen v join konten k on k.id = v.gewinner_konto_id
    where v.id = ${ziehungId}
  `;
  if (!zeile) return null;

  const klartext =
    zeile.kontakt_chiffre === null
      ? null
      : entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));
  if (klartext === null) return null;
  return { klartext, verschleiert: verschleiere(klartext, zeile.kontaktart), art: zeile.kontaktart };
}

export async function merkeBenachrichtigung(ziehungId: string): Promise<void> {
  await sql`update verlosungen set benachrichtigt_am = now() where id = ${ziehungId}`;
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
