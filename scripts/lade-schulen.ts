/**
 * Lädt den Schulbestand von jedeschule.codefor.de.
 *
 *   npx tsx scripts/lade-schulen.ts > schulen.json
 *
 * **Nicht über `skip` blättern.** Die API nimmt den Parameter an, liefert bei
 * Folgeseiten aber Datensätze erneut, die schon auf der ersten Seite standen.
 * Ein Lauf mit `limit=2000` und aufsteigendem `skip` ergab 34.094 Datensätze mit
 * nur 21.486 verschiedenen IDs — rund 12.600 Schulen fehlten, ohne dass die
 * Gesamtzahl es verraten hätte. Jedes Bundesland mit über 1.000 Schulen endete
 * bei genau 1.000 verschiedenen.
 *
 * Stattdessen: **eine Abfrage je Bundesland, ohne Offset**, mit einem Limit über
 * der Landeszahl. Das Ergebnis wird gegen `/stats` geprüft — weicht ein Land ab,
 * bricht der Lauf ab, statt einen unvollständigen Bestand weiterzureichen.
 */

import { BUNDESLAENDER, type Bundesland } from "../src/domain/bundesland";

const BASIS = "https://jedeschule.codefor.de";
const LIMIT = 20_000; // über der größten Landeszahl (Baden-Württemberg, 6.068)

interface Statistik {
  state: Bundesland;
  count: number;
  last_updated: string;
}

async function hole<T>(pfad: string, versuche = 4): Promise<T> {
  for (let versuch = 1; ; versuch++) {
    try {
      const antwort = await fetch(`${BASIS}${pfad}`, {
        headers: { "user-agent": "schulindex-import/0.1 (kontakt@schulindex.com)" },
      });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status} bei ${pfad}`);
      return (await antwort.json()) as T;
    } catch (fehler) {
      if (versuch >= versuche) throw fehler;
      await new Promise((f) => setTimeout(f, 2 ** versuch * 1000));
    }
  }
}

export async function ladeAlleSchulen(protokoll: (zeile: string) => void = () => {}): Promise<unknown[]> {
  const statistik = await hole<Statistik[]>("/stats");
  const soll = new Map(statistik.map((s) => [s.state, s.count]));

  const schulen = new Map<string, unknown>();
  const abweichungen: string[] = [];

  for (const land of BUNDESLAENDER) {
    const teil = await hole<{ id: string }[]>(`/schools/?state=${land}&limit=${LIMIT}`);
    const ids = new Set(teil.map((s) => s.id));
    const erwartet = soll.get(land);

    if (erwartet !== undefined && erwartet !== ids.size) {
      abweichungen.push(`${land}: ${ids.size} statt ${erwartet}`);
    }
    protokoll(`  ${land}: ${ids.size} Schulen`);
    for (const s of teil) schulen.set(s.id, s);
  }

  if (abweichungen.length > 0) {
    throw new Error(
      `Bestand unvollständig — ${abweichungen.join(", ")}. ` +
        "Lieber abbrechen als mit Lücken weiterarbeiten.",
    );
  }
  protokoll(`  gesamt: ${schulen.size} Schulen`);
  return [...schulen.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const schulen = await ladeAlleSchulen((z) => console.error(z));
  console.log(JSON.stringify(schulen));
}
