import type { Metadata } from "next";
import { holeSchule } from "@/db/schulen";
import { holeZusammenfassung } from "@/db/zusammenfassungen";
import { KATEGORIEN } from "@/domain/fragebogen";
import { MINDESTZAHL_PROFIL, MINDESTZAHL_RANGLISTE, trendAusScores, TREND_LABEL } from "@/domain/aggregation";
import { ampelstufe, scorestufe } from "@/domain/scoring";
import { kennzeichnung } from "@/ki/zusammenfassung";
import { ZUGANG_TAGE } from "@/domain/schulzugang";
import { verlangeSchule } from "./sitzung";
import { schuleAbmelden } from "./aktionen";
import { Wertungsplakette, Wertungszahl } from "../teile";

export const metadata: Metadata = {
  title: "Auswertung für deine Schule",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

const ROLLE_LABEL: Readonly<Record<string, string>> = {
  schueler_unter_16: "Schüler:innen unter 16",
  schueler_ab_16: "Schüler:innen ab 16",
  eltern: "Eltern",
  lehrkraft: "Lehrkräfte",
  ehemalig: "Ehemalige",
};

/**
 * Die Auswertung für die Schule selbst.
 *
 * Was hier **nicht** steht, ist die eigentliche Entscheidung: keine einzelne
 * Bewertung, kein Freitext im Wortlaut, keine Klassenstufe, kein Zeitpunkt einer
 * Abgabe. An einer kleinen Schule genügt „Bewertung einer Achtklässlerin von
 * gestern“, um den Kreis auf wenige Personen einzugrenzen — und die Zusage der
 * Anonymität wäre nichts mehr wert.
 */
export default async function Schulsupportseite() {
  const sitzung = await verlangeSchule();
  const schule = await holeSchule(sitzung.slug);
  if (schule === null) return null;

  const zusammenfassung = await holeZusammenfassung(schule.id);
  const score = schule.gesamtscore === null ? null : Number(schule.gesamtscore);
  const aggression = schule.aggressionsindex === null ? null : Number(schule.aggressionsindex);
  const sichtbar = schule.anzahl >= MINDESTZAHL_PROFIL && score !== null;

  const trend = trendAusScores(
    { score, anzahl: schule.anzahl },
    {
      score: schule.gesamtscore_vor_6m === null ? null : Number(schule.gesamtscore_vor_6m),
      anzahl: schule.anzahl_vor_6m,
    },
  );

  const rollen = Object.entries(schule.anzahl_je_rolle ?? {})
    .map(([rolle, anzahl]) => [rolle, Number(anzahl)] as const)
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="abschnitt">
        <div className="vorgangskopf">
          <div>
            <p className="hinweis">Auswertung für die Schule</p>
            <h1>{schule.name}</h1>
            <p className="gedaempft">
              Zugang gültig bis {DATUM.format(sitzung.gueltigBis)} ({ZUGANG_TAGE} Tage) ·{" "}
              <a href={`/schule/${schule.slug}`}>öffentliches Profil</a>
            </p>
          </div>
          <form action={schuleAbmelden}>
            <button className="knopf zweitrangig klein">Abmelden</button>
          </form>
        </div>
      </section>

      <section className="abschnitt">
        {schule.anzahl === 0 ? (
          <div className="leerzustand">
            <h2>Noch keine Bewertungen</h2>
            <p>Zu dieser Schule liegt bisher keine Bewertung vor.</p>
          </div>
        ) : (
          <>
            <h2>Gesamtwertung</h2>
            <div className="karten zwei">
              <div className="karte">
                <span className="beschriftung">
                  {sichtbar ? "Öffentlich sichtbar" : "Noch nicht öffentlich"}
                </span>
                {sichtbar ? (
                  <>
                    <Wertungszahl wert={score} gross />
                    <Wertungsplakette wert={score} />
                  </>
                ) : (
                  <p>
                    Erst ab {MINDESTZAHL_PROFIL} Bewertungen zeigen wir eine Wertung. Bisher liegen{" "}
                    {ZAHL.format(schule.anzahl)} vor.
                  </p>
                )}
                <p className="fussnote">
                  {ZAHL.format(schule.anzahl)} Bewertungen · für die Ranglisten sind{" "}
                  {MINDESTZAHL_RANGLISTE} nötig
                  {schule.letzte_bewertung_am
                    ? ` · zuletzt ${DATUM.format(schule.letzte_bewertung_am)}`
                    : ""}
                </p>
              </div>

              <div className="karte">
                <span className="beschriftung">Verlauf</span>
                <p>
                  {trend.richtung === "unbekannt"
                    ? `Für einen Vergleich mit dem Vorhalbjahr fehlen noch Bewertungen — nötig sind ${MINDESTZAHL_PROFIL} in beiden Zeiträumen.`
                    : `Gegenüber dem Vorhalbjahr ${TREND_LABEL[trend.richtung]}${
                        trend.veraenderung === null
                          ? ""
                          : ` (${trend.veraenderung > 0 ? "+" : ""}${WERT.format(trend.veraenderung)} Punkte)`
                      }.`}
                </p>
                {aggression !== null ? (
                  <p>
                    Sicherheitsindikator:{" "}
                    <span className={`plakette ${ampelstufe(aggression)}`}>{ampelstufe(aggression)}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <h2>Kategorien</h2>
            <ul className="kategorien">
              {KATEGORIEN.map((k) => {
                const roh = schule[`score_${k.id.toLowerCase()}` as "score_a"];
                const wert = roh === null ? null : Number(roh);
                const anzeige = wert === null ? null : ((wert - 1) / 4) * 10;
                return (
                  <li key={k.id}>
                    <span className="name">
                      {k.id} — {k.titel}
                    </span>
                    <span className="wert">
                      {anzeige === null ? "—" : `${WERT.format(anzeige)} von 10`}
                    </span>
                    <span className="balken">
                      <span
                        style={{ width: `${anzeige === null ? 0 : anzeige * 10}%` }}
                        className={anzeige === null ? "" : scorestufe(anzeige)}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>

            {rollen.length > 0 ? (
              <>
                <h2>Wer bewertet hat</h2>
                <ul className="kategorien">
                  {rollen.map(([rolle, anzahl]) => (
                    <li key={rolle}>
                      <span className="name">{ROLLE_LABEL[rolle] ?? rolle}</span>
                      <span className="wert">{ZAHL.format(anzahl)}</span>
                    </li>
                  ))}
                </ul>
                <p className="fussnote">
                  Nur die Verteilung, keine einzelnen Abgaben: an einer kleinen Schule genügt der
                  Zeitpunkt einer Bewertung, um den Kreis auf wenige Personen einzugrenzen.
                </p>
              </>
            ) : null}
          </>
        )}
      </section>

      {zusammenfassung ? (
        <section className="abschnitt">
          <h2>Zusammenfassung der Freitexte</h2>
          <div className="karte zusammenfassung">
            <p>{zusammenfassung.text}</p>
            <p className="fussnote">
              {kennzeichnung(zusammenfassung.aus_anzahl, zusammenfassung.erstellt_am)}
            </p>
          </div>
        </section>
      ) : null}

      <section className="abschnitt">
        <h2>Etwas stimmt nicht?</h2>
        <p className="hinweis">
          Falsche Stammdaten korrigieren wir auf Zuruf — schreib uns über die Adresse im{" "}
          <a href="/impressum">Impressum</a>. Hältst du einen veröffentlichten Inhalt für
          rechtswidrig, nutz das <a href="/inhalt-melden">Meldeformular</a>; wir prüfen jede
          Meldung und teilen die Entscheidung mit.
        </p>
        <p className="hinweis">
          Einzelne Bewertungen geben wir auch auf Nachfrage nicht heraus — weder Wortlaut noch
          Zeitpunkt noch Klassenstufe.
        </p>
      </section>
    </>
  );
}
