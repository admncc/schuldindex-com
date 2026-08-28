/**
 * Erzeugt Demobewertungen für den Testbetrieb.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/demodaten.ts [--anzahl 600] [--schulen 60]
 *
 * Warum überhaupt: Ohne Bewertungen ist das Portal nicht zu beurteilen.
 * Ranglisten brauchen 20 Bewertungen je Schule, ein Profil 10, die Karte
 * bewertete Schulen, die Moderation eine Warteschlange. Wer mit leerer
 * Datenbank testet, sieht überall nur Leerzustände.
 *
 * **Die Daten sind erfunden und als solche gekennzeichnet** (`ist_demo`). Sie
 * lassen sich im Panel unter „Aufbewahrung“ mit einem Klick wieder entfernen,
 * ohne dass eine einzige echte Bewertung in Gefahr gerät.
 *
 * Zwei Dinge, die dabei wichtiger sind, als es klingt:
 *
 *  - **Kein Zufallsrauschen.** Jede Schule bekommt einen eigenen „Charakter“ -
 *    eine gute, eine mittlere, eine schlechte -, und die Antworten streuen um
 *    ihn herum. Gleichverteilter Zufall ergäbe überall denselben Mittelwert von
 *    3, und dann sähe man weder Ranglisten noch Ampelfarben arbeiten.
 *  - **Kein echter Kontakt.** Die Konten tragen erfundene Nummern im Bereich,
 *    der für Beispiele reserviert ist. Verschickt wird an Demokonten nichts;
 *    die Bestätigung ist bereits gesetzt.
 */

import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { FRAGEN, KATEGORIEN, KEINE_ANGABE, type Antwort, type KategorieId } from "../src/domain/fragebogen";
import { bewerte } from "../src/domain/scoring";
import { aktualisiereAggregat } from "../src/db/aggregate";

function argument(name: string, standard: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return standard;
  const wert = Number(process.argv[i + 1]);
  return Number.isFinite(wert) && wert > 0 ? Math.floor(wert) : standard;
}

const ANZAHL = argument("anzahl", 600);
const SCHULEN = argument("schulen", 60);

/**
 * Ein fester Zufall.
 *
 * Zwei Läufe mit denselben Argumenten ergeben dieselben Daten. Das ist beim
 * Testen mehr wert, als es klingt: Wenn eine Rangliste seltsam aussieht, soll
 * sie nach dem nächsten Lauf noch genauso seltsam aussehen.
 */
