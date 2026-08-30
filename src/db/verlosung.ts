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
  pruefeMehrfachziehung,
  type Ziehungspruefung,
  ziehe,
  zieheMehrere,
  type Los,
  type Teilnahme,
  type Verlosungsart,
} from "../domain/verlosung";
import { entschluesseleWennMoeglich, verschleiere, type Kontaktart } from "../domain/kontakt";
import { istKennung } from "../domain/kennung";
import { zaehlendeEmpfehlungen } from "./empfehlungen";

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
            // Geprüft wird beides: die Gewinntabelle und die alte Spalte an
            // der Ziehung, denn die Tabelle gibt es erst seit Migration 0025.
            sql`and not exists (
                  select 1 from verlosungsgewinne g
                  join verlosungen v on v.id = g.verlosung_id
                  where g.konto_id = b.konto_id and v.art = 'normal'
                )
                and not exists (
                  select 1 from verlosungen v2
                  where v2.art = 'normal' and v2.gewinner_konto_id = b.konto_id
                )`
          : sql``
      }
    order by b.konto_id, b.id
  `;

  const lose = zeilen.map((z) => ({ kontoId: z.konto_id, bewertungId: z.id, rolle: z.rolle }));
  if (art === "normal") return lose;

  /**
   * Super- und Mega-Verlosung: Der Topf kommt aus den **Empfehlungen** des
   * Monats, nicht aus den Bewertungen des Monats.
   *
   * Das war zuerst anders und war falsch: Wer im Juli bewertet und geteilt hat
   * und dessen Freundin im August darüber bewertet, stand in keiner der beiden
   * Superziehungen - im Juli, weil die Empfehlung auf August datiert; im
   * August, weil er selbst nicht bewertet hatte. Genau der Regelfall, sobald
   * ein Monatswechsel dazwischenliegt.
   *
   * Verlangt wird vom Werber nur, dass er überhaupt eine veröffentlichte,
   * teilnehmende Bewertung hat - irgendwann, nicht in diesem Monat.
   */
  const werber = await sql<{ konto_id: string; bewertung_id: string; rolle: string }[]>`
    with zaehlend as (${zaehlendeEmpfehlungen({ von, bis })}),
    werbend as (
      select z.werber_konto_id as konto_id, count(*)::int as anzahl
      from zaehlend z
      group by z.werber_konto_id
      having count(*) >= ${mindestens}
    )
    select w.konto_id, wb.id as bewertung_id, wb.rolle::text as rolle
    from werbend w
    join konten wk on wk.id = w.konto_id and wk.verifiziert_am is not null
    -- Genau eine eigene Bewertung als Los, per lateral statt per Join: Ein
    -- gewoehnlicher Join haette den Werber so oft geliefert, wie er selbst
    -- bewertet hat, und aus einem Los mehrere gemacht.
    join lateral (
      select b.id, b.rolle from bewertungen b
      where b.konto_id = w.konto_id
        and b.verlosung_teilnahme and b.status = 'freigegeben'
      order by b.erstellt_am, b.id
      limit 1
    ) wb on true
    order by w.konto_id
  `;

  return werber.map((z) => ({ kontoId: z.konto_id, bewertungId: z.bewertung_id, rolle: z.rolle }));
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
        -- Das where gehoert dazu. Seit Migration 0027 ist die Eindeutigkeit
        -- ein **partieller** Index (nur wo konto_id gesetzt ist), und einen
        -- solchen nimmt Postgres nur dann als Arbiter, wenn sein Praedikat in
        -- der Klausel steht. Ohne es brach jede Ziehung mit 42P10 ab - die
        -- ganze Transaktion rollte zurueck, samt der Zeile in verlosungen.
        -- Es lief also seit 0027 keine einzige Ziehung mehr durch, und weil
        -- nichts in verlosungsgewinne landete, griff auch der Ausschluss
        -- frueherer Gewinner nie.
        on conflict (verlosung_id, konto_id) where konto_id is not null do nothing
      `;
    }

    // Die Ziehung ins Protokoll. Sie steht zwar an `verlosungen.gezogen_von`,
    // aber nur dort: In der zeitlichen Gesamtsicht des Protokolls - „was ist an
    // diesem Abend geschehen" - fehlte ausgerechnet der Vorgang, der Geld
    // vergibt und sich nicht zurücknehmen lässt.
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, begruendung)
      values ('verlosung_gezogen', ${moderatorId},
              ${`${art} ${monat}/${jahr}: ${ergebnis.gewinner.length} von ${lose.length} Losen gezogen, Zufallswert ${zufallswert}`})
    `;

    return { ok: true as const, ziehung: zeile!, lose };
  });
}

export interface Gewinn {
  readonly id: string;
  /** `null`, sobald das Konto gelöscht ist - der Platz bleibt (Migration 0027). */
  readonly kontoId: string | null;
  readonly platz: number;
  readonly benachrichtigtAm: Date | null;
}

/** Die Gewinner einer Ziehung, in der Reihenfolge der Ziehung. */
export async function gewinner(ziehungId: string): Promise<Gewinn[]> {
  if (!istKennung(ziehungId)) return [];
  const zeilen = await sql<
    { id: string; konto_id: string | null; platz: number; benachrichtigt_am: Date | null }[]
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
  /**
   * Wer einsieht. `null` nur für das Kommandozeilenwerkzeug auf dem Server -
   * der Eintrag entsteht trotzdem, dann eben ohne Person. Ein Weg ohne
   * Protokolleintrag soll es nicht geben.
   */
  moderatorId: string | null,
): Promise<{ klartext: string; verschleiert: string; art: Kontaktart } | null> {
  if (!istKennung(gewinnId)) return null;
  if (moderatorId !== null && !istKennung(moderatorId)) return null;
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

  // Jede Einsicht ein eigener Eintrag - dieselbe Zusage wie am Vorgang
  // (Entwicklungsplan 8.1, Festlegung 2). Sie stand hier bisher nicht ein:
  // Der Kontakt wurde entschlüsselt und hinterliess keine Spur, ausgerechnet
  // bei den überwiegend minderjährigen Gewinnenden.
  await sql`
    insert into moderationsprotokoll (aktion, moderator_id, begruendung)
    values ('einsicht_kontakt', ${moderatorId},
            ${
              `Kontakt einer gewinnenden Person eingesehen (Gewinn ${gewinnId})` +
              (moderatorId === null ? " - über das Kommandozeilenwerkzeug" : "")
            })
  `;

  return { klartext, verschleiert: verschleiere(klartext, zeile.kontaktart), art: zeile.kontaktart };
}

/**
 * Setzt oder nimmt den Benachrichtigungsvermerk zurück.
 *
 * Zurücknehmen muss möglich sein: Der Versand läuft von Hand, ein Klick auf
 * „Erledigt" liess sich vorher nicht widerrufen, und danach stand nur noch
 * „benachrichtigt <Datum>" - die gewinnende Person galt als versorgt und
 * bekam nie etwas. Ein Vorgang, der ausschliesslich in eine Richtung geht,
 * darf keiner sein, den ein Fehlklick auslöst.
 */
export async function merkeBenachrichtigung(
  gewinnId: string,
  moderatorId: string,
  gesetzt = true,
): Promise<void> {
  if (!istKennung(gewinnId) || !istKennung(moderatorId)) return;
  const zeilen = await sql<{ id: string }[]>`
    update verlosungsgewinne
    set benachrichtigt_am = ${gesetzt ? sql`now()` : null}
    where id = ${gewinnId}
    returning id
  `;
  if (zeilen.length === 0) return;

  await sql`
    insert into moderationsprotokoll (aktion, moderator_id, begruendung)
    values ('gewinn_benachrichtigt', ${moderatorId},
            ${`${gesetzt ? "Benachrichtigung vermerkt" : "Vermerk zurückgenommen"} (Gewinn ${gewinnId})`})
  `;
}

/**
 * Rechnet eine gespeicherte Ziehung nach.
 *
 * Gebraucht, wenn jemand die Ziehung anzweifelt - und als Prüfung, dass die
 * gespeicherte Losliste zum eingetragenen Gewinner passt.
 */
export async function pruefeGespeicherteZiehung(
  jahr: number,
  monat: number,
  art: Verlosungsart = "normal",
): Promise<Ziehungspruefung | null> {
  const ziehung = await holeZiehung(jahr, monat, art);
  if (ziehung === null) return null;

  const gezogene = await gewinner(ziehung.id);
  // Keine Gewinnzeilen: Entweder war nichts zu ziehen - dann stimmt es -, oder
  // die Zeilen fehlen, obwohl Lose im Topf waren. Letzteres ist kein
  // Widerspruch, sondern eine Lücke: Altziehungen von vor 0025 stehen gar
  // nicht in `verlosungsgewinne`, und 0027 trug nur nach, wo noch eine Kennung
  // stand.
  if (gezogene.length === 0) return ziehung.lose_gesamt === 0 ? "stimmt" : "unvollstaendig";

  // **Dasselbe Verfahren wie beim Ziehen.** Hier stand einmal `pruefeZiehung`,
  // also die Einzelziehung - gezogen wurde aber schon mit `zieheMehrere`. Die
  // Nachprüfung widersprach damit jeder echten Ziehung und meldete
  // ausnahmslos „rechnet sich nicht nach“. Genau das Gegenteil dessen, wofür
  // sie da ist: Teilnahmebedingung 5 sagt zu, dass sich jede Ziehung
  // nachrechnen lässt.
  const lose: Los[] = ziehung.losliste.map((kontoId) => ({ kontoId, bewertungIds: [] }));
  return pruefeMehrfachziehung(
    lose,
    ziehung.zufallswert,
    GEWINNE[art].anzahl,
    gezogene.map((g) => g.kontoId),
  );
}
