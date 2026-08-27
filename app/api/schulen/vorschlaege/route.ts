import { NextResponse } from "next/server";
import { vorschlaege } from "@/db/vorschlaege";

/**
 * Vorschläge für die Suche, während getippt wird.
 *
 * Öffentlich und ohne Anmeldung — der Schulbestand ist öffentlich. Trotzdem
 * zwei Vorkehrungen, weil die Adresse bei jedem Tastendruck aufgerufen wird:
 *
 *  - **Zu kurze Eingaben werden gar nicht erst angefragt.** Unter zwei Zeichen
 *    passt fast jede Schule, die Antwort wäre wertlos und die Abfrage teuer.
 *  - **Die Eingabe wird gekappt.** Ein 10.000 Zeichen langer Suchbegriff ist
 *    keine Suche, sondern ein Versuch, die Datenbank zu beschäftigen.
 *
 * Zwischengespeichert wird die Antwort für eine Minute. Der Schulbestand ändert
 * sich beim Import, nicht im Minutentakt; eine Minute nimmt der Datenbank die
 * Last der immer gleichen Anfragen ab, ohne dass jemand veraltete Namen sieht.
 */

const HOECHSTLAENGE = 80;

export async function GET(anfrage: Request): Promise<NextResponse> {
  const eingabe = (new URL(anfrage.url).searchParams.get("q") ?? "").slice(0, HOECHSTLAENGE);

  if (eingabe.trim().length < 2) {
    return NextResponse.json({ vorschlaege: [] });
  }

  try {
    return NextResponse.json(
      { vorschlaege: await vorschlaege(eingabe) },
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (fehler) {
    // Ein Fehler hier darf die Suche nicht blockieren: Das Formular funktioniert
    // ohne Vorschläge weiter, deshalb eine leere Liste statt eines Fehlercodes.
    console.error("Vorschläge konnten nicht geladen werden:", fehler);
    return NextResponse.json({ vorschlaege: [] }, { status: 200 });
  }
}
