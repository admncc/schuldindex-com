/**
 * Zugang für Schulen - Anfrage, Einlösung, Sitzung.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { istKennung } from "../domain/kennung";
import {
  entscheideWeg,
  host,
  ZUGANGSLINK_STUNDEN,
  ZUGANG_TAGE,
  type Wegentscheidung,
} from "../domain/schulzugang";
import { hasheKontotoken, erzeugeKontositzung } from "../domain/kontozugang";
import { kontaktHash, verschluessele, entschluesseleWennMoeglich, verschleiere } from "../domain/kontakt";
import { randomBytes } from "node:crypto";

export interface Schulanfrage {
  readonly schuleId: string;
  /** Selbst angegebene Adresse, falls vorhanden. */
  readonly kontakt: string | null;
  /** Was die Person zu ihrer Rolle an der Schule sagt - nur für die Handprüfung. */
  readonly notiz: string;
}

export interface Anfrageergebnis {
  readonly entscheidung: Wegentscheidung;
  readonly zugangId: string;
  /** Klartext des Links - geht hinaus und steht nirgends in der Datenbank. */
  readonly link: string | null;
}

/**
 * Nimmt eine Zugangsanfrage entgegen.
 *
 * Die Entscheidung über den Weg trifft die Domänenschicht; hier wird nur
 * beigebracht, was sie dafür braucht - die Kontaktdaten der Schule und die
 * Zahl der Schulen hinter einem Host.
 */
export async function fordereZugangAn(anfrage: Schulanfrage): Promise<Anfrageergebnis | null> {
  const [schule] = await sql<{ email: string | null; website: string | null }[]>`
    select email, website from schulen where id = ${anfrage.schuleId} and ist_aktiv
  `;
  if (!schule) return null;

  // Die Hostauskunft wird vorab geholt: die Entscheidung selbst bleibt damit
  // eine reine Funktion und ist ohne Datenbank prüfbar.
  const kandidat = host(anfrage.kontakt) ?? host(schule.website);
  const [zeile] = kandidat === null
    ? [undefined]
    : await sql<{ schulen: number }[]>`select schulen from schulhosts where h = ${kandidat}`;
  const anzahl = zeile?.schulen ?? 0;

  const entscheidung = entscheideWeg(
    { email: schule.email, website: schule.website },
    anfrage.kontakt,
    (h) => ({ schulen: h === kandidat ? anzahl : 0 }),
  );

  const klartext = entscheidung.ziel === null ? null : randomBytes(32).toString("base64url");
  const jetzt = Date.now();

  const [zugang] = await sql<{ id: string }[]>`
    insert into schulzugaenge (
      schule_id, weg, status, kontakt_chiffre, kontakt_hash, anfrage_notiz,
      link_hash, link_gueltig_bis
    ) values (
      ${anfrage.schuleId}, ${entscheidung.weg}::schulzugangsweg, 'offen',
      ${entscheidung.ziel === null ? (anfrage.kontakt === null ? null : verschluessele(anfrage.kontakt)) : verschluessele(entscheidung.ziel)},
      ${entscheidung.ziel === null ? (anfrage.kontakt === null ? null : kontaktHash(anfrage.kontakt, "email")) : kontaktHash(entscheidung.ziel, "email")},
      ${anfrage.notiz.trim() || null},
      ${klartext === null ? null : hasheKontotoken(klartext, "anmeldung")},
      ${klartext === null ? null : new Date(jetzt + ZUGANGSLINK_STUNDEN * 3600_000)}
    )
    returning id
  `;

  return { entscheidung, zugangId: zugang!.id, link: klartext };
}

/**
 * Löst einen Zugangslink ein und legt eine Sitzung an.
 *
 * Wie beim Konto in einer Transaktion mit Sperre: ein Link, eine Sitzung. Wird
 * der Link ein zweites Mal geöffnet - die Vorschau eines Mailprogramms genügt
 * dafür -, darf daraus kein zweiter Zugang entstehen.
 */
