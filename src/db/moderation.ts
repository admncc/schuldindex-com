/**
 * Abfragen der Moderationsoberfläche.
 *
 * Hier steht das SQL, nirgends sonst. Die Entscheidungen selbst trifft
 * `domain/moderation.ts`, den Anmeldevorgang `dienste/moderationsanmeldung.ts`
 * — beide ohne Datenbank und beide vollständig getestet.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import type { Bundesland } from "../domain/bundesland";
import type { Zustand } from "../domain/bewertungsstatus";
import type { Antwort } from "../domain/fragebogen";
import type { Moderatorkonto, Zugang } from "../dienste/moderationsanmeldung";
import { entschluesseleWennMoeglich, verschleiere, type Kontaktart } from "../domain/kontakt";
import { hasheSitzung } from "../domain/anmeldung";
import type { Aktion } from "../domain/moderation";
import { aktualisiereAggregat } from "./aggregate";

/* ---------------------------------------------------------------- Anmeldung */

export const zugang: Zugang = {
  async findeModerator(kennung) {
    const [zeile] = await sql<
      {
        id: string;
        kennung: string;
        name: string;
        passwort_abdruck: string;
        totp_geheimnis: string | null;
        totp_letzter_schritt: string | null;
        rolle: "moderation" | "leitung";
        aktiv: boolean;
        fehlversuche: number;
        letzter_fehlversuch_am: Date | null;
      }[]
    >`
      select id, kennung, name, passwort_abdruck, totp_geheimnis, totp_letzter_schritt,
             rolle, aktiv, fehlversuche, letzter_fehlversuch_am
      from moderatoren where lower(kennung) = lower(${kennung})
    `;
    if (!zeile) return null;
    return {
      id: zeile.id,
      kennung: zeile.kennung,
      name: zeile.name,
      passwortAbdruck: zeile.passwort_abdruck,
      totpGeheimnis: zeile.totp_geheimnis,
      // bigint kommt als Zeichenkette zurück; ohne Umwandlung verglichen wir
      // hier eine Zeichenkette mit einer Zahl, und der Wiederverwendungsschutz
      // liefe leer.
      totpLetzterSchritt: zeile.totp_letzter_schritt === null ? null : Number(zeile.totp_letzter_schritt),
      rolle: zeile.rolle,
      aktiv: zeile.aktiv,
      fehlversuche: zeile.fehlversuche,
      letzterFehlversuchAm: zeile.letzter_fehlversuch_am,
    };
  },

  async merkeFehlversuch(id, jetzt) {
    await sql`
      update moderatoren
      set fehlversuche = fehlversuche + 1, letzter_fehlversuch_am = ${jetzt}
      where id = ${id}
    `;
  },

  async merkeAnmeldung(id, schritt, jetzt) {
    await sql`
      update moderatoren
      set fehlversuche = 0, letzter_fehlversuch_am = null,
          letzte_anmeldung_am = ${jetzt}, totp_letzter_schritt = ${schritt}
      where id = ${id}
    `;
  },

  async legeSitzungAn(id, hash, gueltigBis) {
    await sql`
      insert into moderator_sitzungen (moderator_id, token_hash, gueltig_bis)
      values (${id}, ${hash}, ${gueltigBis})
    `;
  },

  async protokolliere(eintrag) {
    await sql`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values (${eintrag.aktion}::protokollaktion, ${eintrag.moderatorId},
              ${eintrag.kennungVersuch}, ${eintrag.begruendung || null})
    `;
  },
};

export type AngemeldeteModeratorin = Pick<Moderatorkonto, "id" | "kennung" | "name" | "rolle">;

/** Löst ein Sitzungscookie auf. `null` heißt: nicht angemeldet. */
export async function holeSitzung(klartext: string): Promise<AngemeldeteModeratorin | null> {
  const [zeile] = await sql<
    { id: string; kennung: string; name: string; rolle: "moderation" | "leitung" }[]
  >`
    select m.id, m.kennung, m.name, m.rolle
    from moderator_sitzungen s
    join moderatoren m on m.id = s.moderator_id
    where s.token_hash = ${hasheSitzung(klartext)}
      and s.beendet_am is null
      and s.gueltig_bis > now()
      and m.aktiv
  `;
  return zeile ?? null;
}

export async function beendeSitzung(klartext: string): Promise<void> {
  await sql`
    update moderator_sitzungen set beendet_am = now()
    where token_hash = ${hasheSitzung(klartext)} and beendet_am is null
  `;
}

/* ------------------------------------------------------------ Warteschlange */

export interface Warteschlangeneintrag {
  id: string;
  status: Zustand;
  rolle: string;
  klassenstufe: number | null;
  erstellt_am: Date;
  geo_entfernung_km: string | null;
  geo_unbekannt: boolean;
  schule_name: string;
  schule_slug: string;
  schule_ort: string | null;
  bundesland: Bundesland;
  gesamtscore: string | null;
  hat_freitext: boolean;
}

