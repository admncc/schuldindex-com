import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { holeSchule } from "@/db/schulen";
import { holeZusammenfassung } from "@/db/zusammenfassungen";
import { frageMittelwerte } from "@/db/fragewerte";
import { kennzeichnung } from "@/ki/zusammenfassung";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { MINDESTZAHL_PROFIL } from "@/domain/aggregation";
import { ampelstufe } from "@/domain/scoring";
import { Wertungsplakette } from "../../teile";
import { Wertungsring } from "../../wertungsring";
import { Kategoriewertungen } from "../../kategoriewertungen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const schule = await holeSchule(slug);
  if (!schule) return { title: "Schule nicht gefunden" };
  return {
    title: schule.name,
    description: `Bewertungen für ${schule.name}${schule.ort ? ` in ${schule.ort}` : ""}.`,
  };
}

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" });

export default async function Schulseite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const schule = await holeSchule(slug);
  if (!schule) notFound();

  const t = await getTranslations();
  const zusammenfassung = await holeZusammenfassung(schule.id);
  // Die Einzelfragen nur dort holen, wo sie auch gezeigt werden - unterhalb der
  // Profilschwelle steht ohnehin nur der Leerzustand.
  const angaben =
    schule.anzahl >= MINDESTZAHL_PROFIL ? await frageMittelwerte(schule.id) : [];
  const score = schule.gesamtscore === null ? null : Number(schule.gesamtscore);
  const aggression = schule.aggressionsindex === null ? null : Number(schule.aggressionsindex);
  const sichtbar = schule.anzahl >= MINDESTZAHL_PROFIL && score !== null;

  return (
    <>
      <section className="schulkopf">
        <div className="kopfzeile">
          <div>
            <h1>{schule.name}</h1>
            <p className="anschrift">
              {[schule.strasse, [schule.plz, schule.ort].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ")}
              {" · "}
              {BUNDESLAND_LABEL[schule.bundesland]}
            </p>
          </div>
          {sichtbar && (
            <div className="wertungsblock">
              <Wertungsring wert={score} />
              <Wertungsplakette wert={score} />
            </div>
          )}
        </div>

        <div>
          {schule.schularten.map((art) => (
            <span key={art} className="marke-schulart">{t(`schulart.${art}`)}</span>
          ))}
        </div>

        <div className="schrittleiste">
          <a className="knopf" href={`/bewerten/${schule.slug}`}>{t("schule.bewertenKnopf")}</a>
          {/* Schulen finden den Weg zu ihren eigenen Zahlen sonst nicht. */}
          <a className="knopf zweitrangig" href={`/schulsupport/anfordern?schule=${schule.slug}`}>
            Ich spreche für diese Schule
          </a>
        </div>
      </section>

      {/* Drei Zustände statt zwei: keine Bewertungen, zu wenige, genug.
          Der mittlere fehlt in vielen Portalen - dabei ist er bei 33.600
          Schulen auf lange Sicht der häufigste. */}
      {schule.anzahl === 0 ? (
        <section className="abschnitt">
          <div className="leerzustand">
            <h3>{t("schule.keineBewertungen")}</h3>
            <p>{t("schule.keineBewertungenHinweis")}</p>
            <a className="knopf" href={`/bewerten/${schule.slug}`}>{t("schule.bewertenKnopf")}</a>
          </div>
        </section>
      ) : !sichtbar ? (
        <section className="abschnitt">
          <div className="leerzustand">
            <h3>{t("schule.zuWenigeBewertungen")}</h3>
            <p>
              {t("schule.zuWenigeBewertungenHinweis", {
                mindestzahl: MINDESTZAHL_PROFIL,
                anzahl: schule.anzahl,
              })}
            </p>
            <a className="knopf" href={`/bewerten/${schule.slug}`}>{t("schule.bewertenKnopf")}</a>
          </div>
        </section>
      ) : (
        <section className="abschnitt">
          <h2>{t("schule.gesamtwertung")}</h2>
          <p className="hinweis">
            {t("schule.anzahlBewertungen", { anzahl: schule.anzahl })}
            {schule.letzte_bewertung_am
              ? ` · ${t("schule.stand", { datum: DATUM.format(schule.letzte_bewertung_am) })}`
              : ""}
          </p>

          {/* Die Kategoriewertungen stehen vor dem Aggressionsindex und vor der
              Zusammenfassung: Sie beantworten die Frage, mit der die meisten auf
              diese Seite kommen - was ist an dieser Schule gut, was nicht. */}
          <Kategoriewertungen
            werte={[
              { kategorie: "A", score: schule.score_a },
              { kategorie: "B", score: schule.score_b },
              { kategorie: "C", score: schule.score_c },
              { kategorie: "D", score: schule.score_d },
              { kategorie: "E", score: schule.score_e },
              { kategorie: "F", score: schule.score_f },
            ]}
            angaben={angaben}
          />

          {aggression !== null && (
            <div className="karte">
              <span className="beschriftung">{t("schule.sicherheitsindikator")}</span>
              <span className={`plakette ${ampelstufe(aggression)}`}>
                {t(`ampel.${ampelstufe(aggression)}`)}
              </span>
              <p>{t("ampel.erklaerung")}</p>
            </div>
          )}
        </section>
      )}

      {zusammenfassung && (
        <section className="abschnitt">
          <h2>Was Bewertende schreiben</h2>
          {/* Kein einziger Originaltext wird veröffentlicht - was hier steht,
              ist unser eigener Text, aus den Freitexten zusammengefasst und vor
              der Veröffentlichung geprüft (Entwicklungsplan, Abschnitt 10.2).
              Deshalb steht die Kennzeichnung darunter und nicht im Kleingedruckten. */}
          <div className="karte zusammenfassung">
            <p>{zusammenfassung.text}</p>
            {(zusammenfassung.positive_themen.length > 0 ||
              zusammenfassung.kritische_themen.length > 0) && (
              <div className="themen">
                {zusammenfassung.positive_themen.length > 0 && (
                  <div>
                    <span className="beschriftung">Häufig gelobt</span>
                    <ul>
                      {zusammenfassung.positive_themen.map((thema) => (
                        <li key={thema} className="thema gut">{thema}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {zusammenfassung.kritische_themen.length > 0 && (
                  <div>
                    <span className="beschriftung">Häufig kritisiert</span>
                    <ul>
                      {zusammenfassung.kritische_themen.map((thema) => (
                        <li key={thema} className="thema schlecht">{thema}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <p className="fussnote">
              {kennzeichnung(zusammenfassung.aus_anzahl, zusammenfassung.erstellt_am)}
            </p>
          </div>
        </section>
      )}

      <section className="abschnitt">
        <h2>Angaben zur Schule</h2>
        <div className="karten zwei">
          <div className="karte">
            <span className="beschriftung">{t("schule.adresse")}</span>
            <p>
              {schule.strasse ?? "-"}
              <br />
              {[schule.plz, schule.ort].filter(Boolean).join(" ") || "-"}
            </p>
          </div>
          <div className="karte">
            <span className="beschriftung">{t("schule.traeger")}</span>
            <p>{schule.traeger ?? "nicht bekannt"}</p>
            {schule.website && (
              <p>
                <a href={schule.website} rel="noopener noreferrer nofollow" target="_blank">
                  {t("schule.website")}
                </a>
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
