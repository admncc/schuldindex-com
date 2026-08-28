import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { sucheSchulen } from "@/db/schulen";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { Wertungszahl } from "../teile";
import { Suchfeld } from "../suchfeld";
import { schulartAnzeige } from "@/import/schulart";

export const metadata: Metadata = { title: "Schulen finden" };

export default async function Suchseite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getTranslations();
  const { q = "" } = await searchParams;
  const eingabe = q.trim();
  const treffer = eingabe.length >= 2 ? await sucheSchulen(eingabe) : [];

  return (
    <>
      <section className="suchblock">
        <h1>{t("suche.titel")}</h1>
        <Suchfeld
          vorbelegt={eingabe}
          platzhalter={t("startseite.suchfeld")}
          beschriftung={t("startseite.suchfeld")}
          knopftext={t("startseite.suchknopf")}
        />
        {eingabe.length >= 2 && (
          <p className="bestandshinweis">{t("suche.treffer", { anzahl: treffer.length })}</p>
        )}
      </section>

      <section className="abschnitt">
        {eingabe.length < 2 ? (
          <p className="hinweis">{t("suche.weiterTippen")}</p>
        ) : treffer.length === 0 ? (
          <div className="leerzustand">
            <h3>{t("suche.keineTreffer")}</h3>
            <p>{t("suche.keineTrefferHinweis")}</p>
          </div>
        ) : (
          <ul className="treffer">
            {treffer.map((s) => (
              <li key={s.slug}>
                <a href={`/schule/${s.slug}`}>
                  <span className="eintrag">
                    <span className="titel">{s.name}</span>
                    <span className="beiwerk">
                      {[s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ")}
                      {" · "}
                      {BUNDESLAND_LABEL[s.bundesland]}
                      {schulartAnzeige(s.schulart_original, s.schularten)
                        ? ` · ${schulartAnzeige(s.schulart_original, s.schularten)}`
                        : ""}
                    </span>
                  </span>
                  {s.gesamtscore !== null && <Wertungszahl wert={Number(s.gesamtscore)} />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
