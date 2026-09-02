import { getTranslations } from "next-intl/server";
import { zaehleSchulen } from "@/db/schulen";
import { rangliste } from "@/db/ranglisten";
import { scorestufe } from "@/domain/scoring";
import { Suchfeld } from "./suchfeld";

/**
 * Startseite.
 *
 * Die Zielgruppe ist überwiegend minderjährig und kommt vom Telefon. Sie
 * entscheidet in Sekunden, ob sie bleibt, und liest dabei keine Absätze.
 * Deshalb steht oben eine Frage, darunter das Suchfeld, und alles Weitere ist
 * entweder eine Zahl, ein Schritt oder ein Link.
 *
 * Was hier bewusst **nicht** mehr oben steht: die Erklärungen zu Anonymität und
 * Prüfung, die vorher zwei Absätze füllten. Sie sind wichtig - sie stehen weiter
 * unten in je zwei Zeilen und ausführlich unter „Über uns“. Aber sie sind nicht
 * der Grund, aus dem jemand die Seite öffnet.
 */
export default async function Startseite() {
  const t = await getTranslations("startseite");
  // Die drei bestbewerteten Schulen als Vorschau: Das zeigt in einem Blick, was
  // das Portal überhaupt liefert - besser als jeder erklärende Satz.
  const [anzahl, beste] = await Promise.all([zaehleSchulen(), rangliste("beste", { limit: 3 })]);

  return (
    <>
      <section className="held held-verlauf">
        {/* Ein Wort trägt den Farbverlauf, nicht die ganze Zeile: Sonst leidet
            der Kontrast, und die Überschrift wird zur Grafik statt zum Satz. */}
        <h1>
          {t("titelVorn")} <span className="betont">{t("titelBetont")}</span>
        </h1>
        <p className="anriss">{t("untertitel")}</p>

        {/* Die Vorschläge sind eine Zugabe: Darunter bleibt ein gewöhnliches
            GET-Formular, das auch ohne JavaScript sucht. */}
        <Suchfeld
          platzhalter={t("suchfeld")}
          beschriftung={t("suchfeld")}
          knopftext={t("suchknopf")}
        />

        {/* Zahlen statt Zusicherungen: „31.770 Schulen“ ist überprüfbar,
            „umfassend“ wäre eine Behauptung. */}
        <ul className="merkmale">
          <li><strong>{anzahl.toLocaleString("de-DE")}</strong> Schulen</li>
          <li><strong>Anonym</strong> - dein Name steht nirgends</li>
          <li><strong>3 Minuten</strong> für eine Bewertung</li>
        </ul>
      </section>

      <section className="abschnitt">
        <h2>So geht das</h2>
        <ol className="schritte">
          <li>
            <strong>Schule suchen</strong>
            <span>Name, Ort oder Postleitzahl eintippen.</span>
          </li>
          <li>
            <strong>Fragen antippen</strong>
            <span>31 Pflichtfragen zu Sicherheit, Unterricht und Ausstattung.</span>
          </li>
          <li>
            <strong>Kurz bestätigen</strong>
            <span>Eine Nachricht aufs Handy - damit klar ist, dass hier Menschen bewerten.</span>
          </li>
        </ol>
      </section>

      {beste.length > 0 && (
        <section className="abschnitt">
          <div className="abschnittskopf">
            <h2>Gerade am besten bewertet</h2>
            <a href="/ranglisten">Alle Ranglisten</a>
          </div>
          <ul className="vorschauliste">
            {beste.map((schule, i) => {
              const punkte = Number(schule.gesamtscore);
              return (
                <li key={schule.slug}>
                  <a href={`/schule/${schule.slug}`}>
                    <span className="platz">{i + 1}</span>
                    <span className="name">
                      <span className="schulname" title={schule.name}>{schule.name}</span>
                      <span>
                        {schule.ort ? `${schule.ort} · ` : ""}
                        {schule.anzahl} Bewertungen
                      </span>
                    </span>
                    <span className={`punkte ${scorestufe(punkte)}`}>
                      {punkte.toLocaleString("de-DE", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="abschnitt">
        {/* Der Anreiz gehört nach oben, nicht ins Kleingedruckte: Für
            Schülerinnen und Schüler ist er oft der Grund, überhaupt anzufangen.
            Die Bedingungen stehen einen Klick weiter, nicht hier. */}
        <div className="streifen">
          <span className="marke-signal">Verlosung</span>
          <p>
            Schülerin oder Schüler? Dann nimmst du mit deiner Bewertung{" "}
            <strong>jeden Monat an der Verlosung teil</strong> - freiwillig, ein Los je Konto.
          </p>
          <a className="knopf zweitrangig klein" href="/verlosung">Bedingungen</a>
        </div>
      </section>

      <section className="abschnitt">
        <div className="karten zwei">
          <div className="karte">
            <span className="beschriftung">Anonym</span>
            <h3>Niemand erfährt, wer bewertet hat</h3>
            <p>
              Deine Bewertung erscheint ohne Namen. Deine Handynummer brauchen wir nur zur
              Bestätigung - veröffentlicht wird sie nie.
            </p>
          </div>
          <div className="karte">
            <span className="beschriftung">Geprüft</span>
            <h3>Gekaufte Bewertungen fallen auf</h3>
            <p>
              Automatische Prüfungen erkennen Mehrfachabgaben und auffällige Muster. Wo etwas
              seltsam aussieht, entscheidet ein Mensch.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
