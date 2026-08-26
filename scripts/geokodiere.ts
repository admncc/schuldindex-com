/**
 * Holt die fehlenden Koordinaten nach.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/geokodiere.ts [--anzahl 500] [--pro-sekunde 2]
 *
 * Der Lauf ist **wiederaufnehmbar**: er holt sich jedes Mal die Schulen ohne
 * Koordinate aus der Datenbank und schreibt jedes Ergebnis sofort zurück. Ein
 * Abbruch kostet höchstens die laufende Anfrage. Zusätzlich hält ein
 * Zwischenspeicher gleiche Anfragen innerhalb eines Laufs zusammen.
 */
import postgres from "postgres";
import { geokodiere, type Genauigkeit } from "../src/import/geokodierung.js";
import { PhotonGeocoder, mitZwischenspeicher } from "../src/import/photon.js";
import type { Bundesland } from "../src/domain/bundesland.js";

interface OffeneSchule {
  id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  bundesland: Bundesland;
}

function argument(name: string, standard: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return standard;
  const wert = Number(process.argv[i + 1]);
  return Number.isFinite(wert) ? wert : standard;
}

const anzahl = argument("anzahl", Number.POSITIVE_INFINITY);
const proSekunde = argument("pro-sekunde", 2);

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const photon = new PhotonGeocoder({ proSekunde });
const geocoder = mitZwischenspeicher(photon, new Map());

const zaehler: Record<Genauigkeit, number> = { adresse: 0, plz: 0, ort: 0, keine: 0 };
const verworfen = new Map<string, number>();
let bearbeitet = 0;

const beginn = Date.now();
const STAPEL = 200;

try {
  while (bearbeitet < anzahl) {
    const offen = await sql<OffeneSchule[]>`
      select id, name, strasse, plz, ort, bundesland
      from schulen
      where lat is null and ist_aktiv
      order by bundesland, id
      limit ${Math.min(STAPEL, anzahl - bearbeitet)}
    `;
    if (offen.length === 0) break;

    for (const schule of offen) {
      const ergebnis = await geokodiere(
        {
          name: schule.name,
          strasse: schule.strasse,
          plz: schule.plz,
          ort: schule.ort,
          bundesland: schule.bundesland,
        },
        geocoder,
      );
      zaehler[ergebnis.genauigkeit]++;
      bearbeitet++;

      if (ergebnis.koordinate) {
        await sql`
          update schulen
          set lat = ${ergebnis.koordinate.lat},
              lon = ${ergebnis.koordinate.lon},
              genauigkeit = ${ergebnis.genauigkeit},
              aktualisiert_am = now()
          where id = ${schule.id}
        `;
      } else {
        if (ergebnis.verworfenWeil) {
          verworfen.set(ergebnis.verworfenWeil, (verworfen.get(ergebnis.verworfenWeil) ?? 0) + 1);
        }
        // Ohne Merkmal bliebe die Schule in jedem Folgelauf wieder vorn. Sie
        // wird nicht deaktiviert — sie ist eine echte Schule, nur ohne Punkt
        // auf der Karte. Ein späterer Lauf mit besserer Quelle greift sie erneut auf.
        await sql`update schulen set aktualisiert_am = now() where id = ${schule.id}`;
      }

      if (bearbeitet % 100 === 0) {
        const proMinute = bearbeitet / ((Date.now() - beginn) / 60000);
        console.error(
          `  ${bearbeitet} bearbeitet · ${proMinute.toFixed(0)}/min · ` +
            `Adresse ${zaehler.adresse} · PLZ ${zaehler.plz} · Ort ${zaehler.ort} · ohne ${zaehler.keine}`,
        );
      }
    }
  }

  const dauer = (Date.now() - beginn) / 1000;
  console.error(`\n  bearbeitet         ${bearbeitet} in ${dauer.toFixed(0)} s`);
  console.error(`  auf Adresse genau  ${zaehler.adresse}`);
  console.error(`  auf PLZ genau      ${zaehler.plz}`);
  console.error(`  nur Ort            ${zaehler.ort}`);
  console.error(`  ohne Ergebnis      ${zaehler.keine}`);
  console.error(`  Anfragen an Photon ${photon.anfragen} (${photon.fehler} Fehler)`);
  for (const [grund, n] of verworfen) console.error(`  verworfen: ${grund}: ${n}`);
} finally {
  await sql.end();
}
