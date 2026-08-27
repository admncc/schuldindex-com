import type { Metadata } from "next";
import { letzteLaeufe, raeumeAuf } from "@/db/aufraeumen";
import { fristtext, laufbericht, REGELN, regel } from "@/domain/aufbewahrung";
import { verlangeAnmeldung } from "../sitzung";
import Regelzeile from "./regelzeile";

export const metadata: Metadata = { title: "Aufbewahrung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function Aufbewahrungsseite() {
  const moderatorin = await verlangeAnmeldung();

  // Ein trockener Lauf: er zeigt, was fällig wäre, und ändert nichts. Der
  // löschende Lauf gehört in den Zeitplan, nicht in eine Seite, die jemand
  // versehentlich neu lädt.
  const [faellig, laeufe] = await Promise.all([raeumeAuf(true), letzteLaeufe()]);

  const letzterEchte = laeufe.find((l) => !l.trocken);
  const stundenHer =
    letzterEchte === undefined
      ? null
      : (Date.now() - letzterEchte.gelaufen_am.getTime()) / 3600_000;

  return (
    <section className="abschnitt">
      <h1>Aufbewahrung</h1>
      <p className="hinweis">
        Die Fristen aus der Datenschutzerklärung. Beide Seiten lesen denselben Katalog — eine
        Frist, die dort steht und hier nicht ausgeführt wird, gäbe es nicht.
      </p>

      {/* Kein Alarm mehr über ausbleibende Läufe: Es gibt keinen Zeitplan, der
          laufen könnte. Stattdessen steht hier, was liegt — und wer es löschen
          will, tut es unten einzeln. */}
      <div className="karte">
        <span className="beschriftung">Keine automatische Löschung</span>
        <p>
          Gelöscht wird nur, wenn eine Person es hier auslöst — Vorgabe des Auftraggebers vom
          27.08.2026. Die Fristen der Datenschutzerklärung gelten weiter; was sich ändert, ist,
          wer sie ausführt. Jede Ausführung steht danach im Moderationsprotokoll.
        </p>
        {stundenHer !== null ? (
          <p className="fussnote">
            Zuletzt gelöscht vor {Math.floor(stundenHer)} Stunden.
          </p>
        ) : (
          <p className="fussnote">Bisher wurde nichts gelöscht.</p>
        )}
      </div>

      <h2>Was gerade fällig wäre</h2>
      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">Daten</th>
            <th scope="col">Frist</th>
            <th scope="col">Fällig</th>
            <th scope="col">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {faellig.bilanzen.map((b) => {
            const r = regel(b.art);
            return (
              <tr key={b.art}>
                <td>{r.gegenstand}</td>
                <td className="gedaempft">
                  {fristtext(r.tage)} ab {r.ab}
                </td>
                <td>{b.betroffen.toLocaleString("de-DE")}</td>
                <td>
                  <Regelzeile
                    art={b.art}
                    gegenstand={r.gegenstand}
                    betroffen={b.betroffen}
                    darfLoeschen={moderatorin.rolle === "leitung"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fussnote">
        Diese Zahlen stammen aus einem Zähllauf — er ändert nichts.
      </p>

      <h2>Bisherige Läufe</h2>
      {laeufe.length === 0 ? (
        <p className="gedaempft">Noch keiner.</p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Zeitpunkt</th>
              <th scope="col">Art</th>
              <th scope="col">Ergebnis</th>
              <th scope="col">Dauer</th>
            </tr>
          </thead>
          <tbody>
            {laeufe.map((l) => (
              <tr key={l.id}>
                <td>{ZEIT.format(l.gelaufen_am)}</td>
                <td>{l.trocken ? "trocken" : "gelöscht"}</td>
                <td>{laufbericht(l.bilanz)}</td>
                <td className="gedaempft">{l.dauer_ms === null ? "—" : `${l.dauer_ms} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Was nicht gelöscht wird</h2>
      <ul className="hinweisliste">
        <li>
          <strong>Veröffentlichte Bewertungen</strong> — sie waren nie personenbezogen
          veröffentlicht und bleiben, auch wenn das zugehörige Konto stillgelegt wurde.
        </li>
        <li>
          <strong>Das Moderationsprotokoll</strong> — der Nachweis, dass über jede Ablehnung ein
          Mensch entschieden hat (Art. 20 DSA). Es enthält keine Kontaktdaten.
        </li>
        <li>
          <strong>Ziehungen der Verlosung</strong> — ohne sie ließe sich eine Ziehung nicht mehr
          nachrechnen.
        </li>
      </ul>
      <p className="fussnote">
        Insgesamt {REGELN.length} Regeln. Wer eine ändert, ändert damit auch die Angabe in der
        Datenschutzerklärung.
      </p>
    </section>
  );
}
