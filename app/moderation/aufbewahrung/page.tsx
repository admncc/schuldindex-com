import type { Metadata } from "next";
import { letzteLaeufe, raeumeAuf } from "@/db/aufraeumen";
import { fristtext, laufbericht, REGELN, regel } from "@/domain/aufbewahrung";
import { verlangeAnmeldung } from "../sitzung";

export const metadata: Metadata = { title: "Aufbewahrung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Ab wann ein ausbleibender Lauf ein Betriebsvorfall ist. */
const ALARM_STUNDEN = 48;

export default async function Aufbewahrungsseite() {
  await verlangeAnmeldung();

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

      {stundenHer === null ? (
        <div className="alarm" role="alert">
          <strong>Es lief noch nie ein Aufräumlauf.</strong>
          <p>
            Solange keiner läuft, sind die Fristen in der Datenschutzerklärung eine Zusage ohne
            Deckung. Einrichten: <code>npx tsx scripts/aufraeumen.ts</code> täglich.
          </p>
        </div>
      ) : stundenHer > ALARM_STUNDEN ? (
        <div className="alarm" role="alert">
          <strong>Der letzte Lauf ist {Math.floor(stundenHer)} Stunden her.</strong>
          <p>Vorgesehen ist täglich. Sieh nach, ob der Zeitplan noch greift.</p>
        </div>
      ) : null}

      <h2>Was gerade fällig wäre</h2>
      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">Daten</th>
            <th scope="col">Frist</th>
            <th scope="col">Fällig</th>
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
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fussnote">
        Diese Zahlen stammen aus einem trockenen Lauf — sie ändern nichts. Gelöscht wird nur vom
        Zeitplan aus.
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
