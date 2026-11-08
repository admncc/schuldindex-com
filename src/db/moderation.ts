/**
 * Abfragen der Moderationsoberfläche.
 *
 * Hier steht das SQL, nirgends sonst. Die Entscheidungen selbst trifft
 * `domain/moderation.ts`, den Anmeldevorgang `dienste/moderationsanmeldung.ts`
 * - beide ohne Datenbank und beide vollständig getestet.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import type { Bundesland } from "../domain/bundesland";
import { wechsle, type Zustand } from "../domain/bewertungsstatus";
import type { Antwort } from "../domain/fragebogen";
import type { Moderatorkonto, Zugang } from "../dienste/moderationsanmeldung";
import { entschluesseleWennMoeglich, verschleiere, type Kontaktart } from "../domain/kontakt";
import { hasheSitzung } from "../domain/anmeldung";
import type { Aktion } from "../domain/moderation";
import { aktualisiereAggregat, aktualisiereAggregate } from "./aggregate";
import { ausloeserNachBestaetigung } from "../domain/betrugspruefung";
import { istKennung } from "../domain/kennung";
import { maskierePlatzhalter } from "./schulsuche";

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
          letzte_anmeldung_am = ${jetzt},
          -- Ohne verbrauchten Code bleibt der gespeicherte Schritt stehen: Er
          -- verhindert, dass ein alter Code nach dem Wiedereinschalten des
          -- zweiten Faktors noch einmal gilt.
          totp_letzter_schritt = ${schritt === null ? sql`totp_letzter_schritt` : schritt}
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
  ist_demo: boolean;
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
 * Sortiert nach Alter, älteste zuerst - nicht nach Auffälligkeit. Wer nach
 * Verdachtsgrad sortiert, arbeitet die spannenden Fälle ab und lässt die
 * unspektakulären die 48-Stunden-Zusage reißen.
 */
