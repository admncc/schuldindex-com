/**
 * Erzeugt die Freitext-Zusammenfassungen der fälligen Schulen.
 *
 * Aufruf:
 *   npx tsx scripts/zusammenfassen.ts [--grenze 20] [--trocken] [--schule <slug>]
 *
 *   --trocken  baut den Auftrag und zeigt ihn, ruft die API aber nicht auf.
 *              Der Weg, um den Prompt anzusehen, ohne Geld auszugeben.
 *   --schule   erzwingt eine einzelne Schule, unabhängig von der Fälligkeit.
 *
 * Läuft als Job, nicht bei jeder Bewertung: eine Zusammenfassung aus 80 Texten
 * ändert sich durch die einundachtzigste nicht (Entwicklungsplan, 10.2).
 */

import { sql } from "../src/db/verbindung";
import {
  faelligeSchulen,
  holeFreitexte,
  speichereErgebnis,
  type FaelligeSchule,
} from "../src/db/zusammenfassungen";
import { claudeModell } from "../src/ki/anthropic";
import { erzeugeZusammenfassung } from "../src/ki/zusammenfassung";
import { baueBlock } from "../src/ki/vorlage";

const argumente = process.argv.slice(2);
const trocken = argumente.includes("--trocken");

function wert(name: string): string | undefined {
  const i = argumente.indexOf(name);
  return i >= 0 ? argumente[i + 1] : undefined;
}

const grenze = Number(wert("--grenze") ?? 20);
const einzelneSchule = wert("--schule");

async function schulen(): Promise<FaelligeSchule[]> {
  if (einzelneSchule === undefined) return faelligeSchulen(new Date(), grenze);

  const zeilen = await sql<FaelligeSchule[]>`
    select s.id, s.name, s.slug,
           coalesce(a.anzahl_mit_freitext, 0) as anzahl_mit_freitext,
           null::timestamptz as zuletzt_am, null::int as zuletzt_aus_anzahl
    from schulen s left join schul_aggregate a on a.schule_id = s.id
    where s.slug = ${einzelneSchule}
  `;
  return zeilen;
}

try {
  const liste = await schulen();
  console.log(`${liste.length} Schule(n) fällig.`);

  const modell = trocken ? null : claudeModell();
  let veroeffentlicht = 0;
  let eskaliert = 0;
  let fehlgeschlagen = 0;

  for (const schule of liste) {
    const texte = await holeFreitexte(schule.id);

    if (trocken) {
      console.log(`\n=== ${schule.name} (${texte.length} Freitexte) ===`);
      console.log(baueBlock(texte).slice(0, 1500));
      continue;
    }

    const ergebnis = await erzeugeZusammenfassung(
      { texte, anzahlBewertungen: schule.anzahl_mit_freitext },
      modell!,
    );
    await speichereErgebnis(schule.id, ergebnis, schule.anzahl_mit_freitext);

    if (ergebnis.status === "veroeffentlicht") {
      veroeffentlicht++;
      console.log(`✓ ${schule.name}: ${ergebnis.text}`);
    } else if (ergebnis.status === "eskaliert") {
      eskaliert++;
      console.log(`! ${schule.name}: ${ergebnis.beanstandungen.map((b) => b.regel).join(", ")}`);
    } else if (ergebnis.status === "fehlgeschlagen") {
      fehlgeschlagen++;
      console.log(`✗ ${schule.name}: ${ergebnis.grund}`);
    } else {
      console.log(`– ${schule.name}: zu wenig Grundlage (${ergebnis.anzahlBewertungen})`);
    }
  }

  if (!trocken) {
    console.log(
      `\nveröffentlicht ${veroeffentlicht} · eskaliert ${eskaliert} · fehlgeschlagen ${fehlgeschlagen}`,
    );
    if (eskaliert > 0) console.log("Eskalierte Zusammenfassungen warten in der Moderation.");
  }
} finally {
  await sql.end();
}
