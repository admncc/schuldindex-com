/**
 * Entfernt die Testdaten aus den QA-Durchgängen - und nichts sonst.
 *
 *   DATABASE_URL=… npx tsx scripts/qa-aufraeumen.ts             # nur zeigen
 *   DATABASE_URL=… npx tsx scripts/qa-aufraeumen.ts --wirklich  # löschen
 *
 * Warum ein eigenes Skript und nicht ein `delete` von Hand: Die Testkonten
 * sind über die normalen Formulare entstanden und tragen deshalb kein
 * Merkmal, an dem die Datenbank sie erkennt - `ist_demo` steht nur an den
 * erzeugten Demobewertungen. Was sie kenntlich macht, ist die Endung ihrer
 * Kontaktadresse, und die liegt verschlüsselt. Ein `delete ... like` ist hier
 * also gar nicht möglich; es braucht einen Durchlauf, der jeden Kontakt
 * entschlüsselt und vergleicht.
 *
 * Zwei Sicherungen, weil ein Löschskript auf einer Produktionsdatenbank läuft:
 *
 *  - **Ohne `--wirklich` wird nichts angefasst.** Der Lauf zeigt, was ginge.
 *  - **Konten mit einer freigegebenen Bewertung oder einem Gewinn bleiben
 *    stehen**, auch wenn die Adresse passt. Eine freigegebene Bewertung steckt
 *    in den veröffentlichten Mittelwerten einer Schule; ein Gewinn ist ein
 *    Vorgang, über den Rechenschaft zu geben ist. Beides still verschwinden zu
 *    lassen, wäre schlimmer als ein übriggebliebener Testdatensatz. Sie werden
 *    benannt, damit jemand von Hand entscheiden kann.
 *
 * Das Moderatorenkonto wird **stillgelegt, nicht gelöscht**: Am Protokoll
 * hängt, wer wann was entschieden hat, und `on delete set null` würde genau
 * diese Zuordnung kappen. Ein Protokoll, das nachträglich Lücken bekommt, ist
 * keines. Stilllegen erreicht dasselbe Ziel - niemand kommt mehr hinein - ohne
 * die Vergangenheit umzuschreiben.
 */

import postgres from "postgres";
import { entschluesseleWennMoeglich } from "../src/domain/kontakt";
import { aktualisiereAggregate } from "../src/db/aggregate";

type Auswahl<T> = { zuLoeschen: T[]; geschuetzt: T[] };

/**
 * Welche Konten dürfen weg, welche nicht?
 *
 * Steht hier getrennt, weil das die einzige Stelle mit einer Entscheidung ist -
 * alles andere im Skript ist Abfrage und Ausgabe. Die Regel: Die Endung macht
 * ein Konto zum Kandidaten, eine freigegebene Bewertung oder ein Gewinn nimmt
 * es wieder heraus.
 *
 * **Der Fehler, gegen den das steht.** Ein Testkonto, das im QA-Durchgang
 * versehentlich freigegeben wurde, steckt in den veröffentlichten Mittelwerten
 * seiner Schule. Wird es einfach gelöscht, ändern sich diese Zahlen ohne
 * Anlass, und niemand weiß hinterher, warum. Deshalb wird es benannt und
 * bleibt liegen.
 */
export function waehleTestkonten<T extends { kontakt_chiffre: Buffer; freigegeben: number; gewinne: number }>(
  konten: readonly T[],
  endung: string,
): Auswahl<T> {
  const gesucht = endung.toLowerCase();
  const auswahl: Auswahl<T> = { zuLoeschen: [], geschuetzt: [] };

  for (const k of konten) {
    const kontakt = entschluesseleWennMoeglich(k.kontakt_chiffre);
    if (kontakt === null || !kontakt.toLowerCase().endsWith(gesucht)) continue;
    if (k.freigegeben > 0 || k.gewinne > 0) auswahl.geschuetzt.push(k);
    else auswahl.zuLoeschen.push(k);
  }

  return auswahl;
}

function angabe(name: string, standard: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const wert = i === -1 ? undefined : process.argv[i + 1];
  return wert !== undefined && !wert.startsWith("--") ? wert : standard;
}

const ENDUNG = angabe("endung", "@beispiel-test.de").toLowerCase();
const KENNUNG = angabe("kennung", "qa-schau");
const WIRKLICH = process.argv.includes("--wirklich");

