/**
 * Holt die fehlenden Koordinaten nach.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/geokodiere.ts \
 *     [--anzahl 500] [--pro-sekunde 4] [--gleichzeitig 4] [--erneut-nach 30]
 *
 * Der Lauf ist **wiederaufnehmbar**: er holt sich jedes Mal die Schulen ohne
 * Koordinate aus der Datenbank und schreibt jedes Ergebnis sofort zurück. Ein
 * Abbruch kostet höchstens die laufenden Anfragen.
 *
 * **Jeder Versuch wird vermerkt, auch der erfolglose.** Ohne diesen Vermerk
 * endet der Lauf nie: er fände beim nächsten Durchgang genau die Schulen
 * wieder, an denen er eben gescheitert ist. Nach `--erneut-nach` Tagen werden
 * auch erfolglose Schulen wieder aufgegriffen - OpenStreetMap wächst, und was
 * heute nicht auffindbar ist, kann es in einem Monat sein. Zusätzlich hält ein
 * Zwischenspeicher gleiche Anfragen innerhalb eines Laufs zusammen.
 *
 * **Zur Nebenläufigkeit:** Der Durchsatz hängt nicht am eigenen Takt, sondern
 * an Photons Antwortzeit - nacheinander kommt man auf rund 27 Schulen je
 * Minute, was für 6.200 Schulen über drei Stunden bedeutet. Mehrere Anfragen
 * gleichzeitig lösen das; der Takt begrenzt weiterhin die Gesamtlast auf den
 * fremden Dienst.
 */
import postgres from "postgres";
import { geokodiere, type Genauigkeit } from "../src/import/geokodierung";
import { PhotonGeocoder, mitZwischenspeicher } from "../src/import/photon";
import type { Bundesland } from "../src/domain/bundesland";

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
const proSekunde = argument("pro-sekunde", 4);
const gleichzeitig = Math.max(1, argument("gleichzeitig", 4));
const erneutNachTagen = argument("erneut-nach", 30);

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
        and (geokodierung_versucht_am is null
             or geokodierung_versucht_am < now() - make_interval(days => ${erneutNachTagen}))
      order by geokodierung_versucht_am nulls first, bundesland, id
      limit ${Math.min(STAPEL, anzahl - bearbeitet)}
    `;
    if (offen.length === 0) break;

    // Arbeiter teilen sich die Warteschlange des Stapels. Der Takt im Geocoder
    // begrenzt die Gesamtlast, unabhängig davon, wie viele hier arbeiten.
    let naechster = 0;
    const arbeite = async (): Promise<void> => {
      for (;;) {
        const schule = offen[naechster++];
        if (schule === undefined) return;
        await bearbeiteEine(schule);
      }
    };
    await Promise.all(Array.from({ length: gleichzeitig }, arbeite));
  }

  const dauer = (Date.now() - beginn) / 1000;
  console.error(`\n  bearbeitet         ${bearbeitet} in ${dauer.toFixed(0)} s`);
  console.error(`  auf Adresse genau  ${zaehler.adresse}`);
  console.error(`  auf PLZ genau      ${zaehler.plz}`);
  console.error(`  nur Ort            ${zaehler.ort}`);
  console.error(`  ohne Ergebnis      ${zaehler.keine}`);
  console.error(`  Anfragen an Photon ${photon.anfragen} (${photon.fehler} Fehler)`);
  for (const [grund, n] of verworfen) console.error(`  verworfen: ${grund}: ${n}`);

  async function bearbeiteEine(schule: OffeneSchule): Promise<void> {
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
            geokodierung_versucht_am = now(),
            aktualisiert_am = now()
        where id = ${schule.id}
      `;
    } else {
      if (ergebnis.verworfenWeil) {
        verworfen.set(ergebnis.verworfenWeil, (verworfen.get(ergebnis.verworfenWeil) ?? 0) + 1);
      }
      // Den Versuch vermerken, sonst greift der nächste Durchgang genau diese
      // Schule wieder auf und der Lauf endet nie. Die Schule wird nicht
      // deaktiviert - sie ist echt, nur ohne Punkt auf der Karte.
      await sql`
        update schulen
        set geokodierung_versucht_am = now(), aktualisiert_am = now()
        where id = ${schule.id}
      `;
    }

    if (bearbeitet % 100 === 0) {
      const proMinute = bearbeitet / ((Date.now() - beginn) / 60000);
      console.error(
        `  ${bearbeitet} bearbeitet · ${proMinute.toFixed(0)}/min · ` +
          `Adresse ${zaehler.adresse} · PLZ ${zaehler.plz} · Ort ${zaehler.ort} · ohne ${zaehler.keine}`,
      );
    }
  }
} finally {
  await sql.end();
}
