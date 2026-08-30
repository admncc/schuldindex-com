/**
 * Neuberechnung der Schulaggregate.
 *
 * Das Bindeglied, das bisher fehlte: eine Bewertung wurde freigegeben, aber das
 * Schulprofil zeigte weiter den alten Stand - weil `schul_aggregate` niemand
 * fortschrieb. Jede Stelle, die den Status einer Bewertung ändert, ruft von
 * hier aus nach.
 *
 * Gerechnet wird aus den **gespeicherten** Werten je Bewertung, nicht aus den
 * Rohantworten. Die Kategoriewerte einer Bewertung stehen fest, sobald sie
 * abgegeben ist; sie bei jeder Freigabe neu aus dem Fragebogen zu rechnen
 * hieße, alte Bewertungen rückwirkend nach heutigen Regeln zu bewerten.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { aggregiere, type EinzelneBewertung } from "../domain/aggregation";
import type { KategorieId } from "../domain/fragebogen";
import { ampelstufe, scorestufe, type Bewertungsergebnis } from "../domain/scoring";

type Ausfuehrer = postgres.Sql | postgres.TransactionSql;

interface Zeile {
  rolle: string;
  erstellt_am: Date;
  hat_freitext: boolean;
  gesamtscore: string | null;
  aggressionsindex: string | null;
  score_a: string | null;
  score_b: string | null;
  score_c: string | null;
  score_d: string | null;
  score_e: string | null;
  score_f: string | null;
}

const SPALTEN: readonly (readonly [KategorieId, keyof Zeile])[] = [
  ["A", "score_a"], ["B", "score_b"], ["C", "score_c"],
  ["D", "score_d"], ["E", "score_e"], ["F", "score_f"],
];

/** Postgres liefert `numeric` als Zeichenkette - sonst verlöre es Stellen. */
function zahl(wert: string | null): number | null {
  return wert === null ? null : Number(wert);
}

function alsBewertung(z: Zeile): EinzelneBewertung {
  const index = zahl(z.aggressionsindex);
  const gesamt = zahl(z.gesamtscore) ?? 0;
  const ergebnis: Bewertungsergebnis = {
    gesamtscore: gesamt,
    stufe: scorestufe(gesamt),
    kategorien: SPALTEN.map(([id, spalte]) => {
      const score = zahl(z[spalte] as string | null);
      return {
        kategorie: id,
        score,
        anzeige: score === null ? null : ((score - 1) / 4) * 10,
        // Die Gewichtung kommt in der Aggregation aus dem Katalog, nicht von
        // hier; sie steht nur da, weil die Schnittstelle sie verlangt.
        gewichtung: 0,
        beantwortet: score === null ? 0 : 1,
      };
    }),
    aggression: index === null ? null : { index, stufe: ampelstufe(index) },
  };
  return { ergebnis, rolle: z.rolle, hatFreitext: z.hat_freitext, erstelltAm: z.erstellt_am };
}

/**
 * Rechnet das Aggregat einer Schule neu und schreibt es fort.
 *
 * Läuft in der Transaktion des Aufrufers, wenn eine übergeben wird - sonst
 * stünde die Freigabe fest und die Zahl daneben wäre die von vorhin.
 */
export async function aktualisiereAggregat(schuleId: string, tx: Ausfuehrer = sql): Promise<void> {
  const zeilen = await tx<Zeile[]>`
    select b.rolle::text as rolle, b.erstellt_am,
           v.freitexte <> '{}'::jsonb as hat_freitext,
           v.gesamtscore, v.aggressionsindex,
           v.score_a, v.score_b, v.score_c, v.score_d, v.score_e, v.score_f
    from bewertungen b
    join bewertung_versionen v on v.bewertung_id = b.id and v.version = b.aktuelle_version
    where b.schule_id = ${schuleId} and b.status = 'freigegeben'
  `;

  const alle = zeilen.map(alsBewertung);
  const a = aggregiere(alle);

  // Vergleichsstand für den Sechs-Monats-Trend: dieselbe Rechnung, aber nur mit
  // dem, was vor einem halben Jahr schon vorlag.
  const grenze = new Date(Date.now() - 182 * 24 * 3600_000);
  const alt = alle.filter((b) => b.erstelltAm <= grenze);
  const davor = aggregiere(alt);

  const k = (id: KategorieId) => a.kategorien[id] ?? null;

  await tx`
    insert into schul_aggregate (
      schule_id, gesamtscore, gesamtscore_roh, score_a, score_b, score_c, score_d, score_e, score_f,
      aggressionsindex, anzahl, anzahl_je_rolle, anzahl_mit_freitext,
      gesamtscore_vor_6m, anzahl_vor_6m, letzte_bewertung_am, aktualisiert_am
    ) values (
      ${schuleId}, ${a.gesamtscore}, ${a.gesamtscoreRoh}, ${k("A")}, ${k("B")}, ${k("C")},
      ${k("D")}, ${k("E")}, ${k("F")}, ${a.aggressionsindex},
      ${a.anzahl}, ${tx.json(a.anzahlJeRolle as never)}, ${a.anzahlMitFreitext},
      ${davor.gesamtscoreIntern}, ${davor.anzahl}, ${a.letzteBewertungAm}, now()
    )
    on conflict (schule_id) do update set
      gesamtscore = excluded.gesamtscore,
      gesamtscore_roh = excluded.gesamtscore_roh,
      score_a = excluded.score_a, score_b = excluded.score_b, score_c = excluded.score_c,
      score_d = excluded.score_d, score_e = excluded.score_e, score_f = excluded.score_f,
      aggressionsindex = excluded.aggressionsindex,
      anzahl = excluded.anzahl,
      anzahl_je_rolle = excluded.anzahl_je_rolle,
      anzahl_mit_freitext = excluded.anzahl_mit_freitext,
      gesamtscore_vor_6m = excluded.gesamtscore_vor_6m,
      anzahl_vor_6m = excluded.anzahl_vor_6m,
      letzte_bewertung_am = excluded.letzte_bewertung_am,
      aktualisiert_am = now()
  `;
}

/** Wie `aktualisiereAggregat`, aber für mehrere Schulen auf einmal. */
export async function aktualisiereAggregate(schuleIds: readonly string[], tx: Ausfuehrer = sql): Promise<void> {
  for (const id of new Set(schuleIds)) await aktualisiereAggregat(id, tx);
}
