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
import {
  VERLOSUNG_LABEL,
  istVerlosungsart,
  letzterMonat,
  monatsname,
} from "../src/domain/verlosung";
import {
  gewinner,
  gewinnerkontakt,
  holeZiehung,
  pruefeGespeicherteZiehung,
  teilnahmen,
  ziehen,
} from "../src/db/verlosung";
import { baueLose } from "../src/domain/verlosung";

const argumente = process.argv.slice(2);
const pruefen = argumente.includes("--pruefen");
const zahlen = argumente.filter((a) => /^\d+$/.test(a)).map(Number);
const rohArt = argumente.find((a) => a.startsWith("--art="))?.slice(6) ?? "normal";
if (!istVerlosungsart(rohArt)) {
  console.error(`Unbekannte Ziehung: ${rohArt}. Möglich sind normal, super, mega.`);
  process.exitCode = 1;
  throw new Error("Ziehungsart unbekannt");
}
const art = rohArt;

const vormonat = letzterMonat();
const jahr = zahlen[0] ?? vormonat.jahr;
const monat = zahlen[1] ?? vormonat.monat;

try {
  if (pruefen) {
    const ergebnis = await pruefeGespeicherteZiehung(jahr, monat, art);
    if (ergebnis === null) {
      console.log(`Für ${monatsname(jahr, monat)} gibt es keine ${VERLOSUNG_LABEL[art]}.`);
    } else {
      const z = (await holeZiehung(jahr, monat, art))!;
      console.log(
        `${VERLOSUNG_LABEL[art]} ${monatsname(jahr, monat)}: ${z.lose_gesamt} Lose, Zufallswert ${z.zufallswert}`,
      );
      console.log(
        ergebnis === "stimmt"
          ? "Die Ziehung rechnet sich nach."
          : ergebnis === "unvollstaendig"
            ? "Teilweise nachgerechnet: Zu einzelnen Plätzen fehlt die Kennung (gelöschtes Konto oder Altziehung). Was prüfbar war, stimmt."
            : "ACHTUNG: Die Ziehung rechnet sich NICHT nach.",
      );
    }
  } else {
    const vorschau = baueLose(await teilnahmen(jahr, monat, art));
    console.log(
      `${VERLOSUNG_LABEL[art]} ${monatsname(jahr, monat)}: ${vorschau.length} teilnehmende Konten.`,
    );

    const ergebnis = await ziehen(jahr, monat, null, art);
    if (!ergebnis.ok) {
      console.log(
        ergebnis.grund === "schon_gezogen"
          ? "Für diesen Monat wurde bereits gezogen. Eine zweite Ziehung gibt es nicht."
          : "Keine Lose vorhanden.",
      );
    } else {
      // Die Gewinner einzeln: Es sind bis zu 50, und die Kennung, die den
      // Kontakt aufschließt, ist die des **Gewinns**, nicht die der Ziehung.
      const gezogene = await gewinner(ergebnis.ziehung.id);
      if (gezogene.length === 0) {
        console.log("Keine Teilnahmen - es wurde nichts gezogen, der Monat ist aber vermerkt.");
      } else {
        console.log(`Gezogen: ${gezogene.length} von ${ergebnis.ziehung.lose_gesamt} Losen`);
        for (const g of gezogene) {
          const kontakt = await gewinnerkontakt(g.id, null);
          console.log(`  ${g.platz}. ${kontakt?.verschleiert ?? "unbekannt"} (${kontakt?.art ?? "-"})`);
        }
        console.log(`Zufallswert: ${ergebnis.ziehung.zufallswert}`);
        console.log("\nDie Benachrichtigung geht heraus, sobald ein Versandweg eingerichtet ist.");
      }
    }
  }
} finally {
  await sql.end();
}