export async function loeseZugangEin(
  klartext: string,
): Promise<{ ok: true; sitzung: string; schuleId: string } | { ok: false; grund: string }> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [zugang] = await tx<
      { id: string; schule_id: string; status: string; link_gueltig_bis: Date; link_verbraucht_am: Date | null }[]
    >`
      select id, schule_id, status::text as status, link_gueltig_bis, link_verbraucht_am
      from schulzugaenge where link_hash = ${hasheKontotoken(klartext, "anmeldung")}
      for update
    `;

    if (!zugang) return { ok: false as const, grund: "ungueltig" };
    if (zugang.link_verbraucht_am !== null) return { ok: false as const, grund: "ungueltig" };
    if (zugang.status === "abgelehnt") return { ok: false as const, grund: "abgelehnt" };
    if (zugang.link_gueltig_bis.getTime() <= Date.now()) return { ok: false as const, grund: "abgelaufen" };

    const sitzung = erzeugeKontositzung();
    await tx`
      update schulzugaenge
      set link_verbraucht_am = now(), status = 'aktiv', bestaetigt_am = now(),
          gueltig_bis = now() + ${`${ZUGANG_TAGE} days`}::interval
      where id = ${zugang.id}
    `;
    await tx`
      insert into schulzugang_sitzungen (zugang_id, token_hash, gueltig_bis)
      values (${zugang.id}, ${sitzung.hash}, ${sitzung.gueltigBis})
    `;

    return { ok: true as const, sitzung: sitzung.klartext, schuleId: zugang.schule_id };
  });
}

export interface AngemeldeteSchule {
  zugangId: string;
  schuleId: string;
  name: string;
  slug: string;
  gueltigBis: Date;
}

export async function holeSchulsitzung(klartext: string): Promise<AngemeldeteSchule | null> {
  const [zeile] = await sql<
    { zugang_id: string; schule_id: string; name: string; slug: string; gueltig_bis: Date }[]
  >`
    select z.id as zugang_id, s.id as schule_id, s.name, s.slug, z.gueltig_bis
    from schulzugang_sitzungen si
    join schulzugaenge z on z.id = si.zugang_id
    join schulen s on s.id = z.schule_id
    where si.token_hash = ${hasheKontotoken(klartext, "sitzung")}
      and si.beendet_am is null and si.gueltig_bis > now()
      and z.status = 'aktiv' and z.gueltig_bis > now()
  `;
  if (!zeile) return null;
  return {
    zugangId: zeile.zugang_id,
    schuleId: zeile.schule_id,
    name: zeile.name,
    slug: zeile.slug,
    gueltigBis: zeile.gueltig_bis,
  };
}

export async function beendeSchulsitzung(klartext: string): Promise<void> {
  await sql`
    update schulzugang_sitzungen set beendet_am = now()
    where token_hash = ${hasheKontotoken(klartext, "sitzung")} and beendet_am is null
  `;
}

export interface OffeneAnfrage {
  id: string;
  schule_name: string;
  schule_slug: string;
  schule_ort: string | null;
  anfrage_notiz: string | null;
  erstellt_am: Date;
  kontakt_verkuerzt: string | null;
}

/** Die Anfragen, die ein Mensch prüfen muss. */
export async function offeneAnfragen(grenze = 50): Promise<OffeneAnfrage[]> {
  const zeilen = await sql<
    {
      id: string;
      schule_name: string;
      schule_slug: string;
      schule_ort: string | null;
      anfrage_notiz: string | null;
      erstellt_am: Date;
      kontakt_chiffre: Uint8Array | null;
    }[]
  >`
    select z.id, s.name as schule_name, s.slug as schule_slug, s.ort as schule_ort,
           z.anfrage_notiz, z.erstellt_am, z.kontakt_chiffre
    from schulzugaenge z join schulen s on s.id = z.schule_id
    where z.status = 'offen' and z.weg = 'pruefung'
    order by z.erstellt_am asc
    limit ${grenze}
  `;

  return zeilen.map((z) => {
    const klar = z.kontakt_chiffre === null ? null : entschluesseleWennMoeglich(Buffer.from(z.kontakt_chiffre));
    return {
      id: z.id,
      schule_name: z.schule_name,
      schule_slug: z.schule_slug,
      schule_ort: z.schule_ort,
      anfrage_notiz: z.anfrage_notiz,
      erstellt_am: z.erstellt_am,
      kontakt_verkuerzt: klar === null ? null : verschleiere(klar, "email"),
    };
  });
}

