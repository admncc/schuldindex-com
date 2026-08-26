import type { Metadata } from "next";
import { betreiber } from "@/recht/betreiber";
import { GUELTIG_STUNDEN } from "@/domain/verifizierung";
import { SCHWELLE_KM } from "@/domain/geopruefung";
import { MINDESTZAHL_FREITEXTE } from "@/ki/pruefung";
import { Angabe, Fehlt } from "../rechtsteile";

export const metadata: Metadata = { title: "Datenschutz" };
export const dynamic = "force-dynamic";

/**
 * Die Datenschutzerklärung.
 *
 * Sie beschreibt, was das Portal **tatsächlich** tut, nicht was üblich ist.
 * Jeder Absatz hier hat eine Entsprechung im Code; wo etwas nicht gespeichert
 * wird, steht das auch so. Der Text ersetzt keine anwaltliche Prüfung — er ist
 * die Vorlage dafür, und er ist an den Stellen genau, an denen eine Kanzlei
 * sonst raten müsste.
 */
export default function Datenschutzseite() {
  const a = betreiber();

  return (
    <section className="abschnitt rechtstext">
      <h1>Datenschutzerklärung</h1>
      <p className="stand">Stand: 26. August 2026</p>

      <h2>1. Wer verantwortlich ist</h2>
      <p>
        <Angabe angaben={a} feld="name" />
        {a.rechtsform ? ` ${a.rechtsform}` : null}, <Angabe angaben={a} feld="strasse" />,{" "}
        <Angabe angaben={a} feld="plz" /> <Angabe angaben={a} feld="ort" />.
        {a.email ? (
          <>
            {" "}
            E-Mail: <a href={`mailto:${a.email}`}>{a.email}</a>.
          </>
        ) : null}
      </p>
      {a.datenschutzbeauftragter ? (
        <p>Datenschutzbeauftragte Person: {a.datenschutzbeauftragter}.</p>
      ) : null}

      <h2>2. Was beim bloßen Besuch passiert</h2>
      <p>
        Diese Seiten laden <strong>nichts von fremden Servern</strong> — keine Schriften, keine
        Kartenkacheln, keine Analysewerkzeuge, keine Werbenetzwerke. Deine IP-Adresse geht damit
        an niemanden außer an den Server, der die Seite ausliefert. Es werden auch keine Cookies
        gesetzt, solange du dich nicht anmeldest; das einzige Cookie im ganzen Portal ist das
        Sitzungscookie der internen Moderation.
      </p>
      <p>
        Beim Ausliefern entstehen Zugriffsprotokolle des Servers (IP-Adresse, Zeitpunkt,
        angefragte Adresse, Browserkennung). Sie dienen dem Betrieb und der Abwehr von Angriffen,
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Betrieben wird der Server von{" "}
        {a.hoster ?? <Fehlt feld="hoster" />}; die Protokolle werden nach{" "}
        {a.protokollfrist ?? <Fehlt feld="protokollfrist" />} gelöscht.
      </p>

      <h2>3. Wenn du eine Schule bewertest</h2>

      <h3>3.1 Was wir speichern</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Daten</th>
            <th scope="col">Wozu</th>
            <th scope="col">Rechtsgrundlage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Deine Antworten, deine Rolle, deine Klassenstufe oder dein Abgangsjahr</td>
            <td>Berechnung der Schulwertung, Veröffentlichung in zusammengefasster Form</td>
            <td>Art. 6 Abs. 1 lit. b DSGVO (Durchführung des Nutzungsverhältnisses)</td>
          </tr>
          <tr>
            <td>
              Deine Telefonnummer oder E-Mail-Adresse — <strong>verschlüsselt</strong> (AES-256-GCM)
              und zusätzlich als nicht umkehrbarer Prüfwert
            </td>
            <td>
              Bestätigung deiner Bewertung, Schutz vor Mehrfachabgaben, Rückfragen der Moderation
            </td>
            <td>Art. 6 Abs. 1 lit. b und lit. f DSGVO</td>
          </tr>
          <tr>
            <td>
              Die <strong>Entfernung in Kilometern</strong> zwischen deinem ungefähren Standort
              und der Schule sowie das Bundesland
            </td>
            <td>Erkennung von Bewertungen, die offensichtlich nicht aus der Region stammen</td>
            <td>Art. 6 Abs. 1 lit. f DSGVO</td>
          </tr>
          <tr>
            <td>Zeitpunkt und Fassung deiner Einwilligungen</td>
            <td>Nachweispflicht</td>
            <td>Art. 7 Abs. 1 DSGVO</td>
          </tr>
        </tbody>
      </table>

      <h3>3.2 Was wir ausdrücklich nicht speichern</h3>
      <ul>
        <li>
          <strong>Deine IP-Adresse bei der Abgabe.</strong> Aus ihr wird einmalig die Entfernung
          zur Schule berechnet ({SCHWELLE_KM} Kilometer sind die Schwelle für eine Prüfung durch
          Menschen); danach wird sie verworfen. In der Datenbank steht die Zahl der Kilometer,
          nicht die Adresse.
        </li>
        <li>
          <strong>Deinen Namen.</strong> Wir fragen ihn nicht ab. Bewertungen erscheinen ohne
          Personenangabe; auch die Moderation sieht nur Rolle und Klassenstufe.
        </li>
        <li>
          <strong>Den Bestätigungslink.</strong> Gespeichert wird nur ein Prüfwert davon. Wer die
          Datenbank läse, könnte fremde Bewertungen nicht bestätigen. Der Link gilt{" "}
          {GUELTIG_STUNDEN} Stunden.
        </li>
      </ul>

      <h3>3.3 Wenn du unter 16 Jahre alt bist</h3>
      <p>
        Nach Art. 8 DSGVO ist die Einwilligung Minderjähriger unter 16 Jahren nur mit Zustimmung
        der Sorgeberechtigten wirksam. Deshalb musst du beim Bewerten bestätigen, dass deine
        Eltern einverstanden sind. Wir speichern diese Bestätigung mit Zeitpunkt. Melden sich
        Sorgeberechtigte bei uns, löschen wir die Bewertung ohne weitere Nachfrage.
      </p>

      <h2>4. Was mit deinem Freitext geschieht</h2>
      <p>
        <strong>Dein Freitext wird nie wörtlich veröffentlicht.</strong> Ab{" "}
        {MINDESTZAHL_FREITEXTE} Bewertungen mit Freitext fassen wir die Texte einer Schule mit
        Hilfe eines Sprachmodells (Claude, Anthropic PBC) zu wenigen Sätzen zusammen. Der
        veröffentlichte Text ist unsere eigene Aussage, nicht deine; er nennt keine Personen und
        keine einzelnen Bewertungen. Vor der Veröffentlichung prüfen wir ihn zusätzlich
        automatisiert auf Namen, Funktionsbezeichnungen und Kontaktdaten.
      </p>
      <p>
        Für die Zusammenfassung werden die Freitexte an Anthropic PBC übermittelt, gestützt auf
        einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Verarbeitungsregion:{" "}
        {a.kiRegion ?? <Fehlt feld="kiRegion" />}. Übermittelt werden nur die Texte, nicht deine
        Kontaktdaten und nicht deine Rolle.
      </p>

      <h2>5. Wer sonst noch Daten erhält</h2>
      <ul>
        <li>
          <strong>Nachrichtenversand:</strong> Zur Zustellung des Bestätigungslinks geben wir
          deine Telefonnummer an den WhatsApp Business Service (Meta Platforms Ireland Ltd.) oder
          an unseren SMS-Dienstleister weiter, beziehungsweise deine E-Mail-Adresse an unseren
          E-Mail-Dienstleister. Es wird genau ein Weg genutzt — der, den du angibst.
        </li>
        <li>
          <strong>Hosting:</strong> {a.hoster ?? <Fehlt feld="hoster" />}, als Auftragsverarbeiter
          nach Art. 28 DSGVO.
        </li>
      </ul>
      <p>Eine Weitergabe zu Werbezwecken findet nicht statt. Wir verkaufen keine Daten.</p>

      <h2>6. Wie lange wir speichern</h2>
      <ul>
        <li>
          <strong>Konto und Kontaktdaten:</strong> bis 24 Monate nach der letzten Nutzung, danach
          automatische Löschung.
        </li>
        <li>
          <strong>Bewertungen:</strong> solange sie veröffentlicht sind, und ihre Vorfassungen,
          solange die Bewertung besteht.
        </li>
        <li>
          <strong>Abgelehnte Bewertungen:</strong> sechs Monate, damit Beschwerden nachvollziehbar
          bleiben (Art. 17 DSA).
        </li>
        <li>
          <strong>Bestätigungslinks:</strong> 30 Tage nach Ablauf.
        </li>
        <li>
          <strong>Meldungen nach Art. 16 DSA:</strong> sechs Monate nach der Entscheidung.
        </li>
      </ul>

      <h2>7. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
        (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die
        Zukunft widerrufen.
      </p>
      <p>
        Um deine Bewertung zu löschen, genügt eine Nachricht von dem Kontakt, mit dem du sie
        abgegeben hast — daran erkennen wir dich, ohne dass du deinen Namen nennen musst. Wird
        eine Bewertung gelöscht, rechnen wir die Zusammenfassung der betroffenen Schule neu; dein
        Beitrag lebt darin nicht weiter.
      </p>
      <p>
        Außerdem steht dir ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu,
        regelmäßig bei der Behörde deines Wohnsitzlandes.
      </p>

      <h2>8. Keine automatisierte Entscheidung im Einzelfall</h2>
      <p>
        Automatische Prüfungen können eine Bewertung zurückhalten, aber nicht ablehnen. Über jede
        Ablehnung entscheidet ein Mensch, und jede Entscheidung wird mit Begründung protokolliert.
        Eine Entscheidung mit rechtlicher Wirkung im Sinne von Art. 22 DSGVO trifft das System
        nicht.
      </p>
    </section>
  );
}
