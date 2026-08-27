import type { Metadata } from "next";
import { betreiber } from "@/recht/betreiber";
import { GUELTIG_STUNDEN } from "@/domain/verifizierung";
import { SCHWELLE_KM } from "@/domain/geopruefung";
import { MINDESTZAHL_FREITEXTE } from "@/ki/pruefung";
import { fristtext, regel, REGELN } from "@/domain/aufbewahrung";
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
            <td>
              Die <strong>Zeitabstände zwischen deinen Antwortklicks</strong>, in Millisekunden
              und in der Reihenfolge deiner Klicks (Abschnitt 3.2)
            </td>
            <td>Erkennung automatisierter Abgaben, Kalibrierung dieser Erkennung</td>
            <td>Art. 6 Abs. 1 lit. f DSGVO</td>
          </tr>
          <tr>
            <td>Zeitpunkt und Fassung deiner Einwilligungen</td>
            <td>Nachweispflicht</td>
            <td>Art. 7 Abs. 1 DSGVO</td>
          </tr>
        </tbody>
      </table>

      <h3>3.2 Wie wir automatisierten Missbrauch erkennen</h3>
      <p>
        Damit gekaufte und massenhaft erzeugte Bewertungen auffallen, messen wir beim Ausfüllen
        zwei Dinge: wie lange das Formular offenstand und wie viel Zeit zwischen zwei Antworten
        verging — letzteres auf die Millisekunde genau.
      </p>
      <p>
        <strong>Diese Zeitabstände speichern wir vollständig</strong>, in der Reihenfolge deiner
        Klicks, zusammen mit deiner Bewertung. Der Grund ist die Kalibrierung: Woran sich ein
        Skript von einem Menschen unterscheidet, lässt sich nur an echten Verläufen lernen, und
        aus zusammengefassten Zahlen lässt es sich nicht mehr lernen. Wir sagen dir das so
        deutlich, weil daraus mehr folgt, als es zunächst klingt: Die Fragen erscheinen in fester
        Reihenfolge — aus dem Verlauf lässt sich also ablesen, vor welcher Frage du gezögert hast,
        auch vor den Fragen zu Mobbing und Gewalt.
      </p>
      <p>
        Wer diese Daten sieht: die Moderation, wenn sie eine angehaltene Bewertung prüft, und
        zwar eingeklappt und nicht neben deinen Antworten. Wie lange sie bleiben:{" "}
        {fristtext(regel("klickfolgen_loeschen").tage)} nach der Abgabe wird der Verlauf geleert,
        deine Bewertung bleibt davon unberührt. Was aus den Abständen berechnet wurde — Anzahl,
        mittlerer Abstand, Schwankung — bleibt darüber hinaus stehen. Willst du den Verlauf
        früher los, schreib uns; wir löschen ihn ohne Rückfrage (Art. 17 DSGVO), und du kannst der
        Verarbeitung nach Art. 21 DSGVO auch insgesamt widersprechen.
      </p>
      <p>
        Diese Messungen entscheiden nichts. Fallen sie auf — etwa weil alle Abstände auf die
        Millisekunde gleich sind, was bei Menschen nicht vorkommt —, wird deine Bewertung einem
        Menschen aus unserer Redaktion vorgelegt, statt automatisch veröffentlicht oder abgelehnt
        zu werden. Rechtsgrundlage ist unser berechtigtes Interesse an belastbaren Bewertungen
        (Art. 6 Abs. 1 lit. f DSGVO). Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO
        findet nicht statt.
      </p>

      <h3>3.3 Was wir ausdrücklich nicht speichern</h3>
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

      <h3>3.4 Wenn du unter 16 Jahre alt bist</h3>
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
      {/* Diese Tabelle kommt aus demselben Regelkatalog, den der tägliche
          Aufräumlauf abarbeitet (`domain/aufbewahrung.ts`). Sie kann nicht
          auseinanderlaufen — eine Frist, die hier steht und niemand ausführt,
          wäre eine Zusage, die wir brechen. */}
      <table>
        <thead>
          <tr>
            <th scope="col">Daten</th>
            <th scope="col">Frist</th>
            <th scope="col">Warum</th>
          </tr>
        </thead>
        <tbody>
          {REGELN.map((r) => (
            <tr key={r.art}>
              <td>{r.gegenstand}</td>
              <td>
                {fristtext(r.tage)} ab {r.ab}
              </td>
              <td>{r.begruendung}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Die Löschung stößt eine Person aus unserer Redaktion an, kein Automatismus; sie wird
        protokolliert. Willst du deine Daten früher entfernen, geht das jederzeit selbst unter{" "}
        <a href="/konto">Deine Bewertungen</a> — dann wirkt es sofort und ohne Nachfrage.
      </p>
      <p>
        Veröffentlichte Bewertungen bleiben, solange sie veröffentlicht sind. Wird dein Konto
        nach {fristtext(REGELN[0]!.tage)} ohne Nutzung stillgelegt, löschen wir deinen Kontakt —
        deine Bewertungen bleiben anonym bestehen, und auch wir können sie dir danach nicht mehr
        zuordnen.
      </p>
      <p>
        Das Protokoll der Moderation — wer wann was entschieden hat — bewahren wir länger auf:
        Es ist der Nachweis, dass über jede Ablehnung ein Mensch entschieden hat, und wird bei
        einer Beschwerde nach Art. 20 DSA gebraucht. Personenbezogene Daten der bewertenden
        Personen stehen nicht darin.
      </p>

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