export async function warteschlange(f: Warteschlangenfilter = {}): Promise<Warteschlangeneintrag[]> {
  return sql<Warteschlangeneintrag[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe,
           b.erstellt_am, b.geo_entfernung_km, b.geo_unbekannt,
           s.name as schule_name, s.slug as schule_slug, s.ort as schule_ort, s.bundesland,
           v.gesamtscore,
           v.freitexte <> '{}'::jsonb as hat_freitext,
           b.ist_demo
    from bewertungen b
    join schulen s on s.id = b.schule_id
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.status in ('in_pruefung_geo', 'in_pruefung_betrug')
      ${f.status ? sql`and b.status = ${f.status}::bewertungsstatus` : sql``}
      ${f.bundesland ? sql`and s.bundesland = ${f.bundesland}::bundesland` : sql``}
      ${
        f.suche
          ? sql`and s.suchtext ilike ${"%" + maskierePlatzhalter(f.suche) + "%"} escape '\\'`
          : sql``
      }
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
  /** Befund der Betrugsprüfung von der Abgabe - historisch, nicht neu gerechnet. */
  signale: { art: string; gewicht: number; erlaeuterung: string }[];
  signalpunkte: number | null;
  /** Kennzahlen des Klickverhaltens; `null` bei allem, was vor der Messung liegt. */
  klickmuster: { anzahl: number; medianMs: number; streuung: number } | null;
  /** Die vollständige Klickfolge; `null`, wenn nie erfasst oder nach Frist geleert. */
  klickfolge: number[] | null;
  /** Erfunden, aus `scripts/demodaten.ts` - in der Oberfläche sichtbar zu machen. */
  ist_demo: boolean;

  schule_id: string;
  schule_name: string;
  schule_slug: string;
  schule_strasse: string | null;
  schule_plz: string | null;
  schule_ort: string | null;
  bundesland: Bundesland;

  konto_id: string;
  kontaktart: Kontaktart;
  kontakt_chiffre: Uint8Array | null;
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
  if (!istKennung(id)) return null;

  const [zeile] = await sql<Vorgang[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe, b.abgangsjahr,
           b.erstellt_am, b.zuletzt_bearbeitet_am, b.eltern_einwilligung_am,
           b.geo_entfernung_km, b.geo_unbekannt, b.ablehnungsgrund,
           b.signale, b.signalpunkte, b.klickmuster, b.klickfolge, b.ist_demo,
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
  if (!istKennung(bewertungId)) return [];

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
 * Der Kontakt im Klartext - nur auf ausdrückliches Aufklappen.
 *
 * Jede Einsicht steht im Protokoll. Die Moderation braucht den Kontakt selten
 * (bei Rückfragen und beim Verdacht auf Mehrfachkonten); eine Oberfläche, die
 * ihn ungefragt anzeigt, macht aus dieser Ausnahme den Regelfall.
 */
export async function kontaktEinsehen(
  bewertungId: string,
  moderatorId: string,
): Promise<{ klartext: string; verschleiert: string } | null> {
  if (!istKennung(bewertungId)) return null;

  const [zeile] = await sql<{ kontakt_chiffre: Uint8Array | null; kontaktart: Kontaktart; schule_id: string }[]>`
    select k.kontakt_chiffre, k.kontaktart, b.schule_id
    from bewertungen b join konten k on k.id = b.konto_id
    where b.id = ${bewertungId}
  `;
  if (!zeile) return null;

  const klartext =
    zeile.kontakt_chiffre === null
      ? null
      : entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));
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

export interface Sammelergebnis {
  /** Wie viele tatsächlich abgelehnt wurden. */
  readonly abgelehnt: number;
  /** Wie viele inzwischen von jemand anderem entschieden waren. */
  readonly uebersprungen: number;
}

/**
 * Lehnt mehrere Bewertungen auf einmal ab.
 *
 * Drei Festlegungen, die den Unterschied zu einer Schleife über `entscheide`
 * ausmachen:
 *
 *  - **Jede Bewertung bekommt ihre eigene Protokollzeile.** Eine Sammelzeile
 *    wäre kürzer und wertlos: die Begründung geht an je eine Person, und bei
 *    einer Beschwerde zählt der einzelne Vorgang.
 *  - **Wer inzwischen entschieden ist, wird übersprungen**, nicht überschrieben.
 *    Die Zahl steht in der Rückmeldung - sonst bliebe unbemerkt, dass die
 *    Sammelaktion an einer anderen Entscheidung vorbeigelaufen ist.
 *  - **Je betroffener Schule wird das Aggregat einmal neu gerechnet**, nicht je
 *    Bewertung. Bei hundert Bewertungen derselben Schule ist das der Unterschied
 *    zwischen einer Neuberechnung und hundert.
 */
export async function entscheideMehrere(
  ids: readonly string[],
  moderatorId: string,
  grundId: string,
  begruendung: string,
): Promise<Sammelergebnis> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const zeilen = await tx<{ id: string; schule_id: string; status: Zustand }[]>`
      select id, schule_id, status::text as status
      from bewertungen
      where id = any(${ids as string[]})
        and status in ('in_pruefung_geo', 'in_pruefung_betrug', 'freigegeben')
      for update
    `;

    for (const zeile of zeilen) {
      await tx`
        update bewertungen
        set status = 'abgelehnt', ablehnungsgrund = ${begruendung}, ablehnungsgrund_id = ${grundId},
            moderiert_von = ${moderatorId}, moderiert_am = now(), aktualisiert_am = now()
        where id = ${zeile.id}
      `;
      await tx`
        insert into moderationsprotokoll
          (aktion, moderator_id, bewertung_id, schule_id, von_status, nach_status, grund_id, begruendung)
        values ('ablehnen', ${moderatorId}, ${zeile.id}, ${zeile.schule_id},
                ${zeile.status}::bewertungsstatus, 'abgelehnt', ${grundId}, ${begruendung})
      `;
    }

    for (const schuleId of new Set(zeilen.map((z) => z.schule_id))) {
      await aktualisiereAggregat(schuleId, tx);
    }

    return { abgelehnt: zeilen.length, uebersprungen: ids.length - zeilen.length };
  });
}

