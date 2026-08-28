/**
 * Zieht die monatliche Verlosung.
 *
 * Aufruf:
 *   npx tsx scripts/verlosung-ziehen.ts            # der abgelaufene Monat
 *   npx tsx scripts/verlosung-ziehen.ts 2026 7     # ein bestimmter Monat
 *   npx tsx scripts/verlosung-ziehen.ts --pruefen 2026 7
 *
 * Gezogen wird für einen **abgeschlossenen** Monat. Während der Monat läuft,
 * kämen laufend Lose hinzu, und eine Ziehung mitten im Zeitraum wäre nicht
 * nachvollziehbar.
 */

import { sql } from "../src/db/verbindung";
import { letzterMonat, monatsname } from "../src/domain/verlosung";
import { gewinnerkontakt, holeZiehung, pruefeGespeicherteZiehung, teilnahmen, ziehen } from "../src/db/verlosung";
import { baueLose } from "../src/domain/verlosung";

const argumente = process.argv.slice(2);
const pruefen = argumente.includes("--pruefen");
const zahlen = argumente.filter((a) => /^\d+$/.test(a)).map(Number);

const vormonat = letzterMonat();
const jahr = zahlen[0] ?? vormonat.jahr;
const monat = zahlen[1] ?? vormonat.monat;

try {
  if (pruefen) {
    const ergebnis = await pruefeGespeicherteZiehung(jahr, monat);
    if (ergebnis === null) {
      console.log(`Für ${monatsname(jahr, monat)} gibt es keine Ziehung.`);
    } else {
      const z = (await holeZiehung(jahr, monat))!;
      console.log(`${monatsname(jahr, monat)}: ${z.lose_gesamt} Lose, Zufallswert ${z.zufallswert}`);
      console.log(ergebnis ? "Die Ziehung rechnet sich nach." : "ACHTUNG: Die Ziehung rechnet sich NICHT nach.");
    }
  } else {
    const vorschau = baueLose(await teilnahmen(jahr, monat));
    console.log(`${monatsname(jahr, monat)}: ${vorschau.length} teilnehmende Konten.`);

    const ergebnis = await ziehen(jahr, monat);
    if (!ergebnis.ok) {
      console.log(
        ergebnis.grund === "schon_gezogen"
          ? "Für diesen Monat wurde bereits gezogen. Eine zweite Ziehung gibt es nicht."
          : "Keine Lose vorhanden.",
      );
    } else if (ergebnis.ziehung.gewinner_konto_id === null) {
      console.log("Keine Teilnahmen - es wurde nichts gezogen, der Monat ist aber vermerkt.");
    } else {
      const kontakt = await gewinnerkontakt(ergebnis.ziehung.id);
      console.log(`Gezogen: Los ${ergebnis.ziehung.gewinner_index! + 1} von ${ergebnis.ziehung.lose_gesamt}`);
      console.log(`Kontakt: ${kontakt?.verschleiert ?? "unbekannt"} (${kontakt?.art ?? "-"})`);
      console.log(`Zufallswert: ${ergebnis.ziehung.zufallswert}`);
      console.log("\nDie Benachrichtigung geht heraus, sobald ein Versandweg eingerichtet ist.");
    }
  }
} finally {
  await sql.end();
}
