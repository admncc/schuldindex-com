import type { Metadata } from "next";
import { KATEGORIEN } from "@/domain/fragebogen";
import { MINDESTZAHL_PROFIL, MINDESTZAHL_RANGLISTE } from "@/domain/aggregation";
import { MINDESTZAHL_FREITEXTE } from "@/ki/pruefung";
import { SCORE_GRENZEN } from "@/domain/scoring";

export const metadata: Metadata = {
  title: "Über uns",
  description: "Wie SCHULINDEX Bewertungen prüft, wie die Wertung zustande kommt und was wir nicht speichern.",
};

const PROZENT = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });

/**
 * Die Transparenzseite.
 *
 * Ein Bewertungsportal, das nicht offenlegt, wie es rechnet, verlangt Vertrauen,
 * das es nicht begründet. Deshalb stehen hier die tatsächlichen Zahlen aus dem
 * Code - Gewichte, Schwellen, Grenzen -, nicht ihre ungefähre Beschreibung.
 */
export default function Ueberseite() {
  const gewichtssumme = KATEGORIEN.reduce((s, k) => s + k.gewichtung, 0);

  return (
    <section className="abschnitt rechtstext">
      <h1>Über SCHULINDEX</h1>
      <p>
        SCHULINDEX sammelt Bewertungen zu Schulen in Deutschland - anonym nach außen, aber
        geprüft. Wer bewertet, bleibt für alle anderen unerkannt; dass es sich um einen echten,
        einzelnen Menschen handelt, prüfen wir trotzdem.
      </p>

      <h2>Wie eine Bewertung zustande kommt</h2>
      <ol>
        <li>
          <strong>Fragebogen.</strong> {KATEGORIEN.length} Bereiche, je nach Rolle bis zu 61
          Fragen. Pflicht sind die Bereiche{" "}
          {KATEGORIEN.filter((k) => k.pflicht).map((k) => k.id).join(", ")}.
        </li>
        <li>
          <strong>Bestätigung.</strong> Über Telefon oder E-Mail. Je Kontakt und Schule ist eine
          Bewertung möglich.
        </li>
        <li>
          <strong>Automatische Prüfung.</strong> Mehrere Verfahren suchen nach Hinweisen auf
          gekaufte, mehrfach abgegebene oder maschinell erzeugte Bewertungen. Welche das im
          Einzelnen sind, steht hier bewusst nicht - eine Liste der Prüfungen wäre eine Anleitung,
          sie zu umgehen. Auffälligkeiten führen nicht zur Ablehnung, sondern zur Prüfung durch
          Menschen.
        </li>
        <li>
          <strong>Moderation.</strong> Über jede Ablehnung entscheidet ein Mensch, mit Begründung
          und Protokoll.
        </li>
      </ol>

      <h2>Wie die Wertung gerechnet wird</h2>
      <p>
        Jede Frage wird auf einer Skala von 1 bis 5 beantwortet. Innerhalb eines Bereichs bilden
        wir den Mittelwert, dann gewichten wir die Bereiche gegeneinander und rechnen das Ergebnis
        auf die Anzeigeskala von 0 bis 10 um. „Kann ich nicht beurteilen“ geht in keinen
        Mittelwert ein.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Bereich</th>
            <th scope="col">Gewicht</th>
            <th scope="col">Anteil</th>
          </tr>
        </thead>
        <tbody>
          {KATEGORIEN.map((k) => (
            <tr key={k.id}>
              <td>
                {k.id} - {k.titel}
              </td>
              <td>{k.gewichtung}</td>
              <td>{PROZENT.format(k.gewichtung / gewichtssumme)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Die Farben: ab {SCORE_GRENZEN.gut.toLocaleString("de-DE", { minimumFractionDigits: 1 })}{" "}
        gut, ab {SCORE_GRENZEN.mittel.toLocaleString("de-DE", { minimumFractionDigits: 1 })}{" "}
        durchschnittlich, darunter unterdurchschnittlich.
      </p>

      <h2>Ab wann wir etwas veröffentlichen</h2>
      <ul>
        <li>
          <strong>{MINDESTZAHL_PROFIL} Bewertungen</strong> für eine Wertung auf dem Schulprofil.
        </li>
        <li>
          <strong>{MINDESTZAHL_RANGLISTE} Bewertungen</strong> für die Aufnahme in eine Rangliste.
          Ein Rangplatz ist eine Aussage im Vergleich zu allen anderen Schulen - dafür muss die
          Zahl tragen.
        </li>
        <li>
          <strong>{MINDESTZAHL_FREITEXTE} Bewertungen mit Freitext</strong> für eine
          Zusammenfassung. Darunter ließe sich eine einzelne Stimme als „die Schülerinnen und
          Schüler berichten“ ausgeben.
        </li>
      </ul>

      <h2>Was mit Freitexten geschieht</h2>
      <p>
        Sie werden <strong>nie wörtlich veröffentlicht</strong>. Wir fassen sie mit Hilfe eines
        Sprachmodells zu wenigen Sätzen zusammen und veröffentlichen diese Zusammenfassung als
        unseren eigenen, gekennzeichneten Text. Vorher prüfen wir sie automatisiert auf Namen,
        Funktionsbezeichnungen, Klassenangaben, Kontaktdaten und Beschimpfungen; fällt sie durch,
        erscheint sie nicht, sondern geht in die Moderation.
      </p>
      <p>
        Das hat einen Preis, den wir offen nennen: mit der Veröffentlichung einer eigenen
        Zusammenfassung sind wir für diesen Text verantwortlich, nicht mehr nur Vermittler fremder
        Inhalte. Uns ist das lieber als der umgekehrte Fall, in dem Beschimpfungen und Namen
        wörtlich online stehen.
      </p>

      <h2>Was wir nicht speichern</h2>
      <ul>
        <li>
          <strong>Keine IP-Adressen von Bewertenden.</strong> Aus der Adresse wird einmal die
          Entfernung zur Schule berechnet, dann wird sie verworfen.
        </li>
        <li>
          <strong>Keine Namen.</strong> Wir fragen sie nicht ab.
        </li>
        <li>
          <strong>Keine Verfolgung über die Seiten hinweg.</strong> Keine Analysewerkzeuge, keine
          Werbenetzwerke, keine Schriften und keine Kartenkacheln von fremden Servern. Die Karte
          zeichnen wir aus unserem eigenen Schulbestand.
        </li>
      </ul>

      <h2>Woher die Schuldaten stammen</h2>
      <p>
        Aus dem offenen Datenbestand von jedeschule.codefor.de und den Schulverzeichnissen der
        Länder; fehlende Koordinaten ergänzen wir über Photon auf Grundlage von
        OpenStreetMap-Daten. Beim Import führen wir mehrfach gelieferte Schulen zusammen und
        prüfen jede Koordinate gegen Postleitzahl und Bundesland - im ersten Durchlauf lagen 24
        Schulen hunderte Kilometer neben ihrem tatsächlichen Ort.
      </p>

      <h2>Etwas stimmt nicht?</h2>
      <p>
        Falsche Stammdaten melden wir gern korrigiert - schreib uns über die Adresse im{" "}
        <a href="/impressum">Impressum</a>. Für Inhalte, die du für rechtswidrig hältst, gibt es
        das <a href="/inhalt-melden">Meldeformular</a>.
      </p>
    </section>
  );
}
