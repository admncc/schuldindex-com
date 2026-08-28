/**
 * Slugs für Schulprofile - `/schule/gymnasium-am-muehlenweg-hamburg`.
 *
 * Zwei Anforderungen, die einander widersprechen können:
 *
 *  1. **Lesbar und deutsch.** Umlaute werden ausgeschrieben, nicht entfernt:
 *     „Grünewald“ wird zu `gruenewald`, nicht zu `grnewald` oder `grunewald`.
 *  2. **Stabil über Re-Importe hinweg.** Ein Slug steht in URLs, in Suchmaschinen
 *     und in geteilten Links. Er darf sich nicht ändern, nur weil der nächste
 *     Import die Datensätze in anderer Reihenfolge liefert.
 *
 * Die zweite Anforderung schließt das naheliegende Verfahren aus. „Wer zuerst
 * kommt, bekommt die kurze Form“ hängt an der Reihenfolge: bei 33.450 Schulen
 * änderten sich damit 41 % der Slugs, sobald die Quelle anders sortiert liefert.
 *
 * Stattdessen gilt: **ist eine Kurzform mehrdeutig, bekommt sie niemand.**
 * Heißen zwei Schulen „Grundschule Nord“, werden beide zu
 * `grundschule-nord-kiel` und `grundschule-nord-luebeck` - die nackte Form
 * bleibt frei. Das Ergebnis hängt damit nur von der Menge der Schulen ab, nicht
 * von ihrer Reihenfolge, und die längere Form ist ohnehin die aussagekräftigere.
 */

/** Umlaute und ß nach deutscher Konvention, übrige Diakritika über NFD. */
const ERSETZUNGEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/ø/g, "oe"],
  [/å/g, "aa"],
  [/đ|ð/g, "d"],
  [/þ/g, "th"],
];

/**
 * Obergrenzen für die einzelnen Bestandteile - ohne sie entstehen URLs mit
 * 228 Zeichen, denn 5.482 Schulen tragen Namen über 70 Zeichen Länge.
 *
 * Gekürzt wird **vor** dem Zusammensetzen, nie danach. Eine Kürzung am fertigen
 * Slug schnitte die unterscheidende Kennung am Ende ab und hebelte damit genau
 * die Eindeutigkeit aus, die sie sichern soll.
 */
const MAX_NAME = 50;
const MAX_ORT = 28;

/** Kürzt an der Wortgrenze, damit kein halbes Wort stehen bleibt. */
export function kuerze(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const beschnitten = slug.slice(0, max);
  const letzterTrenner = beschnitten.lastIndexOf("-");
  return (letzterTrenner > max * 0.6 ? beschnitten.slice(0, letzterTrenner) : beschnitten).replace(/-+$/, "");
}

