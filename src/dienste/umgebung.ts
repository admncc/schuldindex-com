/**
 * Die Umgebung des Abgabedienstes, angebunden an Postgres.
 *
 * Hier und nur hier steht SQL. Der Ablauf selbst (`bewertungAbgeben`) kennt
 * keine Datenbank — deshalb ließ er sich vollständig prüfen, bevor es diese
 * Datei gab.
 */

import type postgres from "postgres";
import { sql } from "../db/verbindung";
import { freitexteAlsObjekt, type Umgebung } from "./bewertungAbgeben";
import type { Aenderungsumgebung } from "./bewertungAendern";
import { aktualisiereAggregat } from "../db/aggregate";
import type { Zustand } from "../domain/bewertungsstatus";
import { baueBestaetigung, sende } from "../versand/nachricht";
import { versandkette } from "../versand/wege";
import { holeEinstellungen } from "../db/einstellungen";
import type { Kontaktart } from "../domain/kontakt";
import type { Punkt } from "../domain/geopruefung";

/** Wörter, deren Auftauchen im Freitext eine Prüfung durch Menschen auslöst. */
const VERBOTEN =
  /\b(frau|herr|herrn)\s+[A-ZÄÖÜ][a-zäöüß]{2,}|https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}/i;

export function umgebungMitDatenbank(basisUrl: string, absenderOrtung: () => Promise<Punkt | null>): Umgebung {
  return {
    async holeSchule(slug) {
      const [zeile] = await sql<{ id: string; slug: string; name: string; lat: number | null; lon: number | null }[]>`
        select id, slug, name, lat, lon from schulen where slug = ${slug} and ist_aktiv
      `;
      if (!zeile) return null;
      return {
        id: zeile.id,
        slug: zeile.slug,
        name: zeile.name,
        punkt: zeile.lat === null || zeile.lon === null ? null : { lat: zeile.lat, lon: zeile.lon },
      };
    },

    async findeKonto(kontaktHash) {
      const [zeile] = await sql<{ id: string; verifiziert_am: Date | null }[]>`
        select id, verifiziert_am from konten where kontakt_hash = ${kontaktHash}
      `;
      return zeile ? { id: zeile.id, verifiziertAm: zeile.verifiziert_am } : null;
    },

    async legeKontoAn({ kontaktHash, chiffre, art }) {
      const [zeile] = await sql<{ id: string }[]>`
        insert into konten (kontakt_chiffre, kontakt_hash, kontaktart)
        values (${chiffre}, ${kontaktHash}, ${art}::kontaktart)
        returning id
      `;
      return { id: zeile!.id, verifiziertAm: null };
    },

    async hatBereitsBewertet(schuleId, kontoId) {
      const [zeile] = await sql<{ n: number }[]>`
        select count(*)::int as n from bewertungen
        where schule_id = ${schuleId} and konto_id = ${kontoId}
      `;
      return (zeile?.n ?? 0) > 0;
    },

    async holeZaehler(kontoId, schuleId) {
      const [zeile] = await sql<{ zehn: number; tag: number; stunde: number }[]>`
        select
          (select count(*)::int from bewertungen
             where konto_id = ${kontoId} and erstellt_am > now() - interval '10 minutes') as zehn,
          (select count(distinct schule_id)::int from bewertungen
             where konto_id = ${kontoId} and erstellt_am > now() - interval '24 hours') as tag,
          (select count(*)::int from bewertungen
             where schule_id = ${schuleId} and erstellt_am > now() - interval '1 hour') as stunde
      `;
      return {
        abgabenLetzteZehnMinuten: zeile?.zehn ?? 0,
        schulenLetzte24Stunden: zeile?.tag ?? 0,
        bewertungenDieserSchuleLetzteStunde: zeile?.stunde ?? 0,
      };
    },

    ortungDesAbsenders: absenderOrtung,

    /**
     * Vorprüfung des Freitextes.
     *
     * Bewusst grob und großzügig im Auslösen: sie entscheidet nichts, sie holt
     * einen Menschen dazu. Erkannt werden Anreden mit Namen („Frau Müller“),
     * Verweise ins Netz und Adressen — die drei Muster, die den Freitext
     * unbrauchbar machen.
     */
    async pruefeFreitext(texte) {
      return texte.some((t) => VERBOTEN.test(t));
    },

    async speichere(daten) {
      return sql.begin(async (tx: postgres.TransactionSql) => {
        const [bewertung] = await tx<{ id: string }[]>`
          insert into bewertungen (
            schule_id, konto_id, rolle, klassenstufe, abgangsjahr, status,
            datenschutz_einwilligung_am, eltern_einwilligung_am, einwilligung_fassung,
            geo_entfernung_km, geo_unbekannt, verlosung_teilnahme, signale, signalpunkte,
            klickmuster, klickfolge
          ) values (
            ${daten.schuleId}, ${daten.kontoId}, ${daten.eingabe.rolle!}::rolle,
            ${daten.eingabe.klassenstufe}, ${daten.eingabe.abgangsjahr},
            ${daten.status}::bewertungsstatus,
            now(), ${daten.eingabe.elternEinwilligung ? sql`now()` : null}, 'v1',
            ${daten.geoEntfernungKm}, ${daten.geoUnbekannt},
            ${daten.eingabe.verlosungTeilnahme},
            ${sql.json(daten.signale as never)}, ${daten.signalpunkte},
            ${daten.klick === null ? null : sql.json(daten.klick as never)},
            ${daten.klickfolge === null ? null : sql.json(daten.klickfolge as never)}
          ) returning id
        `;

        const s = daten.scores;
        const kategorie = (id: string) => s.kategorien.find((k) => k.kategorie === id)?.score ?? null;

        await tx`
          insert into bewertung_versionen (
            bewertung_id, version, antworten, freitexte,
            score_a, score_b, score_c, score_d, score_e, score_f,
            aggressionsindex, gesamtscore
          ) values (
            ${bewertung!.id}, 1,
            ${tx.json(daten.eingabe.antworten as never)},
            ${tx.json(freitexteAlsObjekt(daten.eingabe.freitexte) as never)},
            ${kategorie("A")}, ${kategorie("B")}, ${kategorie("C")},
            ${kategorie("D")}, ${kategorie("E")}, ${kategorie("F")},
            ${s.aggression?.index ?? null}, ${s.gesamtscore}
          )
        `;

        await tx`
          insert into verifizierungstoken (konto_id, token_hash, zweck, gueltig_bis)
          values (${daten.kontoId}, ${daten.token.hash}, 'bestaetigung', ${daten.token.gueltigBis})
        `;

        return { bewertungId: bewertung!.id };
      });
    },

    holeEinstellungen,

    /**
     * Der bisherige Stand der Schule, auf der Anzeigeskala 0–10.
     *
     * Aus `schul_aggregate` und damit aus den **freigegebenen** Bewertungen:
     * Eine gehaltene oder abgelehnte Bewertung soll das Mittel nicht
     * mitbestimmen, gegen das die nächste geprüft wird. Sonst zöge eine Welle
     * das Mittel zu sich hin und machte die echten Bewertungen verdächtig.
     */
    async holeSchulmittel(schuleId) {
      const [zeile] = await sql<{ mittel: string | null; anzahl: number }[]>`
        select gesamtscore as mittel, coalesce(anzahl, 0) as anzahl
        from schul_aggregate where schule_id = ${schuleId}
      `;
      return {
        mittel: zeile?.mittel == null ? null : Number(zeile.mittel),
        anzahl: zeile?.anzahl ?? 0,
      };
    },

    async sendeBestaetigung(empfaenger, art, token) {
      const nachricht = baueBestaetigung(basisUrl, token.klartext, art as Kontaktart);
      const ergebnis = await sende(versandkette(), empfaenger, art as Kontaktart, nachricht);
      return ergebnis.ok;
    },
  };
}