function zufallsfolge(saat: string): () => number {
  let zustand = parseInt(createHash("sha256").update(saat).digest("hex").slice(0, 8), 16);
  return () => {
    // xorshift32 - reicht für Testdaten und braucht keine Abhängigkeit.
    zustand ^= zustand << 13;
    zustand ^= zustand >>> 17;
    zustand ^= zustand << 5;
    return ((zustand >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Normalverteilte Streuung um einen Mittelwert, auf 1–5 begrenzt. */
function umMittel(zufall: () => number, mittel: number, streuung: number): 1 | 2 | 3 | 4 | 5 {
  const summe = zufall() + zufall() + zufall() - 1.5;
  const wert = Math.round(mittel + summe * streuung * 2);
  return Math.min(5, Math.max(1, wert)) as 1 | 2 | 3 | 4 | 5;
}

const ROLLEN = ["schueler_ab_16", "schueler_unter_16", "eltern", "lehrkraft", "ehemalig"] as const;

const FREITEXTE: Readonly<Record<KategorieId, readonly string[]>> = {
  A: [
    "Auf dem Pausenhof ist meistens jemand von den Lehrkräften da, das hilft.",
    "In den Umkleiden gibt es öfter Ärger, da schaut niemand hin.",
    "Seit dem Streitschlichterprogramm ist es deutlich ruhiger geworden.",
  ],
  B: [
    "Der Unterricht fällt oft aus und wird selten nachgeholt.",
    "In den Naturwissenschaften wird viel experimentiert, das macht Spaß.",
    "Rückmeldungen zu Arbeiten kommen sehr spät.",
  ],
  C: [
    "Das WLAN funktioniert in der Hälfte der Räume nicht.",
    "Die Bibliothek ist gut ausgestattet und lange offen.",
    "Die Toiletten sind ein Dauerthema.",
  ],
  D: [
    "Auf E-Mails an das Sekretariat kommt zuverlässig eine Antwort.",
    "Entscheidungen werden getroffen, ohne dass jemand erklärt, warum.",
  ],
  E: [
    "Mülltrennung gibt es, wird aber kaum beachtet.",
    "Die Schulgarten-AG ist richtig gut.",
  ],
  F: [
    "Es gibt viele AGs, auch am Nachmittag.",
    "Ausflüge finden selten statt.",
  ],
};

interface Schulcharakter {
  readonly id: string;
  readonly mittel: number;
  readonly streuung: number;
}

async function main(): Promise<void> {
  const sql = postgres(process.env["DATABASE_URL"] ?? "", { onnotice: () => {} });
  const zufall = zufallsfolge("schulindex-demo-v1");

  try {
    const vorhanden = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where ist_demo`;
    if ((vorhanden[0]?.n ?? 0) > 0) {
      console.error(
        `Es liegen bereits ${vorhanden[0]!.n} Demobewertungen vor. Erst löschen (Panel → Aufbewahrung), dann neu erzeugen.`,
      );
      return;
    }

    // Schulen mit Koordinate: Nur die erscheinen auf der Karte, und genau das
    // soll sich ja ansehen lassen.
    const schulen = await sql<{ id: string; name: string }[]>`
      select id, name from schulen
      where ist_aktiv and lat is not null
      order by md5(id::text)
      limit ${SCHULEN}
    `;
    if (schulen.length === 0) {
      console.error("Keine Schulen in der Datenbank. Erst importieren (scripts/importiere.ts).");
      return;
    }

    const charaktere: Schulcharakter[] = schulen.map((s) => ({
      id: s.id,
      // Von 2,2 bis 4,4: gute, mittelmäßige und schwache Schulen nebeneinander,
      // damit Ranglisten und Ampelfarben etwas zu zeigen haben.
      mittel: 2.2 + zufall() * 2.2,
      streuung: 0.4 + zufall() * 0.5,
    }));

    console.error(`${schulen.length} Schulen, ${ANZAHL} Bewertungen werden erzeugt …`);

    let erzeugt = 0;
    for (let i = 0; i < ANZAHL; i++) {
      // Ungleich verteilt: Ein paar Schulen bekommen viele Bewertungen (über
      // der Ranglistenschwelle), der Rest wenige - so sieht es im Betrieb aus.
      const gewichtet = Math.floor(charaktere.length * zufall() ** 2);
      const schule = charaktere[Math.min(gewichtet, charaktere.length - 1)]!;
      const rolle = ROLLEN[Math.floor(zufall() * ROLLEN.length)]!;

      const antworten: Record<string, Antwort> = {};
      for (const frage of FRAGEN) {
        const pflicht = ["A", "B", "C"].includes(frage.kategorie);
        // Optionale Kategorien beantwortet nur ein Teil - genau der Fall, für
        // den die Aggregation je Kategorie mittelt statt Gesamtscores.
        if (!pflicht && zufall() > 0.45) continue;
        if (zufall() < 0.04) {
          antworten[frage.id] = KEINE_ANGABE;
          continue;
        }
        antworten[frage.id] =
          frage.teilbereich === "aggression"
            ? // Häufigkeitsfragen laufen andersherum: An einer guten Schule wird
              // selten gemobbt, der Rohwert ist also niedrig.
              umMittel(zufall, 6 - schule.mittel, schule.streuung)
            : umMittel(zufall, schule.mittel, schule.streuung);
      }

      const freitexte: Record<string, string> = {};
      for (const k of KATEGORIEN) {
        const texte = FREITEXTE[k.id];
        if (zufall() < 0.35 && texte.length > 0) {
          freitexte[k.id] = texte[Math.floor(zufall() * texte.length)]!;
        }
      }

      const scores = bewerte(antworten);
      const tageZurueck = Math.floor(zufall() * 400);
      // Die meisten freigegeben, ein Rest in der Warteschlange - sonst hat die
      // Moderation nichts zu tun und der Ablauf lässt sich nicht ansehen.
      const los = zufall();
      const status = los < 0.86 ? "freigegeben" : los < 0.94 ? "in_pruefung_betrug" : "in_pruefung_geo";
      const klassenstufe = rolle.startsWith("schueler") ? 5 + Math.floor(zufall() * 9) : null;

      await sql.begin(async (tx: postgres.TransactionSql) => {
        const [konto] = await tx<{ id: string }[]>`
          insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, erstellt_am, ist_demo)
          values (decode('00', 'hex'), ${`demo-${randomUUID()}`}, 'sms',
                  now() - ${`${tageZurueck} days`}::interval,
                  now() - ${`${tageZurueck} days`}::interval, true)
          returning id
        `;

        const [bewertung] = await tx<{ id: string }[]>`
          insert into bewertungen (
            schule_id, konto_id, rolle, klassenstufe, status,
            datenschutz_einwilligung_am, eltern_einwilligung_am, einwilligung_fassung,
            geo_entfernung_km, geo_unbekannt, erstellt_am, aktualisiert_am,
            moderiert_am, ist_demo
          ) values (
            ${schule.id}, ${konto!.id}, ${rolle}::rolle, ${klassenstufe}, ${status}::bewertungsstatus,
            now() - ${`${tageZurueck} days`}::interval,
            ${rolle === "schueler_unter_16" ? tx`now() - ${`${tageZurueck} days`}::interval` : null},
            'v1', ${Math.round(zufall() * 40)}, false,
            now() - ${`${tageZurueck} days`}::interval,
            now() - ${`${tageZurueck} days`}::interval,
            ${status === "freigegeben" ? tx`now() - ${`${tageZurueck} days`}::interval` : null},
            true
          )
          returning id
        `;

        const kategorie = (id: string) => scores.kategorien.find((k) => k.kategorie === id)?.score ?? null;
        await tx`
          insert into bewertung_versionen (
            bewertung_id, version, antworten, freitexte,
            score_a, score_b, score_c, score_d, score_e, score_f,
            aggressionsindex, gesamtscore, erstellt_am
          ) values (
            ${bewertung!.id}, 1, ${tx.json(antworten as never)}, ${tx.json(freitexte as never)},
            ${kategorie("A")}, ${kategorie("B")}, ${kategorie("C")},
            ${kategorie("D")}, ${kategorie("E")}, ${kategorie("F")},
            ${scores.aggression?.index ?? null}, ${scores.gesamtscore},
            now() - ${`${tageZurueck} days`}::interval
          )
        `;
      });

      erzeugt += 1;
      if (erzeugt % 100 === 0) console.error(`  ${erzeugt} …`);
    }

    console.error("Aggregate werden neu gerechnet …");
    for (const schule of schulen) await aktualisiereAggregat(schule.id);

    const [lage] = await sql<{ freigegeben: number; wartend: number; schulen: number }[]>`
      select count(*) filter (where status = 'freigegeben')::int as freigegeben,
             count(*) filter (where status in ('in_pruefung_geo', 'in_pruefung_betrug'))::int as wartend,
             count(distinct schule_id)::int as schulen
      from bewertungen where ist_demo
    `;
    console.error(
      `Fertig: ${erzeugt} Demobewertungen über ${lage?.schulen} Schulen ` +
        `(${lage?.freigegeben} freigegeben, ${lage?.wartend} in der Warteschlange).`,
    );
    console.error("Entfernen im Panel unter Aufbewahrung → Demodaten.");
  } finally {
    await sql.end();
  }
}

await main();
