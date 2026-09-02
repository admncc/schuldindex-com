/**
 * Der Zustand des Systems in Zahlen - für die Diagnoseschnittstelle.
 *
 * **Was hier nicht steht, ist die eigentliche Arbeit an dieser Datei.** Keine
 * Kontakte, keine Freitexte, keine Antworten, keine einzelne Bewertung -
 * ausschließlich Summen und Zustände. Eine Diagnoseschnittstelle ist ein
 * zweiter Weg in ein System; sie darf nichts zeigen, was auf dem ersten Weg
 * hinter einer Anmeldung und einem Protokolleintrag liegt.
 */

import { sql } from "./verbindung";
import { datenbanklage } from "../geo/mmdb";
import { PROTOKOLL_STUNDEN } from "../domain/diagnose";

/** Die Variablen, deren Fehlen etwas kaputt macht. Werte stehen hier nie. */
const PFLICHTVARIABLEN = [
  "DATABASE_URL",
  "BASIS_URL",
  "KONTAKT_HMAC_SCHLUESSEL",
  "KONTAKT_CHIFFRE_SCHLUESSEL",
  "TOKEN_HMAC_SCHLUESSEL",
  "SITZUNG_HMAC_SCHLUESSEL",
];

const WEITERE_VARIABLEN = [
  "VERTRAUTE_PROXYS",
  "INDEXIERUNG",
  "GEOIP_DB",
  "ANTHROPIC_API_KEY",
  "BETREIBER_NAME",
];

export interface Systemzustand {
  readonly zeitpunkt: string;
  readonly laufzeit: {
    readonly node: string;
    readonly betriebsart: string;
    readonly seitSekunden: number;
    readonly speicherMb: number;
  };
  readonly umgebung: {
    readonly gesetzt: Record<string, boolean>;
    readonly basisAdresse: string | null;
    readonly vertrauteProxys: number;
    readonly indexierung: boolean;
  };
  readonly datenbank: {
    readonly erreichbar: boolean;
    readonly antwortMs: number | null;
    readonly fassung: string | null;
    readonly groesse: string | null;
    readonly fehler: string | null;
  };
  readonly bestand: Record<string, number>;
  readonly bewertungen: Record<string, number>;
  readonly geoip: {
    readonly vorhanden: boolean;
    readonly art: string | null;
    readonly standAm: string | null;
    readonly groesseMb: number | null;
  };
  readonly protokoll: {
    readonly stunden: number;
    readonly eintraege: number;
    readonly fehler: number;
    readonly aeltester: string | null;
  };
}

export async function systemzustand(): Promise<Systemzustand> {
  const gesetzt: Record<string, boolean> = {};
  for (const name of [...PFLICHTVARIABLEN, ...WEITERE_VARIABLEN]) {
    gesetzt[name] = (process.env[name] ?? "").trim() !== "";
  }

  const begonnen = Date.now();
  let erreichbar = false;
  let antwortMs: number | null = null;
  let fassung: string | null = null;
  let groesse: string | null = null;
  let fehler: string | null = null;
  let bestand: Record<string, number> = {};
  let bewertungen: Record<string, number> = {};
  let protokoll = { stunden: PROTOKOLL_STUNDEN, eintraege: 0, fehler: 0, aeltester: null as string | null };

  try {
    const [kopf] = await sql<{ fassung: string; groesse: string }[]>`
      select version() as fassung, pg_size_pretty(pg_database_size(current_database())) as groesse
    `;
    antwortMs = Date.now() - begonnen;
    erreichbar = true;
    fassung = kopf?.fassung.split(" ").slice(0, 2).join(" ") ?? null;
    groesse = kopf?.groesse ?? null;

    const [zahlen] = await sql<Record<string, number>[]>`
      select
        (select count(*)::int from schulen) as schulen,
        (select count(*)::int from schul_aggregate) as schulen_mit_wertung,
        (select count(*)::int from konten) as konten,
        (select count(*)::int from konten where verifiziert_am is not null) as konten_bestaetigt,
        (select count(*)::int from konten where ist_demo) as konten_demo,
        (select count(*)::int from empfehlungen) as empfehlungen,
        (select count(*)::int from verlosungen) as verlosungen,
        (select count(*)::int from verlosungsgewinne) as gewinne,
        (select count(*)::int from meldungen where erledigt_am is null) as meldungen_offen,
        (select count(*)::int from schulzugaenge) as schulzugaenge,
        (select count(*)::int from moderatoren where aktiv) as moderatoren
    `;
    bestand = zahlen ?? {};

    const nachStatus = await sql<{ status: string; anzahl: number }[]>`
      select status::text, count(*)::int as anzahl from bewertungen group by status
    `;
    bewertungen = Object.fromEntries(nachStatus.map((z) => [z.status, z.anzahl]));
    const [demo] = await sql<{ anzahl: number }[]>`
      select count(*)::int as anzahl from bewertungen where ist_demo
    `;
    bewertungen["demo"] = demo?.anzahl ?? 0;

    const [p] = await sql<{ eintraege: number; fehler: number; aeltester: Date | null }[]>`
      select count(*)::int as eintraege,
             count(*) filter (where art = 'fehler')::int as fehler,
             min(erstellt_am) as aeltester
      from ereignisse
    `;
    protokoll = {
      stunden: PROTOKOLL_STUNDEN,
      eintraege: p?.eintraege ?? 0,
      fehler: p?.fehler ?? 0,
      aeltester: p?.aeltester?.toISOString() ?? null,
    };
  } catch (e) {
    // Eine unerreichbare Datenbank ist der wichtigste Befund überhaupt und
    // darf die Auskunft nicht verhindern - sonst antwortet die Diagnose
    // genau dann nicht, wenn sie gebraucht wird.
    fehler = e instanceof Error ? e.message : String(e);
  }

  const geo = await datenbanklage();

  return {
    zeitpunkt: new Date().toISOString(),
    laufzeit: {
      node: process.version,
      betriebsart: process.env["NODE_ENV"] ?? "unbekannt",
      seitSekunden: Math.round(process.uptime()),
      speicherMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    umgebung: {
      gesetzt,
      basisAdresse: process.env["BASIS_URL"] ?? null,
      vertrauteProxys: Number(process.env["VERTRAUTE_PROXYS"] ?? "0"),
      indexierung: (process.env["INDEXIERUNG"] ?? "").trim().toLowerCase() === "an",
    },
    datenbank: { erreichbar, antwortMs, fassung, groesse, fehler },
    bestand,
    bewertungen,
    geoip: {
      vorhanden: geo.vorhanden,
      art: geo.art,
      standAm: geo.standAm?.toISOString() ?? null,
      groesseMb: geo.groesseMb,
    },
    protokoll,
  };
}
