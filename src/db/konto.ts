/**
 * Abfragen des Kontobereichs.
 *
 * Hier steht auch das Löschen — und das ist die Stelle, an der Art. 17 DSGVO
 * praktisch wird: eine gelöschte Bewertung muss aus dem Schulscore und aus der
 * KI-Zusammenfassung verschwinden, nicht nur aus der Liste. Beides passiert in
 * derselben Transaktion.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { aktualisiereAggregat } from "./aggregate";
import { hasheKontotoken, type Zugangstoken } from "../domain/kontozugang";
import type { Kontaktart } from "../domain/kontakt";
import { entschluessele, verschleiere } from "../domain/kontakt";
import type { Zustand } from "../domain/bewertungsstatus";
import type { Rolle } from "../domain/bewertungseingabe";
import type { Antwort, KategorieId } from "../domain/fragebogen";
import type { Kontoumgebung } from "../dienste/kontozugang";
import { baueAnmeldelink, sende } from "../versand/nachricht";
import { versandkette } from "../versand/wege";

export function kontoumgebung(basisUrl: string): Kontoumgebung {
  return {
    async findeKonto(kontaktHash) {
      const [zeile] = await sql<{ id: string; verifiziert_am: Date | null }[]>`
        select id, verifiziert_am from konten where kontakt_hash = ${kontaktHash}
      `;
      return zeile ? { id: zeile.id, verifiziertAm: zeile.verifiziert_am } : null;
    },

    async zaehleLinks(kontoId) {
      const [zeile] = await sql<{ n: number }[]>`
        select count(*)::int as n from verifizierungstoken
        where konto_id = ${kontoId} and zweck = 'anmeldung'
          and erstellt_am > now() - interval '1 hour'
      `;
      return zeile?.n ?? 0;
    },

    async speichereAnmeldelink(kontoId, token) {
      await sql`
        insert into verifizierungstoken (konto_id, token_hash, zweck, gueltig_bis)
        values (${kontoId}, ${token.hash}, 'anmeldung', ${token.gueltigBis})
      `;
    },

    async sendeAnmeldelink(kontoId, klartext) {
      const [zeile] = await sql<{ kontakt_chiffre: Uint8Array; kontaktart: Kontaktart }[]>`
        select kontakt_chiffre, kontaktart from konten where id = ${kontoId}
      `;
      if (!zeile) return false;

      const empfaenger = entschluessele(Buffer.from(zeile.kontakt_chiffre));
      const nachricht = baueAnmeldelink(basisUrl, klartext, zeile.kontaktart);
      const ergebnis = await sende(versandkette(), empfaenger, zeile.kontaktart, nachricht);
      return ergebnis.ok;
    },
  };
}

/**
 * Löst einen Anmeldelink ein und legt eine Sitzung an.
 *
 * In einer Transaktion, und das Token wird beim Verbrauchen mit
 * `verbraucht_am is null` gesperrt: zwei gleichzeitige Aufrufe desselben Links
 * — etwa weil ein Messenger die Vorschau lädt und die Person kurz darauf tippt —
 * dürfen nicht zwei Sitzungen ergeben.
 */
export async function loeseAnmeldelinkEin(
  klartext: string,
  sitzung: Zugangstoken,
): Promise<{ ok: true; kontoId: string } | { ok: false; grund: "unbekannt" | "abgelaufen" | "verbraucht" }> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [token] = await tx<{ id: string; konto_id: string; gueltig_bis: Date; verbraucht_am: Date | null }[]>`
      select id, konto_id, gueltig_bis, verbraucht_am
      from verifizierungstoken
      where token_hash = ${hasheKontotoken(klartext, "anmeldung")} and zweck = 'anmeldung'
      for update
    `;
    if (!token) return { ok: false as const, grund: "unbekannt" as const };
    if (token.verbraucht_am !== null) return { ok: false as const, grund: "verbraucht" as const };
    if (token.gueltig_bis.getTime() <= Date.now()) return { ok: false as const, grund: "abgelaufen" as const };

    await tx`update verifizierungstoken set verbraucht_am = now() where id = ${token.id}`;
    await tx`
      insert into konto_sitzungen (konto_id, token_hash, gueltig_bis)
      values (${token.konto_id}, ${sitzung.hash}, ${sitzung.gueltigBis})
    `;
    await tx`update konten set letzte_anmeldung = now() where id = ${token.konto_id}`;

    return { ok: true as const, kontoId: token.konto_id };
  });
}

export interface AngemeldetesKonto {
  id: string;
  kontaktart: Kontaktart;
  verschleiert: string;
}

export async function holeKontositzung(klartext: string): Promise<AngemeldetesKonto | null> {
  const [zeile] = await sql<{ id: string; kontaktart: Kontaktart; kontakt_chiffre: Uint8Array }[]>`
    select k.id, k.kontaktart, k.kontakt_chiffre
    from konto_sitzungen s
    join konten k on k.id = s.konto_id
    where s.token_hash = ${hasheKontotoken(klartext, "sitzung")}
      and s.beendet_am is null and s.gueltig_bis > now()
  `;
  if (!zeile) return null;

  // Nur die verkürzte Fassung wandert weiter. Der Klartext wird für die Anzeige
  // nicht gebraucht, und was nicht gebraucht wird, soll nicht herumliegen.
  const klar = entschluessele(Buffer.from(zeile.kontakt_chiffre));
  return { id: zeile.id, kontaktart: zeile.kontaktart, verschleiert: verschleiere(klar, zeile.kontaktart) };
}

