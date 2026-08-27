/**
 * Setzt die Aufbewahrungsfristen um (Datenschutzerklärung, Abschnitt 6).
 *
 * Aufruf:
 *   npx tsx scripts/aufraeumen.ts --trocken    # zählt nur
 *   npx tsx scripts/aufraeumen.ts              # löscht
 *
 * Gedacht als täglicher Lauf. Der trockene Lauf gehört vor die erste
 * Ausführung in der Produktion: Was hier gelöscht wird, ist weg.
 */

import { sql } from "../src/db/verbindung";
import { raeumeAuf, letzteLaeufe } from "../src/db/aufraeumen";
import { fristtext, laufbericht, regel } from "../src/domain/aufbewahrung";

const trocken = process.argv.includes("--trocken");

try {
  if (process.argv.includes("--verlauf")) {
    for (const lauf of await letzteLaeufe()) {
      const wann = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" })
        .format(lauf.gelaufen_am);
      console.log(`${wann}${lauf.trocken ? " (trocken)" : ""}: ${laufbericht(lauf.bilanz)} · ${lauf.dauer_ms} ms`);
    }
  } else {
    const ergebnis = await raeumeAuf(trocken);

    console.log(trocken ? "Trockenlauf — es wurde nichts gelöscht.\n" : "Aufräumlauf\n");
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
