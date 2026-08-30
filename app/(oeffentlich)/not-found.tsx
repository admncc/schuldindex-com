import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suchfeld } from "./suchfeld";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

/**
 * Was zu sehen ist, wenn es die Seite nicht gibt.
 *
 * Ohne diese Datei liefert Next.js seine eigene Seite aus - englisch, leer und
 * ohne einen Weg zurück. Das war der einzige englische Text im ganzen Portal.
 *
 * Der häufigste Fall ist eine Schule, die es unter dieser Adresse nicht (mehr)
 * gibt: ein alter Link, ein Tippfehler, eine umbenannte Schule. Deshalb steht
 * hier das Suchfeld und nicht nur eine Entschuldigung.
 */
export default async function NichtGefunden() {
  const t = await getTranslations();

  return (
    <section className="abschnitt">
      <div className="leerzustand">
        <h1>Diese Seite gibt es nicht</h1>
        <p>
          Vielleicht ist der Link alt oder es hat sich ein Tippfehler eingeschlichen. Such deine
          Schule einfach hier:
        </p>
      </div>

      <Suchfeld
        platzhalter={t("startseite.suchfeld")}
        beschriftung={t("startseite.suchfeld")}
        knopftext={t("startseite.suchknopf")}
      />

      <p className="hinweis">
        Oder weiter zur <a href="/schulen">Schulsuche</a>, zu den{" "}
        <a href="/ranglisten">Ranglisten</a> oder zur <a href="/karte">Karte</a>.
      </p>
    </section>
  );
}
