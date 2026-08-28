import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { holeSchule } from "@/db/schulen";
import { sucheSchulen } from "@/db/schulen";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { holeAngemeldeteSchule } from "../sitzung";
import Anfrageformular from "./formular";

export const metadata: Metadata = {
  title: "Zugang für Schulen",
  description: "Zugang zu den Auswertungen der eigenen Schule anfordern.",
};
export const dynamic = "force-dynamic";

const GRUND_TEXT: Readonly<Record<string, string>> = {
  abgelaufen: "Dieser Zugangslink ist abgelaufen. Fordere einen neuen an.",
  ungueltig: "Dieser Zugangslink ist nicht mehr gültig. Fordere einen neuen an.",
  abgelehnt: "Diese Anfrage wurde abgelehnt. Bei Rückfragen meld dich über das Impressum.",
};

export default async function Anfrageseite({
  searchParams,
}: {
  searchParams: Promise<{ schule?: string; q?: string; grund?: string }>;
}) {
  const p = await searchParams;
  if (await holeAngemeldeteSchule()) redirect("/schulsupport");

  const schule = p.schule ? await holeSchule(p.schule) : null;
  const treffer = !schule && p.q && p.q.length >= 2 ? await sucheSchulen(p.q) : [];

  return (
    <section className="abschnitt rechtstext">
      <h1>Zugang für Schulen</h1>
      <p>
        Schulen können die Auswertungen zu ihrer eigenen Schule einsehen: Gesamtwertung,
        Kategoriewerte, Verlauf und die Zusammenfassung der Freitexte.{" "}
        <strong>Einzelne Bewertungen sind nicht einsehbar</strong> - auch nicht für die Schule.
        Sonst wäre die Zusage der Anonymität nichts wert.
      </p>

      {p.grund && GRUND_TEXT[p.grund] ? (
        <p className="fehler" role="alert">{GRUND_TEXT[p.grund]}</p>
      ) : null}

      {schule ? (
        <>
          <h2>{schule.name}</h2>
          <p className="gedaempft">
            {[schule.strasse, [schule.plz, schule.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")} ·{" "}
            {BUNDESLAND_LABEL[schule.bundesland]} ·{" "}
            <a href={`/schulsupport/anfordern`}>andere Schule</a>
          </p>
          <Anfrageformular slug={schule.slug} hatAmtlicheAdresse={Boolean(schule.website)} />
        </>
      ) : (
        <>
          <h2>Welche Schule?</h2>
          <form className="filter" method="get">
            <label htmlFor="q" className="versteckt">Schule suchen</label>
            <input id="q" name="q" placeholder="Name oder Ort" defaultValue={p.q ?? ""} />
            <button className="knopf zweitrangig">Suchen</button>
          </form>

          {treffer.length > 0 ? (
            <ul className="treffer">
              {treffer.slice(0, 12).map((s) => (
                <li key={s.slug}>
                  <a href={`/schulsupport/anfordern?schule=${s.slug}`}>
                    <span className="eintrag">
                      <span className="titel">{s.name}</span>
                      <span className="beiwerk">
                        {[s.ort, BUNDESLAND_LABEL[s.bundesland]].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : p.q ? (
            <p className="hinweis">Nichts gefunden. Versuch es mit dem Ort dazu.</p>
          ) : null}
        </>
      )}

      <h2>Wie wir prüfen, dass du für die Schule sprichst</h2>
      <ol>
        <li>
          <strong>Ist im Schulverzeichnis eine Adresse hinterlegt</strong>, schicken wir den
          Zugangslink dorthin - nicht an eine Adresse, die in diesem Formular steht.
        </li>
        <li>
          <strong>Sonst</strong> nehmen wir eine Adresse an der Domäne der Schulwebsite, sofern
          diese Domäne nur zu dieser einen Schule gehört.
        </li>
        <li>
          <strong>In allen anderen Fällen</strong> prüfen wir von Hand und melden uns bei der
          Schule. Das betrifft vor allem Schulen an gemeinsamen Landesdomänen: unter{" "}
          <code>schule.nrw.de</code> etwa liegen über fünftausend Schulen - eine Adresse dort sagt
          nichts darüber aus, für welche davon jemand spricht.
        </li>
      </ol>
    </section>
  );
}
