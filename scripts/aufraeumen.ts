/**
 * Zeigt, was nach den Aufbewahrungsfristen fällig wäre.
 *
 * Aufruf:
 *   npx tsx scripts/aufraeumen.ts              # zählt nur
 *   npx tsx scripts/aufraeumen.ts --loeschen   # löscht wirklich
 *   npx tsx scripts/aufraeumen.ts --verlauf    # bisherige Läufe
 *
 * **Keine automatische Löschung** (Vorgabe vom 27.08.2026): Dieses Skript
 * gehört nicht in einen Zeitplan. Ohne `--loeschen` zählt es nur, und der
 * übliche Weg ist ohnehin die Moderationsoberfläche, wo jede Frist einzeln
 * ausgelöst und protokolliert wird.
 */

import { sql } from "../src/db/verbindung";
import { raeumeAuf, letzteLaeufe } from "../src/db/aufraeumen";
import { fristtext, laufbericht, regel } from "../src/domain/aufbewahrung";

const trocken = !process.argv.includes("--loeschen");

try {
  if (process.argv.includes("--verlauf")) {
    for (const lauf of await letzteLaeufe()) {
      const wann = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" })
        .format(lauf.gelaufen_am);
      console.log(`${wann}${lauf.trocken ? " (trocken)" : ""}: ${laufbericht(lauf.bilanz)} · ${lauf.dauer_ms} ms`);
    }
  } else {
    const ergebnis = await raeumeAuf(trocken);

    console.log(
      trocken
        ? "Nur gezählt - es wurde nichts gelöscht. Zum Löschen: --loeschen\n"
        : "Es wurde gelöscht.\n",
    );
    for (const b of ergebnis.bilanzen) {
      const r = regel(b.art);
      const zahl = b.betroffen.toLocaleString("de-DE").padStart(7);
      console.log(`${zahl}  ${r.gegenstand} (nach ${fristtext(r.tage)} ab ${r.ab})`);
    }
    console.log(`\n${laufbericht(ergebnis.bilanzen)} · ${ergebnis.dauerMs} ms`);
  }
} finally {
  await sql.end();
}