/**
 * Gibt eine geprüfte Anfrage frei und erzeugt den Zugangslink.
 *
 * Der Link geht danach von Hand hinaus - die Redaktion hat die Schule ohnehin
 * gerade am Telefon oder im Schriftverkehr.
 */
export async function gibAnfrageFrei(
  id: string,
  moderatorId: string,
): Promise<{ link: string; kontakt: string | null } | null> {
  // Die Kennung kommt aus einem Formularfeld. Ohne diese Zeile wirft Postgres
  // 22P02 mitten in einer Server Action, statt dass eine Meldung entsteht.
  if (!istKennung(id) || !istKennung(moderatorId)) return null;
  const klartext = randomBytes(32).toString("base64url");
  const [zeile] = await sql<{ kontakt_chiffre: Uint8Array | null }[]>`
    update schulzugaenge
    set link_hash = ${hasheKontotoken(klartext, "anmeldung")},
        link_gueltig_bis = now() + ${`${ZUGANGSLINK_STUNDEN} hours`}::interval,
        link_verbraucht_am = null,
        entschieden_von = ${moderatorId}, entschieden_am = now()
    where id = ${id} and status = 'offen'
    returning kontakt_chiffre
  `;
  if (!zeile) return null;

  const kontakt = zeile.kontakt_chiffre === null
    ? null
    : entschluesseleWennMoeglich(Buffer.from(zeile.kontakt_chiffre));

  // Die Freigabe entschlüsselt den Kontakt und zeigt ihn an - die Übersicht
  // daneben zeigt bewusst nur die verkürzte Fassung. Damit ist es dieselbe
  // Einsicht wie am Vorgang und gehört unter dieselbe Bezeichnung ins
  // Protokoll (Entwicklungsplan 8.1, Festlegung 2). Und die Entscheidung
  // selbst gehört hinein: Sie verschafft Dritten Zugriff auf die Auswertung
  // einer Schule und stand bisher nur an ihrer eigenen Zeile.
  await sql`
    insert into moderationsprotokoll (aktion, moderator_id, begruendung)
    values ('schulzugang_entschieden', ${moderatorId},
            ${`Schulzugang freigegeben (Anfrage ${id})`})
  `;
  if (kontakt !== null) {
    await sql`
      insert into moderationsprotokoll (aktion, moderator_id, begruendung)
      values ('einsicht_kontakt', ${moderatorId},
              ${`Kontakt einer Schulzugangsanfrage eingesehen (Anfrage ${id})`})
    `;
  }

  return { link: klartext, kontakt };
}

export async function lehneAnfrageAb(id: string, moderatorId: string, grund: string): Promise<boolean> {
  if (!istKennung(id) || !istKennung(moderatorId)) return false;
  const ergebnis = await sql`
    update schulzugaenge
    set status = 'abgelehnt', ablehnungsgrund = ${grund},
        entschieden_von = ${moderatorId}, entschieden_am = now(),
        link_hash = null
    where id = ${id} and status = 'offen'
  `;
  if (ergebnis.count === 0) return false;

  await sql`
    insert into moderationsprotokoll (aktion, moderator_id, begruendung)
    values ('schulzugang_entschieden', ${moderatorId},
            ${`Schulzugang abgelehnt (Anfrage ${id}): ${grund}`})
  `;
  return true;
}
