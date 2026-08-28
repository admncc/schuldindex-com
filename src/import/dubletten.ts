/**
 * Zusammenführung mehrfach gelieferter Schulen.
 *
 * Gemessen am Bestand: **3.570 der 33.600 Schulen** (10,6 %) teilen sich Name
 * und Postleitzahl mit mindestens einer anderen. Für Suchende sieht das aus wie
 * ein kaputtes Portal - „Struensee Gymnasium, 22767 Hamburg“ stand dreimal
 * untereinander.
 *
 * **Zusammengeführt wird bei gleichem Namen und gleicher Postleitzahl.**
 *
 * Der erste Entwurf war vorsichtiger und verlangte zusätzlich dieselbe Adresse
 * oder eine gemeinsame Stamm-ID. Der Blick auf die fertige Trefferliste hat das
 * widerlegt: „Grundschule Tengen, 78250“ stand viermal untereinander - vier
 * Außenstellen derselben Schule in verschiedenen Ortsteilen, jede mit eigener
 * Straße. Nach der vorsichtigen Regel blieben 2.377 Schulen als scheinbare
 * Dubletten stehen.
 *
 * Die Sorge, zwei verschiedene Schulen zu verschmelzen, trägt hier nicht: in
 * Deutschland tragen zwei Schulen derselben Postleitzahl nicht denselben Namen.
 * Sie heißen „Grundschule Nord“ und „Grundschule Süd“, eben weil Post und
 * Verwaltung sie auseinanderhalten müssen.
 *
 * Verloren geht nichts: die weiteren Adressen und Quell-IDs bleiben als
 * Standorte erhalten. Sollte sich ein Fall doch als zwei Schulen erweisen,
 * lässt er sich daraus wieder trennen.
 */

export interface Dublettenkandidat {
  readonly quellId: string;
  readonly name: string;
  readonly plz: string | null;
  readonly strasse: string | null;
  readonly lat: number | null;
  readonly website: string | null;
  readonly telefon: string | null;
  readonly email: string | null;
  readonly traeger: string | null;
}

export interface Standort {
  readonly quellId: string;
  readonly strasse: string;
  readonly lat: number | null;
}

export interface Zusammenfuehrung<T extends Dublettenkandidat> {
  /** Der Datensatz, der bestehen bleibt. */
  readonly haupt: T;
  /** Quell-IDs der aufgegangenen Datensätze - für Nachvollziehbarkeit und Re-Import. */
  readonly aufgegangen: readonly string[];
  /** Weitere Adressen derselben Schule, damit die Zusammenführung umkehrbar bleibt. */
  readonly standorte: readonly Standort[];
}

function schluessel(k: Dublettenkandidat): string {
  return `${k.name.toLowerCase().replace(/\s+/g, " ").trim()}|${k.plz ?? ""}`;
}

/**
 * `HH-5805-2` → `HH-5805`. Ohne Zählsuffix bleibt die ID unverändert.
 *
 * Das Suffix wird nur abgeschnitten, wenn danach **noch ein Bindestrich**
 * übrig bleibt. Sonst würde aus `NI-43424` ein `NI` - und schlagartig gälten
 * alle 3.141 niedersächsischen Schulen als Standorte derselben Einrichtung.
 */
export function stammId(quellId: string): string {
  const gekuerzt = quellId.replace(/-\d+$/, "");
  return gekuerzt.includes("-") ? gekuerzt : quellId;
}

function strasseNormal(strasse: string | null): string {
  return (strasse ?? "").toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
}

/**
 * Wie vollständig ist ein Datensatz? Entscheidet, welcher bestehen bleibt.
 *
 * Die Koordinate wiegt schwerer als alle übrigen Felder **zusammen**. Sie ist
 * das einzige, das sich nicht nachtragen lässt, ohne erneut einen fremden
 * Dienst zu befragen - und dieser kann danebengreifen. Eine Telefonnummer
 * dagegen fehlt eben.
 */
export function vollstaendigkeit(k: Dublettenkandidat): number {
  return (
    (k.lat !== null ? 20 : 0) +
    (k.strasse ? 3 : 0) +
    (k.website ? 2 : 0) +
    (k.traeger ? 1 : 0) +
    (k.telefon ? 1 : 0) +
    (k.email ? 1 : 0)
  );
}

/**
 * Führt zusammen, was sicher zusammengehört.
 *
 * Die Auswahl des bleibenden Datensatzes ist **deterministisch**: erst
 * Vollständigkeit, bei Gleichstand die kleinere Quell-ID. Sonst hinge davon,
 * in welcher Reihenfolge die Quelle liefert, welche Schul-ID und welcher Slug
 * bestehen bleibt - und beim nächsten Import bräche jeder geteilte Link.
 */
export function fuehreZusammen<T extends Dublettenkandidat>(
  kandidaten: readonly T[],
): Zusammenfuehrung<T>[] {
  const gruppen = new Map<string, T[]>();
  for (const k of kandidaten) {
    const s = schluessel(k);
    const liste = gruppen.get(s) ?? [];
    liste.push(k);
    gruppen.set(s, liste);
  }

  const ergebnis: Zusammenfuehrung<T>[] = [];

  for (const gruppe of gruppen.values()) {
    if (gruppe.length === 1) {
      ergebnis.push({ haupt: gruppe[0]!, aufgegangen: [], standorte: [] });
      continue;
    }

    // Vollständigster Datensatz bleibt bestehen; bei Gleichstand entscheidet die
    // Quell-ID, damit die Auswahl nicht von der Lieferreihenfolge abhängt und
    // Slug und URL über Importe hinweg gleich bleiben.
    const sortiert = [...gruppe].sort(
      (a, b) => vollstaendigkeit(b) - vollstaendigkeit(a) || a.quellId.localeCompare(b.quellId),
    );
    const haupt = sortiert[0]!;
    ergebnis.push({
      haupt,
      aufgegangen: sortiert.slice(1).map((k) => k.quellId),
      standorte: sortiert
        .slice(1)
        .filter((k) => k.strasse !== null && k.strasse !== haupt.strasse)
        .map((k) => ({ quellId: k.quellId, strasse: k.strasse!, lat: k.lat })),
    });
  }

  return ergebnis;
}