export interface Warteschlangenfilter {
  readonly status?: Zustand | undefined;
  readonly bundesland?: Bundesland | undefined;
  readonly suche?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * Die Warteschlange.
 *
 * Sortiert nach Alter, älteste zuerst — nicht nach Auffälligkeit. Wer nach
 * Verdachtsgrad sortiert, arbeitet die spannenden Fälle ab und lässt die
 * unspektakulären die 48-Stunden-Zusage reißen.
 */
export async function warteschlange(f: Warteschlangenfilter = {}): Promise<Warteschlangeneintrag[]> {
  return sql<Warteschlangeneintrag[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe,
           b.erstellt_am, b.geo_entfernung_km, b.geo_unbekannt,
           s.name as schule_name, s.slug as schule_slug, s.ort as schule_ort, s.bundesland,
           v.gesamtscore,
           v.freitexte <> '{}'::jsonb as hat_freitext
    from bewertungen b
    join schulen s on s.id = b.schule_id
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.status in ('in_pruefung_geo', 'in_pruefung_betrug')
      ${f.status ? sql`and b.status = ${f.status}::bewertungsstatus` : sql``}
      ${f.bundesland ? sql`and s.bundesland = ${f.bundesland}::bundesland` : sql``}
      ${f.suche ? sql`and s.suchtext ilike ${"%" + f.suche + "%"}` : sql``}
    order by b.erstellt_am asc
    limit ${f.limit ?? 200}
  `;
}

export async function warteschlangenlage(): Promise<{ laenge: number; aeltesterEintragAm: Date | null }> {
  const [zeile] = await sql<{ laenge: number; aeltester: Date | null }[]>`
    select count(*)::int as laenge, min(erstellt_am) as aeltester
    from bewertungen where status in ('in_pruefung_geo', 'in_pruefung_betrug')
  `;
  return { laenge: zeile?.laenge ?? 0, aeltesterEintragAm: zeile?.aeltester ?? null };
}

/* --------------------------------------------------------------- Einzelfall */

export interface Vorgang {
  id: string;
  status: Zustand;
  rolle: string;
  klassenstufe: number | null;
  abgangsjahr: number | null;
  erstellt_am: Date;
  zuletzt_bearbeitet_am: Date | null;
  eltern_einwilligung_am: Date | null;
  geo_entfernung_km: string | null;
  geo_unbekannt: boolean;
  ablehnungsgrund: string | null;

  schule_id: string;
  schule_name: string;
  schule_slug: string;
  schule_strasse: string | null;
  schule_plz: string | null;
  schule_ort: string | null;
  bundesland: Bundesland;

  konto_id: string;
  kontaktart: Kontaktart;
  kontakt_chiffre: Uint8Array;
  konto_verifiziert_am: Date | null;
  konto_erstellt_am: Date;

  version: number;
  antworten: Record<string, Antwort>;
  freitexte: Record<string, string>;
  gesamtscore: string | null;
  aggressionsindex: string | null;
  score_a: string | null;
  score_b: string | null;
  score_c: string | null;
  score_d: string | null;
  score_e: string | null;
  score_f: string | null;
}

export async function holeVorgang(id: string): Promise<Vorgang | null> {
  const [zeile] = await sql<Vorgang[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe, b.abgangsjahr,
           b.erstellt_am, b.zuletzt_bearbeitet_am, b.eltern_einwilligung_am,
           b.geo_entfernung_km, b.geo_unbekannt, b.ablehnungsgrund,
           s.id as schule_id, s.name as schule_name, s.slug as schule_slug,
           s.strasse as schule_strasse, s.plz as schule_plz, s.ort as schule_ort, s.bundesland,
           k.id as konto_id, k.kontaktart, k.kontakt_chiffre,
           k.verifiziert_am as konto_verifiziert_am, k.erstellt_am as konto_erstellt_am,
           v.version, v.antworten, v.freitexte, v.gesamtscore, v.aggressionsindex,
           v.score_a, v.score_b, v.score_c, v.score_d, v.score_e, v.score_f
    from bewertungen b
    join schulen s on s.id = b.schule_id
    join konten k on k.id = b.konto_id
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.id = ${id}
  `;
  return zeile ?? null;
}

export interface Nachbarbewertung {
  id: string;
  status: Zustand;
  erstellt_am: Date;
  schule_name: string;
  schule_slug: string;
}

/**
 * Weitere Bewertungen desselben Kontos.
 *
 * Das wichtigste Feld der Detailansicht: eine einzelne auffällige Bewertung
 * sagt wenig, fünf Abgaben desselben Kontos an fünf Schulen in einer Stunde
 * sagen alles.
 */
export async function weitereBewertungenDesKontos(kontoId: string, ausser: string): Promise<Nachbarbewertung[]> {
  return sql<Nachbarbewertung[]>`
    select b.id, b.status::text as status, b.erstellt_am, s.name as schule_name, s.slug as schule_slug
    from bewertungen b join schulen s on s.id = b.schule_id
    where b.konto_id = ${kontoId} and b.id <> ${ausser}
    order by b.erstellt_am desc
    limit 20
  `;
}

export interface Protokolleintrag {
  id: string;
  aktion: string;
  erstellt_am: Date;
  begruendung: string | null;
  grund_id: string | null;
  von_status: string | null;
  nach_status: string | null;
  moderator_name: string | null;
}

export async function protokollZurBewertung(bewertungId: string): Promise<Protokolleintrag[]> {
  return sql<Protokolleintrag[]>`
    select p.id, p.aktion::text as aktion, p.erstellt_am, p.begruendung, p.grund_id,
           p.von_status::text as von_status, p.nach_status::text as nach_status,
           m.name as moderator_name
    from moderationsprotokoll p
    left join moderatoren m on m.id = p.moderator_id
    where p.bewertung_id = ${bewertungId}
    order by p.erstellt_am asc
  `;
}

/**
 * Der Kontakt im Klartext — nur auf ausdrückliches Aufklappen.
 *
 * Jede Einsicht steht im Protokoll. Die Moderation braucht den Kontakt selten
 * (bei Rückfragen und beim Verdacht auf Mehrfachkonten); eine Oberfläche, die
 * ihn ungefragt anzeigt, macht aus dieser Ausnahme den Regelfall.
 */
export async function kontaktEinsehen(
  bewertungId: string,
  moderatorId: string,
): Promise<{ klartext: string; verschleiert: string } | null> {
  const [zeile] = await sql<{ kontakt_chiffre: Uint8Array; kontaktart: Kontaktart; schule_id: string }[]>`
    select k.kontakt_chiffre, k.kontaktart, b.schule_id
    from bewertungen b join konten k on k.id = b.konto_id
    where b.id = ${bewertungId}
  `;
  if (!zeile) return null;

  const klartext = entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));
  if (klartext === null) return null;
  await sql`
    insert into moderationsprotokoll (aktion, moderator_id, bewertung_id, schule_id, begruendung)
    values ('einsicht_kontakt', ${moderatorId}, ${bewertungId}, ${zeile.schule_id},
            'Kontaktdaten eingesehen')
  `;
  return { klartext, verschleiert: verschleiere(klartext, zeile.kontaktart) };
}

