import type { Metadata } from "next";
import { MINDESTZAHL_RANGLISTE } from "@/domain/aggregation";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland, type Bundesland } from "@/domain/bundesland";
import { SCHULART_LABEL, type Schulart } from "@/import/schulart";
import { rangliste, ranglistenlage, trendZu, type Ranglisteneintrag } from "@/db/ranglisten";
import { Wertungsplakette, Wertungszahl } from "../teile";

export const metadata: Metadata = {
  title: "Ranglisten",
  description:
    "Die am besten bewerteten Schulen und die mit dem höchsten Verbesserungsbedarf - nach Bundesland und Schulart.",
};
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");
const VERAENDERUNG = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

function istSchulart(wert: string): wert is Schulart {
  return wert in SCHULART_LABEL;
}

export default async function Ranglistenseite({
  searchParams,
}: {
  searchParams: Promise<{ bundesland?: string; schulart?: string }>;
}) {
  const p = await searchParams;
  const bundesland: Bundesland | undefined =
    p.bundesland !== undefined && istBundesland(p.bundesland) ? p.bundesland : undefined;
  const schulart: Schulart | undefined =
    p.schulart !== undefined && istSchulart(p.schulart) ? p.schulart : undefined;

  const lage = await ranglistenlage(bundesland, schulart);

  /**
   * Wie lang die beiden Listen sein dürfen.
   *
   * Höchstens die Hälfte der Schulen je Liste - sonst stehen dieselben Schulen
   * in beiden, und „Höchster Verbesserungsbedarf“ endet mit der bestbewerteten
   * Schule des Landes. Zwei Listen, die sich überschneiden, sind eine Liste,
   * zweimal gedruckt.
   */
  const laenge = Math.min(10, Math.floor(lage.ranglistenfaehig / 2));
  const zweigeteilt = laenge >= 3;

  const [beste, bedarf] = await Promise.all([
    rangliste("beste", { bundesland, schulart, limit: zweigeteilt ? laenge : 20 }),
    zweigeteilt
      ? rangliste("verbesserungsbedarf", { bundesland, schulart, limit: laenge })
      : Promise.resolve([]),
  ]);

  const eingegrenzt = [
    bundesland ? BUNDESLAND_LABEL[bundesland] : null,
    schulart ? SCHULART_LABEL[schulart] : null,
  ].filter(Boolean);

  return (
    <>
      <section className="abschnitt">
        <h1>Ranglisten</h1>
        <p className="einleitung">
          Aufgenommen wird eine Schule ab {MINDESTZAHL_RANGLISTE} freigegebenen Bewertungen. Ein
          Platz in einer Rangliste ist eine Aussage im Vergleich zu allen anderen Schulen - dafür
          muss die Zahl tragen.
        </p>

        <form className="filter" method="get">
          <label htmlFor="bundesland" className="versteckt">Bundesland</label>
          <select id="bundesland" name="bundesland" defaultValue={bundesland ?? ""}>
            <option value="">Alle Bundesländer</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>

          <label htmlFor="schulart" className="versteckt">Schulart</label>
          <select id="schulart" name="schulart" defaultValue={schulart ?? ""}>
            <option value="">Alle Schularten</option>
            {Object.entries(SCHULART_LABEL).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>

          <button className="knopf zweitrangig">Filtern</button>
          {eingegrenzt.length > 0 ? (
            <a className="zuruecksetzen" href="/ranglisten">Filter zurücksetzen</a>
          ) : null}
        </form>

        {/* Ohne diese Zeile sieht eine Rangliste aus vier Schulen aus wie eine
            Aussage über Deutschland. In den ersten Monaten ist genau das der Fall. */}
        <p className="bestandshinweis">
          {lage.ranglistenfaehig === 0
            ? `Noch erreicht keine Schule die ${MINDESTZAHL_RANGLISTE} Bewertungen. `
            : `${ZAHL.format(lage.ranglistenfaehig)} von ${ZAHL.format(lage.gesamt)} Schulen erreichen die Schwelle. `}
          {lage.mitBewertung > lage.ranglistenfaehig
            ? `${ZAHL.format(lage.mitBewertung - lage.ranglistenfaehig)} weitere haben Bewertungen, aber noch zu wenige.`
            : ""}
        </p>
      </section>

      {beste.length === 0 ? (
        <section className="abschnitt">
          <div className="leerzustand">
            <h2>Noch keine Rangliste</h2>
            <p>
              {eingegrenzt.length > 0
                ? `Für ${eingegrenzt.join(" · ")} erreicht noch keine Schule ${MINDESTZAHL_RANGLISTE} Bewertungen.`
                : `Sobald die ersten Schulen ${MINDESTZAHL_RANGLISTE} Bewertungen haben, stehen sie hier.`}
            </p>
            <a className="knopf" href="/schulen">Schule suchen und bewerten</a>
          </div>
        </section>
      ) : (
        <div className="ranglisten">
          <Liste
            titel={zweigeteilt ? "Am besten bewertet" : "Bewertete Schulen"}
            hinweis={
              zweigeteilt
                ? "Höchste Gesamtwertung. Bei gleichem Wert steht die Schule mit mehr Bewertungen vorn."
                : `Noch reicht es nicht für zwei Listen: bei ${lage.ranglistenfaehig} Schulen über der Schwelle stünden dieselben Namen in beiden. Hier alle, beste zuerst.`
            }
            eintraege={beste}
          />
          {zweigeteilt ? (
            <Liste
              titel="Höchster Verbesserungsbedarf"
              hinweis="Niedrigste Gesamtwertung. Diese Liste steht gleichberechtigt neben der ersten - für die Schulwahl ist sie oft die nützlichere."
              eintraege={bedarf}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

function Liste({
  titel,
  hinweis,
  eintraege,
}: {
  titel: string;
  hinweis: string;
  eintraege: readonly Ranglisteneintrag[];
}) {
  return (
    <section className="abschnitt">
      <h2>{titel}</h2>
      <p className="hinweis">{hinweis}</p>
      <ol className="rangliste">
        {eintraege.map((e, i) => {
          const score = Number(e.gesamtscore);
          const trend = trendZu(e);
          return (
            <li key={e.slug}>
              <span className="platz">{i + 1}</span>
              <a href={`/schule/${e.slug}`} className="eintrag">
                <span className="titel">{e.name}</span>
                <span className="beiwerk">
                  {[e.ort, BUNDESLAND_LABEL[e.bundesland]].filter(Boolean).join(" · ")}
                  {" · "}
                  {ZAHL.format(e.anzahl)} Bewertungen
                  {trend.veraenderung !== null && trend.richtung !== "unbekannt" ? (
                    <>
                      {" · "}
                      <span className={`trend ${trend.richtung}`}>
                        {trend.richtung === "stabil"
                          ? "stabil"
                          : `${VERAENDERUNG.format(trend.veraenderung)} in sechs Monaten`}
                      </span>
                    </>
                  ) : null}
                </span>
              </a>
              <span className="wertungsspalte">
                <Wertungszahl wert={score} />
                <Wertungsplakette wert={score} />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