export interface Verwandt {
  id: string;
  schule_name: string;
  status: Zustand;
}

/**
 * Die übrigen wartenden Bewertungen desselben Kontos.
 *
 * Das ist die Form, die eine Spam-Welle tatsächlich hat: ein Konto, viele
 * Schulen, wenige Minuten. Die Auswahl von Hand zusammenzuklicken wäre die
 * Arbeit, die diese Abfrage abnimmt.
 */
export async function wartendeDesKontos(bewertungId: string): Promise<Verwandt[]> {
  return sql<Verwandt[]>`
    select b.id, s.name as schule_name, b.status::text as status
    from bewertungen b
    join schulen s on s.id = b.schule_id
    where b.konto_id = (select konto_id from bewertungen where id = ${bewertungId})
      and b.status in ('in_pruefung_geo', 'in_pruefung_betrug')
    order by b.erstellt_am asc
  `;
}

/* --------------------------------------------- Bestätigungslink erneut senden */

export interface Erneutauftrag {
  readonly kontoId: string;
  readonly kontaktKlartext: string;
  readonly kontaktart: Kontaktart;
  readonly schuleId: string;
}

/**
 * Was für einen erneuten Bestätigungsversand nötig ist.
 *
 * Gibt `null` zurück, wenn das Konto längst bestätigt ist - dann gibt es
 * nichts zu bestätigen, und ein zweiter Link wäre ein zweiter Weg ins Konto.
 *
 * **Der Kontakt wird hier entschlüsselt, aber nirgends angezeigt.** Er geht
 * direkt in den Versand. Deshalb steht im Protokoll auch nicht
 * „Kontaktdaten eingesehen", sondern der Versand selbst: Wer den Link erneut
 * schickt, hat den Kontakt nicht gelesen, sondern benutzt.
 */
export async function fuerErneutenVersand(bewertungId: string): Promise<Erneutauftrag | null> {
  if (!istKennung(bewertungId)) return null;

  const [zeile] = await sql<
    {
      konto_id: string;
      kontakt_chiffre: Uint8Array | null;
      kontaktart: Kontaktart;
      verifiziert_am: Date | null;
      schule_id: string;
    }[]
  >`
    select k.id as konto_id, k.kontakt_chiffre, k.kontaktart, k.verifiziert_am, b.schule_id
    from bewertungen b join konten k on k.id = b.konto_id
    where b.id = ${bewertungId} and b.status = 'wartet_auf_verifizierung'
  `;
  if (!zeile || zeile.verifiziert_am !== null || zeile.kontakt_chiffre === null) return null;

  const klartext = entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));
  if (klartext === null) return null;

  return {
    kontoId: zeile.konto_id,
    kontaktKlartext: klartext,
    kontaktart: zeile.kontaktart,
    schuleId: zeile.schule_id,
  };
}

