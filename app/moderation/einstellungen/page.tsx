import type { Metadata } from "next";
import { holeEinstellungen, verlauf } from "@/db/einstellungen";
import { abweichungen, beschreibung, KATALOG } from "@/domain/einstellungen";
import { verlangeAnmeldung } from "../sitzung";
import Einstellungsformular from "./formular";

export const metadata: Metadata = { title: "Einstellungen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Die Stellschrauben der Betrugserkennung.
 *
 * Alles, was hier steht, entscheidet mit darüber, welche Bewertung ein Mensch
 * ansieht und welche durchgeht. Deshalb drei Dinge, die keine Oberfläche
 * weglassen darf: Grenzen für jeden Wert, eine Erklärung dazu, was er bewirkt,
 * und ein Verlauf, der zeigt, wer wann was geändert hat.
 */
export default async function Einstellungsseite() {
  const moderatorin = await verlangeAnmeldung();
  const [werte, eintraege] = await Promise.all([holeEinstellungen(), verlauf()]);
  const geaendert = abweichungen(werte);

  return (
    <section className="abschnitt">
      <h1>Betrugserkennung</h1>
      <p className="hinweis">
        Jede Prüfung liefert ein Signal, keine Entscheidung: Eine auffällige Bewertung wird
        angehalten und einem Menschen vorgelegt, nie automatisch abgelehnt. Ab der Halteschwelle
        landet sie in der Warteschlange.
      </p>

      {geaendert.length === 0 ? (
        <p className="bestandshinweis">
          Alle {KATALOG.length} Werte stehen auf der Vorgabe.
        </p>
      ) : (
        <div className="alarm" role="status">
          <strong>
            {geaendert.length} von {KATALOG.length} Werten weicht von der Vorgabe ab.
          </strong>
          <ul>
            {geaendert.map((s) => (
              <li key={s}>
                {beschreibung(s)?.label ?? s}: {werte[s]} statt {beschreibung(s)?.vorgabe}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Einstellungsformular werte={werte} darfAendern={moderatorin.rolle === "leitung"} />

      <section className="abschnitt">
        <h2>Verlauf</h2>
        {eintraege.length === 0 ? (
          <p className="gedaempft">Noch nichts geändert.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                <th scope="col">Einstellung</th>
                <th scope="col">Von</th>
                <th scope="col">Auf</th>
                <th scope="col">Wer</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td>{ZEIT.format(e.geaendert_am)}</td>
                  <td>{beschreibung(e.schluessel)?.label ?? e.schluessel}</td>
                  <td className="gedaempft">{e.alter_wert ?? "Vorgabe"}</td>
                  <td>{e.neuer_wert}</td>
                  <td>{e.moderator_name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="fussnote">
          Bei einer Einstellung, die entscheidet, welche Bewertungen durchgehen, ist „seit wann
          steht das so, und wer hat es gesetzt?“ die erste Frage, wenn etwas auffällt.
        </p>
      </section>
    </section>
  );
}
