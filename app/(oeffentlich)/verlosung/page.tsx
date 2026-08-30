import type { Metadata } from "next";
import { letzteZiehungen } from "@/db/verlosung";
import {
  GEWINNE,
  PARTNER,
  VERLOSUNGSARTEN,
  VERLOSUNG_LABEL,
  monatsname,
  ziehungsmeldung,
} from "@/domain/verlosung";
import { betreiber } from "@/recht/betreiber";
import { Fehlt } from "../rechtsteile";

export const metadata: Metadata = {
  title: "Verlosung",
  description: "Teilnahmebedingungen der monatlichen Verlosung und die bisherigen Ziehungen.",
};
export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

export default async function Verlosungsseite() {
  const ziehungen = await letzteZiehungen();
  const a = betreiber();

  return (
    <section className="abschnitt rechtstext">
      <h1>Verlosung</h1>
      <p>
        Wer eine Schule bewertet und Schülerin oder Schüler ist, kann an der monatlichen
        Verlosung teilnehmen. Die Teilnahme ist freiwillig und kostenlos; die Bewertung zählt
        genauso, wenn du das Kästchen nicht ankreuzt. Ausgespielt werden Gutscheine von{" "}
        {PARTNER}, einlösbar in über 500 Geschäften.
      </p>

      <h2>Drei Ziehungen im Monat</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Ziehung</th>
            <th scope="col">Gewinne</th>
            <th scope="col">Wer dabei ist</th>
          </tr>
        </thead>
        <tbody>
          {VERLOSUNGSARTEN.map((art) => (
            <tr key={art}>
              <td>{VERLOSUNG_LABEL[art]}</td>
              <td>
                {GEWINNE[art].anzahl} × {GEWINNE[art].wertEuro} Euro
              </td>
              <td>
                {art === "normal"
                  ? "Alle, die bewertet und teilgenommen haben. Wer hier einmal gewonnen hat, ist bei den weiteren Ziehungen dieser Art nicht mehr dabei."
                  : GEWINNE[art].mindestEmpfehlungen === 1
                    ? "Wer im selben Monat mindestens eine Person über den eigenen Link geworben hat, deren Bewertung veröffentlicht wurde."
                    : `Wer im selben Monat mindestens ${GEWINNE[art].mindestEmpfehlungen} Personen über den eigenen Link geworben hat, deren Bewertungen veröffentlicht wurden.`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Den eigenen Link bekommst du, sobald deine Bewertung bestätigt ist. Er zählt erst, wenn
        jemand darüber <strong>bewertet</strong> und die Bewertung veröffentlicht wird - ein
        Klick allein bringt nichts, sonst wäre die Superverlosung eine Klickzählung.
      </p>

      <h2>Teilnahmebedingungen</h2>
      <ol>
        <li>
          <strong>Wer teilnehmen kann:</strong> Schülerinnen und Schüler, die eine Bewertung
          abgegeben und bestätigt haben. Andere Rollen - Eltern, Lehrkräfte, Ehemalige - sind
          ausgeschlossen.
        </li>
        <li>
          <strong>Wer schon gewonnen hat</strong>, nimmt an der monatlichen Verlosung nicht
          erneut teil - an Super- und Mega-Verlosung dagegen weiterhin. Die belohnen nicht das
          Bewerten, sondern das Weitersagen.
        </li>
        <li>
          <strong>Ein Los je Konto und Monat.</strong> Auch wer mehrere Schulen bewertet, hat ein
          Los. Sonst würde die Verlosung genau das belohnen, was wir sonst zu verhindern
          versuchen: möglichst viele Abgaben in kurzer Zeit.
        </li>
        <li>
          <strong>Nur veröffentlichte Bewertungen nehmen teil.</strong> Eine Bewertung, die in
          der Prüfung liegt oder abgelehnt wurde, bringt kein Los.
        </li>
        <li>
          <strong>Die Ziehung ist nachrechenbar.</strong> Zu jeder Ziehung speichern wir einen
          Zufallswert und die Liste der Lose. Aus beidem ergibt sich derselbe Gewinner - wer die
          Ziehung anzweifelt, kann sie nachrechnen lassen.
        </li>
        <li>
          <strong>Benachrichtigung</strong> erfolgt über den Kontakt, mit dem die Bewertung
          bestätigt wurde. Meldet sich die gewinnende Person nicht innerhalb von vier Wochen,
          verfällt der Gewinn und wandert in die nächste Ziehung.
        </li>
        <li>
          <strong>Unter 18 Jahren</strong> brauchen wir vor der Übergabe die Zustimmung der
          Sorgeberechtigten.
        </li>
        <li>
          <strong>Ausgeschlossen</strong> sind Personen, die an SCHULINDEX mitarbeiten, sowie
          Teilnahmen, die durch falsche Angaben oder mehrfache Konten zustande kommen.
        </li>
        <li>
          <strong>Der Rechtsweg ist ausgeschlossen.</strong> Eine Barauszahlung des Gewinns gibt
          es nicht.
        </li>
        <li>
          <strong>Veranstalter</strong> ist {a.name ?? <Fehlt feld="name" />}
          {a.ort ? `, ${a.ort}` : null}. Fragen zur Verlosung beantworten wir unter der Adresse
          im <a href="/impressum">Impressum</a>.
        </li>
      </ol>

      <h2>Was mit deinen Daten geschieht</h2>
      <p>
        Für die Verlosung speichern wir nur, dass du teilnehmen möchtest - an deiner Bewertung,
        die ohnehin gespeichert ist. Ein Los enthält keine weiteren Angaben, und die
        veröffentlichte Liste der Ziehungen nennt keine Namen, keine Nummern und keine Schulen.
        Näheres steht in der <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>

      <h2>Bisherige Ziehungen</h2>
      {ziehungen.length === 0 ? (
        <p>Es wurde noch nicht gezogen. Die erste Ziehung findet nach Ablauf des Monats statt.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Ziehung</th>
              <th scope="col">Monat</th>
              <th scope="col">Teilnehmende Konten</th>
              <th scope="col">Gezogen am</th>
              <th scope="col">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {ziehungen.map((z) => (
              <tr key={z.id}>
                <td>{VERLOSUNG_LABEL[z.art]}</td>
                <td>{monatsname(z.jahr, z.monat)}</td>
                <td>{z.lose_gesamt.toLocaleString("de-DE")}</td>
                <td>{DATUM.format(z.gezogen_am)}</td>
                <td>
                  {ziehungsmeldung(
                    monatsname(z.jahr, z.monat),
                    z.lose_gesamt,
                    z.gewinner_konto_id !== null,
                    z.benachrichtigt_am !== null,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="fussnote">
        Die Liste nennt bewusst keine Angabe zur gewinnenden Person: der Teilnehmerkreis ist
        überwiegend minderjährig, und selbst eine verkürzte Telefonnummer wäre zu viel.
      </p>
    </section>
  );
}