/** Legt einen frischen Bestätigungstoken an und hält den Versand im Protokoll fest. */
export async function merkeErneutenVersand(
  auftrag: Erneutauftrag,
  bewertungId: string,
  moderatorId: string,
  token: { hash: string; gueltigBis: Date },
): Promise<void> {
  await sql.begin(async (tx) => {
    // Die alten Token des Kontos werden nicht gelöscht: Wer den ersten Link
    // doch noch findet, soll ihn benutzen können. Beide führen zum selben Ziel.
    await tx`
      insert into verifizierungstoken (konto_id, token_hash, zweck, gueltig_bis)
      values (${auftrag.kontoId}, ${token.hash}, 'bestaetigung', ${token.gueltigBis})
    `;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, bewertung_id, schule_id, begruendung)
      values ('bestaetigung_erneut', ${moderatorId}, ${bewertungId}, ${auftrag.schuleId},
              ${`Bestätigungslink erneut verschickt (${auftrag.kontaktart})`})
    `;
  });
}

/* ------------------------------------------- Bestätigung von Hand (Ausnahme) */

export const BESTAETIGUNG_BEGRUENDUNG_MINDESTLAENGE = 20;

export interface Handbestaetigung {
  readonly bewertungen: number;
  readonly veroeffentlicht: number;
}

/**
 * Bestätigt den Kontakt eines Kontos von Hand.
 *
 * **Was das ist, und was es ausdrücklich nicht ist.** Es ersetzt den Klick auf
 * den Bestätigungslink - nicht die Prüfung danach. Die wartenden Bewertungen
 * durchlaufen anschliessend genau denselben Weg wie nach einem echten Klick:
 * Wer über der Halteschwelle liegt, landet in der Moderation und wird dort
 * einzeln entschieden. Eine Bewertung wird hierdurch also nie veröffentlicht,
 * die es nach einem echten Klick nicht auch geworden wäre.
 *
 * Diese Trennung ist der ganze Punkt. Ein Knopf, der direkt auf „freigegeben"
 * setzt, hätte die Betrugsprüfung mit übersprungen - und zwar genau bei den
 * Bewertungen, bei denen sie angeschlagen hat.
 *
 * **Warum es die Ausnahme trotzdem gibt.** Zustellung scheitert: Postfach
 * voll, Spamfilter, Tippfehler in der Adresse. Ohne diesen Weg bliebe die
 * Bewertung für immer liegen, und die Person hat ihren einen Versuch für
 * diese Schule verbraucht. Der Weg steht nur der Leitung offen, verlangt eine
 * geschriebene Begründung und steht als eigene Art im Protokoll - er soll
 * nachträglich erklärbar sein, nicht bequem.
 */
export async function bestaetigeVonHand(
  bewertungId: string,
  moderatorId: string,
  begruendung: string,
  halteschwelle: number,
): Promise<Handbestaetigung | null> {
  if (!istKennung(bewertungId)) return null;

  return sql.begin(async (tx) => {
    const [zeile] = await tx<{ konto_id: string; verifiziert_am: Date | null; schule_id: string }[]>`
      select k.id as konto_id, k.verifiziert_am, b.schule_id
      from bewertungen b join konten k on k.id = b.konto_id
      where b.id = ${bewertungId}
      for update of k
    `;
    if (!zeile || zeile.verifiziert_am !== null) return null;

    await tx`update konten set verifiziert_am = now() where id = ${zeile.konto_id}`;

    const wartende = await tx<
      { id: string; schule_id: string; signalpunkte: number | null; signale: { art: string }[] }[]
    >`
      select id, schule_id, signalpunkte, coalesce(signale, '[]'::jsonb) as signale
      from bewertungen
      where konto_id = ${zeile.konto_id} and status = 'wartet_auf_verifizierung'
      for update
    `;

    let veroeffentlicht = 0;
    for (const b of wartende) {
      const uebergang = wechsle(
        "wartet_auf_verifizierung",
        ausloeserNachBestaetigung(b.signalpunkte, b.signale, halteschwelle),
      );
      if (!uebergang.ok) continue;
      if (uebergang.nach === "freigegeben") veroeffentlicht += 1;
      await tx`
        update bewertungen set status = ${uebergang.nach}::bewertungsstatus, aktualisiert_am = now()
        where id = ${b.id}
      `;
    }

    await aktualisiereAggregate(wartende.map((z) => z.schule_id), tx);

    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, bewertung_id, schule_id, begruendung)
      values ('bestaetigung_von_hand', ${moderatorId}, ${bewertungId}, ${zeile.schule_id},
              ${begruendung})
    `;

    return { bewertungen: wartende.length, veroeffentlicht };
  });
}

/* ------------------------------------------------- Alle Bewertungen, zeitlich */

export interface Bewertungszeile {
  id: string;
  erstellt_am: Date;
  aktualisiert_am: Date;
  status: Zustand;
  rolle: string;
  klassenstufe: number | null;
  schule_name: string;
  schule_slug: string;
  schule_ort: string | null;
  bundesland: Bundesland;
  gesamtscore: string | null;
  hat_freitext: boolean;
  signalpunkte: number | null;
  signale: { art: string; erlaeuterung?: string }[] | null;
  kontaktart: Kontaktart | null;
  konto_bestaetigt: boolean;
  version: number;
  ist_demo: boolean;
  /** Vom Server gemessen. `null` bei Abgaben vor dem 08.11.2026. */
  dauer_sekunden: number | null;
  /** Mittlerer Abstand zwischen zwei Antworten, in Millisekunden. */
  median_ms: number | null;
}