export function slugify(text: string): string {
  let s = text.toLowerCase();
  for (const [muster, ersatz] of ERSETZUNGEN) s = s.replace(muster, ersatz);
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // verbleibende Akzente entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Kurzer, stabiler Zusatz aus der Quell-ID - nur bei Namensgleichheit nötig. */
export function kennung(quellId: string): string {
  let hash = 2166136261; // FNV-1a, 32 Bit
  for (let i = 0; i < quellId.length; i++) {
    hash ^= quellId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 4);
}

export interface SlugQuelle {
  readonly name: string;
  readonly ort: string | null;
  readonly plz: string | null;
  readonly quellId: string;
}

/**
 * Erzeugt die Slug-Kandidaten einer Schule, vom kürzesten zum eindeutigsten.
 * Der Aufrufer nimmt den ersten, der noch frei ist.
 *
 * Beispiel für „Grundschule Nordholz“ in Wurster Nordseeküste:
 *   1. `grundschule-nordholz`
 *   2. `grundschule-nordholz-wurster-nordseekueste`
 *   3. `grundschule-nordholz-wurster-nordseekueste-27639`
 *   4. `grundschule-nordholz-wurster-nordseekueste-27639-a3f1`
 *
 * Stufe 4 ist aus der Quell-ID abgeleitet und damit über Importe hinweg stabil.
 */
export function slugKandidaten(quelle: SlugQuelle): string[] {
  const name = kuerze(slugify(quelle.name), MAX_NAME);
  const basis = name === "" ? "schule" : name;
  const kandidaten = [basis];

  const ort = quelle.ort ? kuerze(slugify(quelle.ort), MAX_ORT) : "";
  // Ein Ortszusatz hilft nur, wenn er nicht ohnehin schon im Namen steckt.
  const mitOrt = ort !== "" && !basis.includes(ort) ? `${basis}-${ort}` : basis;
  if (mitOrt !== basis) kandidaten.push(mitOrt);

  const plz = quelle.plz ? slugify(quelle.plz) : "";
  if (plz !== "") kandidaten.push(`${mitOrt}-${plz}`);

  kandidaten.push(`${mitOrt}${plz ? `-${plz}` : ""}-${kennung(quelle.quellId)}`);
  return kandidaten;
}

/**
 * Vergibt Slugs für den gesamten Bestand auf einen Schlag.
 *
 * Zwingend als Stapelverarbeitung: ob eine Kurzform vergeben werden darf, hängt
 * davon ab, ob eine **andere** Schule sie ebenfalls beansprucht. Einzeln und
 * nacheinander ließe sich das nicht reihenfolgeunabhängig entscheiden.
 *
 * Verfahren: Stufe für Stufe der Kandidatenleiter. Auf jeder Stufe bekommen
 * genau die Schulen ihren Slug, die ihn allein beanspruchen. Alle übrigen
 * rücken gemeinsam eine Stufe weiter.
 *
 * @returns Zuordnung Quell-ID → Slug
 */
export function vergebeSlugs(quellen: readonly SlugQuelle[]): Map<string, string> {
  const ergebnis = new Map<string, string>();
  const leitern = new Map<string, string[]>(quellen.map((q) => [q.quellId, slugKandidaten(q)]));
  let offen = quellen.map((q) => q.quellId);
  const belegt = new Set<string>();

  const maxStufen = Math.max(0, ...[...leitern.values()].map((l) => l.length));
  for (let stufe = 0; stufe < maxStufen && offen.length > 0; stufe++) {
    const anwaerter = new Map<string, string[]>();
    for (const id of offen) {
      const kandidat = leitern.get(id)?.[stufe];
      if (kandidat === undefined || belegt.has(kandidat)) continue;
      const liste = anwaerter.get(kandidat) ?? [];
      liste.push(id);
      anwaerter.set(kandidat, liste);
    }

    const vergeben = new Set<string>();
    for (const [kandidat, ids] of anwaerter) {
      // Nur wer allein beansprucht, bekommt. Bei Gleichstand rückt niemand ein.
      if (ids.length !== 1) continue;
      const id = ids[0]!;
      ergebnis.set(id, kandidat);
      belegt.add(kandidat);
      vergeben.add(id);
    }
    offen = offen.filter((id) => !vergeben.has(id));
  }

  // Rest: identische Datensätze, die sich in nichts unterscheiden - auch nicht
  // in der Quell-ID-Kennung. Nach Quell-ID sortiert durchzählen, damit auch
  // dieser Fall bei jedem Lauf gleich ausgeht. Der Zähler wird je Basis
  // mitgeführt, damit das Verfahren nicht quadratisch wird.
  const zaehler = new Map<string, number>();
  for (const id of [...offen].sort()) {
    const basis = leitern.get(id)?.at(-1) ?? "schule";
    let i = zaehler.get(basis) ?? 2;
    while (belegt.has(`${basis}-${i}`)) i++;
    ergebnis.set(id, `${basis}-${i}`);
    belegt.add(`${basis}-${i}`);
    zaehler.set(basis, i + 1);
  }

  return ergebnis;
}