export async function beendeKontositzung(klartext: string): Promise<void> {
  await sql`
    update konto_sitzungen set beendet_am = now()
    where token_hash = ${hasheKontotoken(klartext, "sitzung")} and beendet_am is null
  `;
}

/** Meldet alle Geräte ab — der Weg, wenn ein Telefon verlorengeht. */
export async function beendeAlleSitzungen(kontoId: string): Promise<number> {
  const ergebnis = await sql`
    update konto_sitzungen set beendet_am = now()
    where konto_id = ${kontoId} and beendet_am is null
  `;
  return ergebnis.count;
}

export interface EigeneBewertung {
  id: string;
  status: Zustand;
  rolle: string;
  klassenstufe: number | null;
  erstellt_am: Date;
  zuletzt_bearbeitet_am: Date | null;
  ablehnungsgrund: string | null;
  schule_name: string;
  schule_slug: string;
  schule_ort: string | null;
  gesamtscore: string | null;
  version: number;
  hat_freitext: boolean;
}

export async function eigeneBewertungen(kontoId: string): Promise<EigeneBewertung[]> {
  return sql<EigeneBewertung[]>`
    select b.id, b.status::text as status, b.rolle::text as rolle, b.klassenstufe,
           b.erstellt_am, b.zuletzt_bearbeitet_am, b.ablehnungsgrund,
           s.name as schule_name, s.slug as schule_slug, s.ort as schule_ort,
           v.gesamtscore, v.version,
           v.freitexte <> '{}'::jsonb as hat_freitext
    from bewertungen b
    join schulen s on s.id = b.schule_id
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.konto_id = ${kontoId}
    order by b.erstellt_am desc
  `;
}

/**
 * Löscht eine einzelne Bewertung (Art. 17 DSGVO).
 *
 * Die Versionen gehen über `on delete cascade` mit. Danach wird das Aggregat
 * der Schule neu gerechnet — sonst bliebe die gelöschte Stimme im Score stehen.
 *
 * Die Zusammenfassung bleibt zunächst, wie sie ist: sie neu zu erzeugen
 * verlangt einen Modellaufruf. Der nächste Lauf holt das nach, und er erkennt
 * den Fall daran, dass die Zahl der Freitexte gesunken ist (`istFaellig`).
 */
export async function loescheBewertung(kontoId: string, bewertungId: string): Promise<boolean> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const [zeile] = await tx<{ schule_id: string }[]>`
      delete from bewertungen where id = ${bewertungId} and konto_id = ${kontoId}
      returning schule_id
    `;
    if (!zeile) return false;
    await aktualisiereAggregat(zeile.schule_id, tx);
    return true;
  });
}

/**
 * Löscht das Konto mit allem, was daran hängt.
 *
 * Reihenfolge: erst merken, welche Schulen betroffen sind, dann löschen, dann
 * nachrechnen. Umgekehrt wäre nach dem Löschen nicht mehr feststellbar, welche
 * Aggregate falsch geworden sind.
 */
export async function loescheKonto(kontoId: string): Promise<number> {
  return sql.begin(async (tx: postgres.TransactionSql) => {
    const schulen = await tx<{ schule_id: string }[]>`
      select distinct schule_id from bewertungen where konto_id = ${kontoId}
    `;
    await tx`delete from konten where id = ${kontoId}`;
    for (const s of schulen) await aktualisiereAggregat(s.schule_id, tx);
    return schulen.length;
  });
}

export interface FassungZumAendern {
  id: string;
  rolle: Rolle;
  klassenstufe: number | null;
  abgangsjahr: number | null;
  antworten: Record<string, Antwort>;
  freitexte: Partial<Record<KategorieId, string>>;
}

/**
 * Die aktuelle Fassung einer eigenen Bewertung, zum Vorbelegen des Formulars.
 *
 * Die Schule steht mit in der Bedingung: eine Bewertung soll nicht über eine
 * fremde Adresse an einer anderen Schule geöffnet werden können. `null` heißt
 * in jedem Fall dasselbe — gibt es nicht, gehört jemand anderem, oder ist
 * abgelehnt und damit endgültig.
 */
export async function holeFassungZumAendern(
  kontoId: string,
  bewertungId: string,
  schuleId: string,
): Promise<FassungZumAendern | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bewertungId)) return null;

  const [zeile] = await sql<FassungZumAendern[]>`
    select b.id, b.rolle::text as rolle, b.klassenstufe, b.abgangsjahr,
           v.antworten, v.freitexte
    from bewertungen b
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.id = ${bewertungId} and b.konto_id = ${kontoId} and b.schule_id = ${schuleId}
      and b.status <> 'abgelehnt'
  `;
  return zeile ?? null;
}