export interface Bewertungsfilter {
  readonly status?: Zustand | undefined;
  readonly bundesland?: Bundesland | undefined;
  readonly suche?: string | undefined;
  readonly seite?: number | undefined;
  readonly proSeite?: number | undefined;
}

function bewertungsbedingungen(f: Bewertungsfilter) {
  return sql`
    ${f.status ? sql`and b.status = ${f.status}::bewertungsstatus` : sql``}
    ${f.bundesland ? sql`and s.bundesland = ${f.bundesland}::bundesland` : sql``}
    ${
      f.suche
        ? sql`and s.suchtext ilike ${"%" + maskierePlatzhalter(f.suche) + "%"} escape '\\'`
        : sql``
    }
  `;
}

/**
 * Alle Bewertungen, die neueste zuerst.
 *
 * **Der Unterschied zur Warteschlange** ist nicht die Technik, sondern die
 * Frage. Die Warteschlange beantwortet „was muss ich jetzt entscheiden" und
 * sortiert deshalb die ältesten nach oben - wer nach Verdachtsgrad arbeitet,
 * lässt die unspektakulären Fälle die Frist reissen. Diese Liste beantwortet
 * „was passiert gerade" und sortiert deshalb umgekehrt: Sie ist der Blick auf
 * den Betrieb, nicht der Stapel Arbeit.
 *
 * Alles, was eine Zeile zeigt, kommt aus einer Abfrage - auch die Signale.
 * Eine Übersicht, die je Zeile nachlädt, ist bei zweihundert Zeilen keine
 * Übersicht mehr.
 */
export async function alleBewertungen(f: Bewertungsfilter = {}): Promise<Bewertungszeile[]> {
  const proSeite = Math.min(Math.max(f.proSeite ?? 100, 1), 500);
  const seite = Math.max(f.seite ?? 1, 1);

  return sql<Bewertungszeile[]>`
    select b.id, b.erstellt_am, b.aktualisiert_am, b.status::text as status,
           b.rolle::text as rolle, b.klassenstufe, b.signalpunkte, b.signale,
           b.aktuelle_version as version, b.ist_demo, b.dauer_sekunden,
           (b.klickmuster->>'medianMs')::numeric::int as median_ms,
           s.name as schule_name, s.slug as schule_slug, s.ort as schule_ort, s.bundesland,
           v.gesamtscore,
           v.freitexte <> '{}'::jsonb as hat_freitext,
           k.kontaktart::text as kontaktart,
           k.verifiziert_am is not null as konto_bestaetigt
    from bewertungen b
    join schulen s on s.id = b.schule_id
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    left join konten k on k.id = b.konto_id
    where true
      ${bewertungsbedingungen(f)}
    order by b.erstellt_am desc
    limit ${proSeite} offset ${(seite - 1) * proSeite}
  `;
}

/** Wie viele Bewertungen der Filter trifft - und wie sie sich auf die Zustände verteilen. */
export async function bewertungszahlen(
  f: Bewertungsfilter = {},
): Promise<{ gesamt: number; jeZustand: Partial<Record<Zustand, number>> }> {
  const zeilen = await sql<{ status: Zustand; n: number }[]>`
    select b.status::text as status, count(*)::int as n
    from bewertungen b
    join schulen s on s.id = b.schule_id
    where true
      ${bewertungsbedingungen({ ...f, status: undefined })}
    group by b.status
  `;
  const jeZustand: Partial<Record<Zustand, number>> = {};
  let gesamt = 0;
  for (const z of zeilen) {
    jeZustand[z.status] = z.n;
    gesamt += z.n;
  }
  return { gesamt, jeZustand };
}