/* ------------------------------------------------------------ Entscheidungen */

export interface Entscheidungsauftrag {
  readonly bewertungId: string;
  readonly moderatorId: string;
  readonly aktion: Aktion;
  readonly vonStatus: Zustand;
  /** `null` bei einer Rückfrage: der Zustand bleibt, wie er ist. */
  readonly nachStatus: Zustand | null;
  readonly grundId: string | null;
  readonly begruendung: string;
}

/**
 * Schreibt eine Entscheidung fest.
 *
 * Alles in einer Transaktion, und die Statusänderung mit `where status =
 * vonStatus`: zwei Moderatorinnen, die dieselbe Bewertung offen haben, sollen
 * nicht nacheinander freigeben und ablehnen können. Wer zu spät kommt, bekommt
 * `false` und sieht den neuen Stand.
 */
export async function entscheide(auftrag: Entscheidungsauftrag): Promise<boolean> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [schule] = await tx<{ schule_id: string }[]>`
      select schule_id from bewertungen where id = ${auftrag.bewertungId}
    `;
    if (!schule) return false;

    if (auftrag.nachStatus !== null) {
      const geaendert = await tx`
        update bewertungen
        set status = ${auftrag.nachStatus}::bewertungsstatus,
            ablehnungsgrund = ${auftrag.nachStatus === "abgelehnt" ? auftrag.begruendung : null},
            ablehnungsgrund_id = ${auftrag.nachStatus === "abgelehnt" ? auftrag.grundId : null},
            moderiert_von = ${auftrag.moderatorId},
            moderiert_am = now(),
            aktualisiert_am = now()
        where id = ${auftrag.bewertungId} and status = ${auftrag.vonStatus}::bewertungsstatus
      `;
      if (geaendert.count === 0) return false;

      // Der Score der Schule hängt an dieser Entscheidung. In derselben
      // Transaktion, sonst zeigt das Profil zwischen Freigabe und Nachrechnen
      // eine Zahl, zu der die eben freigegebene Bewertung noch fehlt.
      await aktualisiereAggregat(schule.schule_id, tx);
    }

    await tx`
      insert into moderationsprotokoll
        (aktion, moderator_id, bewertung_id, schule_id, von_status, nach_status, grund_id, begruendung)
      values (
        ${auftrag.aktion}::protokollaktion, ${auftrag.moderatorId}, ${auftrag.bewertungId},
        ${schule.schule_id}, ${auftrag.vonStatus}::bewertungsstatus,
        ${auftrag.nachStatus}::bewertungsstatus, ${auftrag.grundId}, ${auftrag.begruendung}
      )
    `;
    return true;
  });
}
