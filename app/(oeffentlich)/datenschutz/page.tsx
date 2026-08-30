import type { Metadata } from "next";
import { betreiber } from "@/recht/betreiber";
import { GUELTIG_STUNDEN } from "@/domain/verifizierung";
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
 * wird, steht das auch so. Der Text ersetzt keine anwaltliche Prüfung - er ist
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
        Diese Seiten laden <strong>nichts von fremden Servern</strong> - keine Schriften, keine
        Kartenkacheln, keine Analysewerkzeuge, keine Werbenetzwerke. Deine IP-Adresse geht damit
        an niemanden außer an den Server, der die Seite ausliefert. Es gibt keine Werbe- und keine
        Analysecookies, und es wird nichts an Dritte weitergegeben.
      </p>

      <h3>2.1 Was auf deinem Gerät gespeichert wird</h3>
      <p>
        Wir legen drei Dinge auf deinem Gerät ab. Zwei davon stehen zusätzlich im lokalen
        Speicher deines Browsers, damit sie nicht verlorengehen, wenn ein Cookie gelöscht wird
        oder abläuft; sie werden von dort auch wiederhergestellt. Gestützt ist das auf § 25
        Abs. 2 Nr. 2 TDDDG (erforderlich für den von dir gewünschten Dienst), die anschließende
        Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO - unser berechtigtes Interesse ist ein
        Portal, dessen Wertungen nicht gefälscht sind. Du kannst dem nach Art. 21 DSGVO
        widersprechen.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Was</th>
            <th scope="col">Wozu</th>
            <th scope="col">Wo</th>
            <th scope="col">Wie lange</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-spalte="Was">Gerätekennung (Zufallszahl)</td>
            <td data-spalte="Wozu">
              Erkennen, ob viele Bewertungen aus demselben Browser kommen. Sie sagt nichts über
              dich aus und wird nur als Abdruck gespeichert; ein privates Fenster hat eine neue.
            </td>
            <td data-spalte="Wo">Cookie und lokaler Speicher</td>
            <td data-spalte="Wie lange">
              Cookie 1 Jahr, lokaler Speicher ohne Ablauf. Aus deiner Bewertung wird ein
              nicht rückrechenbarer Abdruck gebildet; er bleibt, solange die Bewertung besteht.
            </td>
          </tr>
          <tr>
            <td data-spalte="Was">Empfehlungskennung</td>
            <td data-spalte="Wozu">
              Nur wenn du über den Link einer anderen Person kommst: damit ihre Empfehlung zählt,
              sobald deine Bewertung veröffentlicht wird.
            </td>
            <td data-spalte="Wo">Cookie und lokaler Speicher</td>
            <td data-spalte="Wie lange">Cookie 30 Tage, lokaler Speicher ohne Ablauf</td>
          </tr>
          <tr>
            <td data-spalte="Was">Sitzungscookie</td>
            <td data-spalte="Wozu">Anmeldung bei „Deine Bewertungen“, im Schulzugang und in der Moderation.</td>
            <td data-spalte="Wo">nur Cookie</td>
            <td data-spalte="Wie lange">bis zur Abmeldung</td>
          </tr>
        </tbody>
      </table>
      <p>
        Löschen kannst du alles jederzeit über die Einstellungen deines Browsers. Wichtig:
        <strong> Cookies allein zu löschen genügt nicht</strong> - die Kennung wird aus dem
        lokalen Speicher wiederhergestellt. Wähle „Website-Daten löschen“ (oder „Cookies und
        Websitedaten“), dann ist beides weg. Die Bewertung selbst bleibt davon unberührt.
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
            <td data-spalte="Daten">Deine Antworten, deine Rolle, deine Klassenstufe oder dein Abgangsjahr</td>
            <td data-spalte="Wozu">Berechnung der Schulwertung, Veröffentlichung in zusammengefasster Form</td>
            <td data-spalte="Rechtsgrundlage">Art. 6 Abs. 1 lit. b DSGVO (Durchführung des Nutzungsverhältnisses)</td>
          </tr>
          <tr>
            <td data-spalte="Daten">
              Deine Telefonnummer oder E-Mail-Adresse - <strong>verschlüsselt</strong> (AES-256-GCM)
              und zusätzlich als nicht umkehrbarer Prüfwert
            </td>
            <td data-spalte="Wozu">
              Bestätigung deiner Bewertung, Schutz vor Mehrfachabgaben, Rückfragen der Moderation
            </td>
            <td data-spalte="Rechtsgrundlage">Art. 6 Abs. 1 lit. b und lit. f DSGVO</td>
          </tr>
          <tr>
            <td data-spalte="Daten">
              Die <strong>Entfernung in Kilometern</strong> zwischen deinem ungefähren Standort
              und der Schule sowie das Bundesland
            </td>
            <td data-spalte="Wozu">Erkennung von Bewertungen, die offensichtlich nicht aus der Region stammen</td>
            <td data-spalte="Rechtsgrundlage">Art. 6 Abs. 1 lit. f DSGVO</td>
          </tr>
          <tr>
            <td data-spalte="Daten">
              Die <strong>Zeitabstände zwischen deinen Antwortklicks</strong>, in Millisekunden
              und in der Reihenfolge deiner Klicks (Abschnitt 3.2)
            </td>
            <td data-spalte="Wozu">Erkennung automatisierter Abgaben, Kalibrierung dieser Erkennung</td>
            <td data-spalte="Rechtsgrundlage">Art. 6 Abs. 1 lit. f DSGVO</td>
          </tr>
          <tr>
            <td data-spalte="Daten">Zeitpunkt und Fassung deiner Einwilligungen</td>
            <td data-spalte="Wozu">Nachweispflicht</td>
            <td data-spalte="Rechtsgrundlage">Art. 7 Abs. 1 DSGVO</td>
          </tr>
          {/* Empfehlung und Verlosung standen hier nicht, obwohl beide dauerhaft
              speichern: die eine eine Verbindung zwischen zwei Konten, die
              andere die Kennungen aller Teilnehmenden eines Monats. Eine
              Erklärung, die zwei Verarbeitungen auslässt, ist keine. */}
          <tr>
            <td data-spalte="Daten">
              Die Verbindung zwischen deinem Konto und dem Konto der Person, über deren
              Empfehlungslink du gekommen bist, mit Zeitpunkt
            </td>
            <td data-spalte="Wozu">
              Damit die Empfehlung zählt, sobald deine Bewertung veröffentlicht ist - und damit
              auffällt, wenn jemand sich selbst wirbt
            </td>
            <td data-spalte="Rechtsgrundlage">Art. 6 Abs. 1 lit. b und lit. f DSGVO</td>
          </tr>
          <tr>
            <td data-spalte="Daten">
              Dein Empfehlungscode und - wenn du an der Verlosung teilnimmst - die Kennung deines
              Kontos in der Losliste des Monats sowie, im Gewinnfall, Platz und Zeitpunkt der
              Benachrichtigung
            </td>
            <td data-spalte="Wozu">
              Durchführung der Verlosung. Die Losliste bleibt erhalten, weil sich jede Ziehung aus
              ihr und dem Zufallswert nachrechnen lassen muss - das ist die Zusage aus den
              Teilnahmebedingungen. Ein Name steht nirgends darin.
            </td>
            <td data-spalte="Rechtsgrundlage">
              Art. 6 Abs. 1 lit. b DSGVO (Teilnahme ist freiwillig und wird gesondert angekreuzt)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>3.2 Wie wir automatisierten Missbrauch erkennen</h3>
      <p>
        Damit gekaufte und massenhaft erzeugte Bewertungen auffallen, messen wir beim Ausfüllen
        zwei Dinge: wie lange das Formular offenstand und wie viel Zeit zwischen zwei Antworten
        verging - letzteres auf die Millisekunde genau.
      </p>
      <p>
        <strong>Diese Zeitabstände speichern wir vollständig</strong>, in der Reihenfolge deiner
        Klicks, zusammen mit deiner Bewertung. Der Grund ist die Kalibrierung: Woran sich ein
        Skript von einem Menschen unterscheidet, lässt sich nur an echten Verläufen lernen, und
        aus zusammengefassten Zahlen lässt es sich nicht mehr lernen. Wir sagen dir das so
        deutlich, weil daraus mehr folgt, als es zunächst klingt: Die Fragen erscheinen in fester
        Reihenfolge - aus dem Verlauf lässt sich also ablesen, vor welcher Frage du gezögert hast,
        auch vor den Fragen zu Mobbing und Gewalt.
      </p>
      <p>
        Wer diese Daten sieht: die Moderation, wenn sie eine angehaltene Bewertung prüft, und
        zwar eingeklappt und nicht neben deinen Antworten. Wie lange sie bleiben:{" "}
        {fristtext(regel("klickfolgen_loeschen").tage)} nach der Abgabe wird der Verlauf geleert,
        deine Bewertung bleibt davon unberührt. Was aus den Abständen berechnet wurde - Anzahl,
        mittlerer Abstand, Schwankung - bleibt darüber hinaus stehen. Willst du den Verlauf
        früher los, schreib uns; wir löschen ihn ohne Rückfrage (Art. 17 DSGVO), und du kannst der
        Verarbeitung nach Art. 21 DSGVO auch insgesamt widersprechen.
      </p>
      <p>
        Diese Messungen entscheiden nichts. Fällt etwas auf, wird deine Bewertung einem Menschen
        aus unserer Redaktion vorgelegt, statt automatisch veröffentlicht oder abgelehnt zu
        werden. Welche Muster wir dabei genau betrachten, steht hier nicht - eine solche Liste
        wäre eine Anleitung, sie zu umgehen. Rechtsgrundlage ist unser berechtigtes Interesse an belastbaren Bewertungen
        (Art. 6 Abs. 1 lit. f DSGVO). Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO
        findet nicht statt.
      </p>

      <h3>3.3 Was wir ausdrücklich nicht speichern</h3>
      <ul>
        <li>
          <strong>Deine IP-Adresse bei der Abgabe.</strong> Aus ihr wird einmalig die ungefähre
          Entfernung zur Schule berechnet; danach wird sie verworfen. Liegt die Abgabe weit von
          der Schule entfernt, sieht ein Mensch sie sich an. Um die Zahl der Anfragen je Absender
          zu begrenzen, halten wir sie außerdem höchstens eine Stunde im Arbeitsspeicher des
          Servers - in die Datenbank wird sie nicht geschrieben, und ein Neustart löscht sie. In der Datenbank steht die Zahl der Kilometer,
          nicht die Adresse. Nachgeschlagen wird sie <strong>auf unserem eigenen Server</strong>,
          in einer dort gespeicherten Datenbank - kein Dienstleister erfährt, wer bewertet.
        </li>
        <li>
          <strong>Deinen Namen.</strong> Wir fragen ihn nicht ab. Bewertungen erscheinen ohne
          Personenangabe; auch die Moderation sieht an deiner Bewertung nur Rolle und
          Klassenstufe. Den hinterlegten Kontakt kann sie für Rückfragen einsehen - dafür muss
          sie ihn eigens anfordern, und <strong>jede einzelne Einsicht wird protokolliert</strong>.
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
      <p>
        Dasselbe Modell setzen wir in der Moderation ein, um Bewertungen einer Schule auf Muster
        zu prüfen, die auf gefälschte Abgaben hindeuten (Art. 6 Abs. 1 lit. f DSGVO; unser
        berechtigtes Interesse ist ein Portal, dessen Wertungen etwas wert sind). Übermittelt
        werden dabei dieselben Angaben wie oben, ergänzt um Abgabezeitpunkt und Wertung; weiterhin
        nicht deine Kontaktdaten und nicht deine Rolle. <strong>Eine Entscheidung trifft das
        Modell nicht</strong> - abgelehnt wird eine Bewertung nur von einem Menschen (siehe
        Abschnitt zu Art. 22 DSGVO).
      </p>

      <h2>5. Wer sonst noch Daten erhält</h2>
      <ul>
        <li>
          <strong>Nachrichtenversand:</strong> Zur Zustellung des Bestätigungslinks geben wir
          deine Telefonnummer an den WhatsApp Business Service (Meta Platforms Ireland Ltd.) oder
          an unseren SMS-Dienstleister weiter, beziehungsweise deine E-Mail-Adresse an unseren
          E-Mail-Dienstleister. Es wird genau ein Weg genutzt - der, den du angibst.
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
          auseinanderlaufen - eine Frist, die hier steht und niemand ausführt,
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
        <a href="/konto">Deine Bewertungen</a> - dann wirkt es sofort und ohne Nachfrage.
      </p>
      <p>
        Veröffentlichte Bewertungen bleiben, solange sie veröffentlicht sind. Wird dein Konto
        nach {fristtext(REGELN[0]!.tage)} ohne Nutzung stillgelegt, löschen wir deinen Kontakt -
        deine Bewertungen bleiben anonym bestehen, und auch wir können sie dir danach nicht mehr
        zuordnen.
      </p>
      <p>
        Das Protokoll der Moderation - wer wann was entschieden hat - bewahren wir länger auf:
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
        abgegeben hast - daran erkennen wir dich, ohne dass du deinen Namen nennen musst. Wird
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
