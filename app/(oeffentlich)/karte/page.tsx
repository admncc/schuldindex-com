import type { Metadata } from "next";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland, type Bundesland } from "@/domain/bundesland";
import { ausschnittFuer, bildfeld } from "@/domain/karte";
import { bewerteteSchulen, kartenzahlen } from "@/db/karte";
import { Kartenansicht } from "./ansicht";
import { einer } from "@/domain/suchparameter";
import { kachelarchivVorhanden } from "@/kartendaten";

export const metadata: Metadata = {
  title: "Karte",
  description: "Alle Schulen in Deutschland auf einer Karte - mit den bewerteten hervorgehoben.",
};
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");

/** Bildbreite in Nutzereinheiten. Die Darstellung skaliert über das viewBox. */
const BREITE = 800;

export default async function Kartenseite({
  searchParams,
}: {
  searchParams: Promise<{ bundesland?: string | string[] }>;
}) {
  const p = await searchParams;
  const roh = einer(p.bundesland);
  const bundesland: Bundesland | null = roh !== undefined && istBundesland(roh) ? roh : null;

  const ausschnitt = ausschnittFuer(bundesland);
  const feld = bildfeld(ausschnitt, BREITE);

  const [bewertet, zahlen, mitKacheln] = await Promise.all([
    bewerteteSchulen(ausschnitt, undefined, bundesland),
    kartenzahlen(ausschnitt, bundesland),
    kachelarchivVorhanden(),
  ]);

  const bestandsbild = `/karte/bestand.svg${bundesland ? `?bundesland=${bundesland}` : ""}`;

  return (
    <>
      <section className="abschnitt">
        <h1>Karte</h1>
        <p className="einleitung">
          {mitKacheln
            ? "Jeder Punkt ist eine Schule mit veröffentlichter Wertung - antippen zeigt sie an. Ziehen verschiebt, Scrollen zoomt."
            : "Jeder Punkt ist eine Schule. Farbige Punkte haben eine veröffentlichte Wertung - antippen zeigt sie an. Ziehen verschiebt, Scrollen zoomt."}
        </p>

        {/* Karte und Liste kommen vom Server und stehen auch ohne JavaScript
            da - die sieben Bedienelemente darüber taten aber nichts, und der
            Satz oben versprach weiter, dass Antippen und Ziehen funktionieren.
            Der Bundeslandwähler daneben ist ein echtes GET-Formular. */}
        <noscript>
          <p className="fehlerkasten">
            Ohne JavaScript siehst du die Karte und die Liste, kannst aber nicht zoomen, ziehen
            oder eine Schule antippen. Der Bundeslandwähler funktioniert; für alles Weitere ist{" "}
            <a href="/schulen">die Schulsuche</a> der bessere Weg.
          </p>
        </noscript>

        <form className="filter" method="get">
          <label htmlFor="bundesland" className="versteckt">Bundesland</label>
          <select id="bundesland" name="bundesland" defaultValue={bundesland ?? ""}>
            <option value="">Ganz Deutschland</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>
          <button className="knopf zweitrangig">Anzeigen</button>
          {bundesland ? <a className="zuruecksetzen" href="/karte">Ganz Deutschland</a> : null}
        </form>
      </section>

      <section className="abschnitt">
        <Kartenansicht
          schulen={bewertet}
          ausschnitt={ausschnitt}
          feld={feld}
          bestandsbild={bestandsbild}
          bestandszahl={zahlen.imAusschnitt}
          mitKacheln={mitKacheln}
        />

        {/* Zwei Karten, zwei wahre Sätze. Auf der Kartenkarte stehen nur die
            bewerteten Schulen als Punkte - der Bestand steckt im Hintergrund
            und ist nicht einzeln gezeichnet. Den alten Satz stehen zu lassen
            hiesse, „31.770 Schulen dargestellt“ unter eine Karte zu schreiben,
            auf der 34 Punkte liegen. */}
        <p className="bestandshinweis">
          {mitKacheln ? (
            <>
              {bewertet.length > 0
                ? `${ZAHL.format(bewertet.length)} Schulen mit veröffentlichter Wertung`
                : "Noch keine Schule mit veröffentlichter Wertung in diesem Ausschnitt"}
              {` · ${ZAHL.format(zahlen.gesamt)} Schulen im Bestand`}
            </>
          ) : (
            <>
              {ZAHL.format(zahlen.imAusschnitt)} Schulen dargestellt
              {zahlen.ohneKoordinate > 0
                ? ` · ${ZAHL.format(zahlen.ohneKoordinate)} ohne Koordinate und daher nicht auf der Karte`
                : ""}
              {bewertet.length > 0
                ? ` · ${ZAHL.format(bewertet.length)} mit veröffentlichter Wertung`
                : " · noch keine Schule mit veröffentlichter Wertung in diesem Ausschnitt"}
            </>
          )}
        </p>

        <ul className="legende">
          {mitKacheln ? null : (
            <li><span className="punkt bestand" /> Schule ohne veröffentlichte Wertung</li>
          )}
          <li><span className="punkt gut" /> gut bewertet</li>
          <li><span className="punkt mittel" /> durchschnittlich</li>
          <li><span className="punkt schlecht" /> unterdurchschnittlich</li>
        </ul>

        <p className="fussnote">
          Die Karte lädt nichts von fremden Servern - weder Kacheln noch Schriften noch
          Zählpixel. {mitKacheln
            ? "Der Kartenhintergrund liegt auf unserem eigenen Server."
            : "Gezeichnet wird aus unserem eigenen Schulbestand."}{" "}
          Deshalb braucht diese Seite auch kein Einwilligungsbanner.
        </p>
      </section>
    </>
  );
}
