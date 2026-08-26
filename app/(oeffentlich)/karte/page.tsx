import type { Metadata } from "next";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland, type Bundesland } from "@/domain/bundesland";
import { ausschnittFuer, bildfeld, projiziere } from "@/domain/karte";
import { scorestufe } from "@/domain/scoring";
import { bewerteteSchulen, kartenzahlen } from "@/db/karte";

export const metadata: Metadata = {
  title: "Karte",
  description: "Alle Schulen in Deutschland auf einer Karte — mit den bewerteten hervorgehoben.",
};
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Bildbreite in Nutzereinheiten. Die Darstellung skaliert über das viewBox. */
const BREITE = 800;

export default async function Kartenseite({
  searchParams,
}: {
  searchParams: Promise<{ bundesland?: string }>;
}) {
  const p = await searchParams;
  const bundesland: Bundesland | null =
    p.bundesland !== undefined && istBundesland(p.bundesland) ? p.bundesland : null;

  const ausschnitt = ausschnittFuer(bundesland);
  const feld = bildfeld(ausschnitt, BREITE);

  const [bewertet, zahlen] = await Promise.all([
    bewerteteSchulen(ausschnitt),
    kartenzahlen(ausschnitt, bundesland),
  ]);

  const bestandsbild = `/karte/bestand.svg${bundesland ? `?bundesland=${bundesland}` : ""}`;

  return (
    <>
      <section className="abschnitt">
        <h1>Karte</h1>
        <p className="einleitung">
          Jeder Punkt ist eine Schule oder eine Gruppe dicht beieinander liegender Schulen.
          Farbige Punkte sind Schulen mit veröffentlichter Wertung.
        </p>

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
        <div className="karte-rahmen" style={{ aspectRatio: `${feld.breite} / ${feld.hoehe}` }}>
          {/* Zwei Ebenen übereinander: der Bestand als eigene, zwischenspeicherbare
              Datei, darüber die anklickbaren bewerteten Schulen. Beide haben
              denselben Bildausschnitt, deshalb liegen sie deckungsgleich. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="schulkarte bestandsebene"
            src={bestandsbild}
            alt={`Karte mit ${ZAHL.format(zahlen.imAusschnitt)} Schulen${
              bundesland ? ` in ${BUNDESLAND_LABEL[bundesland]}` : " in Deutschland"
            }`}
            width={feld.breite}
            height={feld.hoehe}
          />
          <svg
            viewBox={`0 0 ${feld.breite} ${feld.hoehe}`}
            className="schulkarte bewertungsebene"
            aria-hidden={bewertet.length === 0}
          >
            <g className="bewertet">
              {bewertet.map((s) => {
                const punkt = projiziere(s.lat, s.lon, ausschnitt, feld);
                const score = Number(s.gesamtscore);
                return (
                  <a key={s.slug} href={`/schule/${s.slug}`}>
                    <circle
                      cx={punkt.x.toFixed(1)}
                      cy={punkt.y.toFixed(1)}
                      r={5}
                      className={scorestufe(score)}
                    />
                    {/* Ein <title> im SVG ist der Sprechblasentext — und
                        gleichzeitig das, was Screenreader vorlesen. */}
                    <title>
                      {s.name}
                      {s.ort ? `, ${s.ort}` : ""} — {WERT.format(score)} von 10 aus{" "}
                      {ZAHL.format(s.anzahl)} Bewertungen
                    </title>
                  </a>
                );
              })}
            </g>
          </svg>
        </div>

        <p className="bestandshinweis">
          {ZAHL.format(zahlen.imAusschnitt)} Schulen dargestellt
          {zahlen.ohneKoordinate > 0
            ? ` · ${ZAHL.format(zahlen.ohneKoordinate)} ohne Koordinate und daher nicht auf der Karte`
            : ""}
          {bewertet.length > 0
            ? ` · ${ZAHL.format(bewertet.length)} mit veröffentlichter Wertung`
            : " · noch keine Schule mit veröffentlichter Wertung in diesem Ausschnitt"}
        </p>

        <ul className="legende">
          <li><span className="punkt bestand" /> Schule ohne veröffentlichte Wertung</li>
          <li><span className="punkt gut" /> gut bewertet</li>
          <li><span className="punkt mittel" /> durchschnittlich</li>
          <li><span className="punkt schlecht" /> unterdurchschnittlich</li>
        </ul>

        <p className="fussnote">
          Die Karte lädt nichts von fremden Servern — weder Kacheln noch Schriften. Gezeichnet
          wird aus unserem eigenen Schulbestand.
        </p>
      </section>
    </>
  );
}
