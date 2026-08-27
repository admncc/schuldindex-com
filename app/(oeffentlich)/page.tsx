import { getTranslations } from "next-intl/server";
import { zaehleSchulen } from "@/db/schulen";
import { Suchfeld } from "./suchfeld";

export default async function Startseite() {
  const t = await getTranslations("startseite");
  const anzahl = await zaehleSchulen();

  return (
    <>
      <section className="suchblock">
        <h1>{t("titel")}</h1>
        <p className="einleitung">{t("untertitel")}</p>

        {/* Die Vorschläge sind eine Zugabe: Darunter bleibt ein gewöhnliches
            GET-Formular, das auch ohne JavaScript sucht. */}
        <Suchfeld
          platzhalter={t("suchfeld")}
          beschriftung={t("suchfeld")}
          knopftext={t("suchknopf")}
        />

        <p className="bestandshinweis">{t("schulenImBestand", { anzahl })}</p>
      </section>

      <section className="abschnitt">
        <div className="karten zwei">
          <div className="karte">
            <span className="beschriftung">Anonym</span>
            <h3>Niemand erfährt, wer bewertet hat</h3>
            <p>
              Deine Bewertung erscheint immer ohne Namen. Deine Kontaktdaten
              brauchen wir nur, um zu bestätigen, dass die Bewertung von einem
              Menschen kommt — veröffentlicht werden sie nie.
            </p>
          </div>
          <div className="karte">
            <span className="beschriftung">Geprüft</span>
            <h3>Jede Bewertung wird kontrolliert</h3>
            <p>
              Automatische Prüfungen erkennen Mehrfachabgaben und Bewertungen aus
              großer Entfernung. Auffällige Fälle sieht sich ein Mensch an, bevor
              sie veröffentlicht werden.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