type Kontozeile = {
  id: string;
  kontakt_chiffre: Buffer;
  erstellt_am: Date;
  bewertungen: number;
  freigegeben: number;
  gewinne: number;
  empfehlungen: number;
  schulen: string[];
};

async function main(): Promise<void> {
  const sql = postgres(process.env["DATABASE_URL"] ?? "", { onnotice: () => {} });

  try {
    // Alle Konten holen und selbst filtern: Die Endung steht im Klartext, und
    // den kennt nur diese Anwendung. Bei der Größenordnung eines Testbestands
    // ist das unkritisch.
    const konten = await sql<Kontozeile[]>`
      select k.id, k.kontakt_chiffre, k.erstellt_am,
             (select count(*) from bewertungen b where b.konto_id = k.id)::int as bewertungen,
             (select count(*) from bewertungen b
               where b.konto_id = k.id and b.status = 'freigegeben')::int as freigegeben,
             (select count(*) from verlosungsgewinne g where g.konto_id = k.id)::int as gewinne,
             (select count(*) from empfehlungen e
               where e.werber_konto_id = k.id or e.geworbenes_konto_id = k.id)::int as empfehlungen,
             coalesce((select array_agg(distinct b.schule_id::text)
                       from bewertungen b where b.konto_id = k.id), '{}') as schulen
      from konten k
      where k.kontaktart = 'email'
    `;

    const { zuLoeschen, geschuetzt } = waehleTestkonten(konten, ENDUNG);

    if (zuLoeschen.length === 0 && geschuetzt.length === 0) {
      console.log(`Kein Konto mit der Endung ${ENDUNG} gefunden.`);
    }

    for (const k of zuLoeschen) {
      console.log(
        `  ${k.id}  ${k.erstellt_am.toISOString().slice(0, 10)}  ` +
          `${k.bewertungen} Bewertung(en), ${k.empfehlungen} Empfehlung(en)`,
      );
    }
    console.log(`${zuLoeschen.length} Konto/Konten mit der Endung ${ENDUNG} zum Entfernen.`);

    for (const k of geschuetzt) {
      console.log(
        `  BLEIBT STEHEN: ${k.id} - ${k.freigegeben} freigegebene Bewertung(en), ` +
          `${k.gewinne} Gewinn(e). Von Hand entscheiden.`,
      );
    }

    const moderator = await sql<{ id: string; aktiv: boolean; name: string }[]>`
      select id, aktiv, name from moderatoren where lower(kennung) = ${KENNUNG.toLowerCase()}
    `;
    const m = moderator[0];
    if (m === undefined) {
      console.log(`Kein Moderatorenkonto „${KENNUNG}“ vorhanden.`);
    } else if (!m.aktiv) {
      console.log(`Moderatorenkonto „${KENNUNG}“ ist bereits stillgelegt.`);
    } else {
      console.log(`Moderatorenkonto „${KENNUNG}“ (${m.name}) wird stillgelegt.`);
    }

    if (!WIRKLICH) {
      console.log("\nProbelauf - nichts geändert. Mit --wirklich ausführen.");
      return;
    }

    const schulen = [...new Set(zuLoeschen.flatMap((k) => k.schulen))];

    await sql.begin(async (tx) => {
      if (zuLoeschen.length > 0) {
        // Bewertungen, Versionen, Token, Sitzungen, Empfehlungen und Lose
        // hängen mit `on delete cascade` daran und gehen mit.
        await tx`delete from konten where id in ${tx(zuLoeschen.map((k) => k.id))}`;
      }
      if (m !== undefined && m.aktiv) {
        await tx`update moderatoren set aktiv = false where id = ${m.id}`;
        await tx`
          update moderator_sitzungen set beendet_am = now()
          where moderator_id = ${m.id} and beendet_am is null
        `;
      }
      // Die Aggregate zählen nur freigegebene Bewertungen, und freigegebene
      // waren hier keine dabei. Trotzdem neu rechnen: Der Lauf ist billig, und
      // ein Aggregat, das auf einer Bewertung steht, die es nicht mehr gibt,
      // fiele erst Wochen später auf.
      await aktualisiereAggregate(schulen, tx);
    });

    console.log(
      `\nErledigt: ${zuLoeschen.length} Konto/Konten entfernt, ` +
        `${schulen.length} Schulaggregat(e) neu gerechnet.`,
    );
  } finally {
    await sql.end();
  }
}

// Nur beim direkten Aufruf laufen: Der Test importiert `waehleTestkonten` aus
// dieser Datei, und ein Import darf keine Datenbankverbindung aufbauen.
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