/**
 * Die Umgebung des Änderungsdienstes.
 *
 * Sie teilt sich die Freitextvorprüfung mit der Erstabgabe — dieselben Muster,
 * dieselbe Wirkung. Neu ist nur das Schreiben einer weiteren Fassung.
 */
export function aenderungsumgebungMitDatenbank(): Aenderungsumgebung {
  return {
    async holeBewertung(bewertungId, kontoId) {
      const [zeile] = await sql<
        {
          id: string;
          konto_id: string;
          schule_id: string;
          slug: string;
          status: Zustand;
          aktuelle_version: number;
        }[]
      >`
        select b.id, b.konto_id, b.schule_id, s.slug,
               b.status::text as status, b.aktuelle_version
        from bewertungen b join schulen s on s.id = b.schule_id
        where b.id = ${bewertungId} and b.konto_id = ${kontoId}
      `;
      if (!zeile) return null;
      return {
        id: zeile.id,
        kontoId: zeile.konto_id,
        schuleId: zeile.schule_id,
        schulSlug: zeile.slug,
        status: zeile.status,
        aktuelleVersion: zeile.aktuelle_version,
      };
    },

    async pruefeFreitext(texte) {
      return texte.some((t) => VERBOTEN.test(t));
    },

    async speichereFassung(daten) {
      await sql.begin(async (tx: postgres.TransactionSql) => {
        const s = daten.scores;
        const kategorie = (id: string) => s.kategorien.find((k) => k.kategorie === id)?.score ?? null;

        await tx`
          insert into bewertung_versionen (
            bewertung_id, version, antworten, freitexte,
            score_a, score_b, score_c, score_d, score_e, score_f,
            aggressionsindex, gesamtscore
          ) values (
            ${daten.bewertungId}, ${daten.version},
            ${tx.json(daten.eingabe.antworten as never)},
            ${tx.json(freitexteAlsObjekt(daten.eingabe.freitexte) as never)},
            ${kategorie("A")}, ${kategorie("B")}, ${kategorie("C")},
            ${kategorie("D")}, ${kategorie("E")}, ${kategorie("F")},
            ${s.aggression?.index ?? null}, ${s.gesamtscore}
          )
        `;

        await tx`
          update bewertungen
          set aktuelle_version = ${daten.version},
              status = ${daten.status}::bewertungsstatus,
              rolle = ${daten.eingabe.rolle!}::rolle,
              klassenstufe = ${daten.eingabe.klassenstufe},
              abgangsjahr = ${daten.eingabe.abgangsjahr},
              zuletzt_bearbeitet_am = now(),
              aktualisiert_am = now()
          where id = ${daten.bewertungId}
        `;

        // Die vorherige Fassung war womöglich veröffentlicht und ist es jetzt
        // nicht mehr — ohne diese Zeile stünde ihr Wert weiter im Schulscore.
        await aktualisiereAggregat(daten.schuleId, tx);
      });
    },
  };
}
