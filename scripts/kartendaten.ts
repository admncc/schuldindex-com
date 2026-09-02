/**
 * Holt die Schriftbilder für die Karte.
 *
 *   npx tsx scripts/kartendaten.ts
 *
 * MapLibre zeichnet Beschriftungen nicht aus einer Schriftdatei, sondern aus
 * vorgerechneten Zeichenbildern, je 256 Zeichen eine Datei. Sie liegen bei uns
 * und nicht bei einem Kartendienst - aus demselben Grund, aus dem die Kacheln
 * bei uns liegen: Ein Abruf bei einem Dritten überträgt die IP-Adresse der
 * Betrachterin dorthin, und der Nutzerkreis dieses Portals ist überwiegend
 * minderjährig (LG München I, 3 O 17493/20 zu Google-Schriften).
 *
 * **Was dieses Skript nicht holt, ist das Kachelarchiv.** Das sind einige
 * Gigabyte, dafür gibt es ein eigenes Werkzeug, und der Weg steht in
 * `docs/betrieb.md`. Beides in ein Skript zu packen hiesse, einen
 * Stundenlauf hinter einen Minutenlauf zu hängen.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { ARCHIVNAME, kartenverzeichnis } from "../src/kartendaten";

/** Genau die Schnitte, die der Stil anfordert. Ein vierter wäre toter Ballast. */
const SCHNITTE = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];

/**
 * Die Zeichenbereiche 0 bis 2047.
 *
 * Das deckt Latein, die lateinischen Erweiterungen, Griechisch und Kyrillisch
 * ab - alles, was in deutschen Orts-, Fluss- und Strassennamen vorkommt, samt
 * der Umschriften, die OpenStreetMap mitführt. Der vollständige Satz wären 256
 * Bereiche je Schnitt; für eine Karte von Deutschland wäre das Platz für
 * Zeichen, die nie angefordert werden.
 */
const BEREICHE = 8;

const QUELLE = "https://protomaps.github.io/basemaps-assets/fonts";

async function main(): Promise<void> {
  const ziel = join(kartenverzeichnis(), "schriften");
  let geholt = 0;

  for (const schnitt of SCHNITTE) {
    const ordner = join(ziel, schnitt);
    await mkdir(ordner, { recursive: true });

    for (let i = 0; i < BEREICHE; i++) {
      const name = `${i * 256}-${i * 256 + 255}.pbf`;
      const antwort = await fetch(`${QUELLE}/${encodeURIComponent(schnitt)}/${name}`);
      if (!antwort.ok) {
        // Nicht abbrechen: Ein fehlender oberer Bereich kostet ein paar
        // Sonderzeichen, ein Abbruch kostet die ganze Beschriftung.
        console.warn(`  ${schnitt}/${name}: ${antwort.status} - übersprungen`);
        continue;
      }
      await writeFile(join(ordner, name), Buffer.from(await antwort.arrayBuffer()));
      geholt++;
    }
    console.log(`${schnitt}: fertig`);
  }

  console.log(`\n${geholt} Zeichenbilddateien unter ${ziel}`);

  try {
    await access(join(kartenverzeichnis(), ARCHIVNAME));
    console.log("Kachelarchiv liegt bereits - die Karte ist vollständig.");
  } catch {
    console.log(
      `\nEs fehlt noch das Kachelarchiv (${ARCHIVNAME}). Ohne es zeigt die Karte\n` +
        "weiter ihre hintergrundlose Darstellung - kaputt ist nichts. Der Weg dorthin\n" +
        "steht in docs/betrieb.md, Abschnitt „Karte“.",
    );
  }
}

void main();
