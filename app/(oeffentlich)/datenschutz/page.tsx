import type { Metadata } from "next";
import { betreiber } from "@/recht/betreiber";
import { GUELTIG_STUNDEN } from "@/domain/verifizierung";
import { MINDESTZAHL_FREITEXTE } from "@/ki/pruefung";
import { fristtext, regel, REGELN } from "@/domain/aufbewahrung";
import { hostsAus } from "@/domain/einbettung";
import { holeEinbettungenFuerSeite } from "@/db/einbettungen";
import { Angabe, Anschrift, Fehlt, Vertreteranschrift } from "../rechtsteile";

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
export default async function Datenschutzseite() {
  const a = betreiber();

  // **Warum der Abschnitt zur Einwilligung nicht fest im Text steht.**
  // Das Banner und die Messung werden im Panel eingetragen, nicht im Code.
  // Ein fester Absatz wuerde entweder etwas nennen, was nicht laeuft, oder
  // etwas verschweigen, was laeuft - und beides ist ein Datenschutzmangel.
  // Deshalb liest die Erklaerung dieselbe Quelle wie die Auslieferung.
  const einbettungen = await holeEinbettungenFuerSeite();
  const bannerAktiv = einbettungen.einwilligung?.aktiv ?? false;
  const messungAktiv = bannerAktiv && (einbettungen.messung?.aktiv ?? false);
  const fremdeHosts = hostsAus(
    [
      bannerAktiv ? einbettungen.einwilligung?.inhalt : undefined,
      messungAktiv ? einbettungen.messung?.inhalt : undefined,
    ].filter((x): x is string => typeof x === "string"),
  );

  return (
    <section className="abschnitt rechtstext">
      <h1>Datenschutzerklärung</h1>
      <p className="stand">Stand: 8. November 2026</p>

      <h2>1. Wer verantwortlich ist</h2>
      <Anschrift angaben={a} />
      {/* Der Vertreter in der Union gehoert auch hierher und nicht nur ins
          Impressum: Art. 27 Abs. 4 DSGVO sagt, dass Betroffene sich an ihn
          wenden koennen - das muessen sie dort erfahren, wo sie ihre Rechte
          nachlesen. */}
      {a.land !== null && a.land !== "Deutschland" ? (
        <>
          <p>Vertreter in der Europäischen Union nach Art. 27 DSGVO:</p>
          {a.euVertreter === null ? (
            <p>
              <Fehlt feld="euVertreter" />
            </p>
          ) : (
            <Vertreteranschrift wert={a.euVertreter} />
          )}
        </>
      ) : null}
      {a.datenschutzbeauftragter ? (
        <p>Datenschutzbeauftragte Person: {a.datenschutzbeauftragter}.</p>
      ) : null}

      <h2>2. Was beim bloßen Besuch passiert</h2>
      {/* **Dieser Absatz behauptete bis zuletzt das Gegenteil.** Er sagte
          „nichts von fremden Servern" und „deine IP-Adresse geht an niemanden
          ausser an den Server, der die Seite ausliefert". Das stimmte, solange
          die Seite direkt ausgeliefert wurde. Seit Cloudflare als Proxy
          davorsteht, laeuft jede Anfrage ueber einen Dritten - und damit war
          der Satz falsch, und zwar an der empfindlichsten Stelle einer
          Datenschutzerklaerung: beim Versprechen, dass nichts weitergeht.

          Was hier jetzt steht, haengt an drei Angaben und nicht an meiner
          Erinnerung: an den im Panel eingetragenen Einbettungen, am Schalter
          `CLOUDFLARE_ZAEHLER` und am Sitz des Verantwortlichen. */}
      <p>
        <strong>Cloudflare steht unserem Server vor.</strong> Jede Anfrage an schulindex.com
        läuft zuerst über Cloudflare (Cloudflare Germany GmbH, Rosental 7, 80331 München);
        Cloudflare entschlüsselt sie dort, prüft sie auf Angriffe und reicht sie an uns weiter.
        Dabei verarbeitet Cloudflare deine IP-Adresse.{" "}
        {/* „an sonst niemanden" war hier eine Zusage, die eine eingeschaltete
            Messung sofort gebrochen haette: Auch sie sieht die IP-Adresse. */}
        <strong>
          Deine IP-Adresse geht damit an Cloudflare und an unseren Server
          {a.cloudflareZaehler || messungAktiv
            ? " - und, soweit du zugestimmt hast, an die in Abschnitt 2.2 genannte Messung"
            : " - an sonst niemanden"}
          .
        </strong>{" "}
        Grundlage ist ein
        Auftragsverarbeitungsvertrag nach Art. 28 DSGVO; unser berechtigtes Interesse nach
        Art. 6 Abs. 1 lit. f DSGVO ist der Schutz vor Überlastung und Angriffen.
      </p>
      <p>
        Von <strong>fremden Servern</strong> laden diese Seiten{" "}
        {fremdeHosts.length === 0 && !a.cloudflareZaehler ? (
          <>
            <strong>nichts</strong>: keine Schriften, keine Kartenkacheln, keine
            Analysewerkzeuge, keine Werbenetzwerke, keine Werbe- oder Analysecookies.
          </>
        ) : (
          <>
            nur{" "}
            {[
              ...(a.cloudflareZaehler ? ["den Zähler von Cloudflare (siehe unten)"] : []),
              ...(fremdeHosts.length > 0 ? ["das, was in Abschnitt 2.2 steht"] : []),
            ].join(" und ")}
            {fremdeHosts.length > 0 ? (
              <>
                {" ("}
                {fremdeHosts.map((h, i) => (
                  <span key={h}>
                    {i > 0 ? ", " : ""}
                    <code>{h}</code>
                  </span>
                ))}
                {")"}
              </>
            ) : null}
            . Keine Schriften, keine Kartenkacheln und keine Werbenetzwerke von Dritten.
          </>
        )}{" "}
        Alles Übrige - Schriften, Karte, Bilder - kommt von unserem eigenen Server.
      </p>
      {a.cloudflareZaehler ? (
        <p>
          <strong>Reichweitenmessung von Cloudflare:</strong> Cloudflare zählt die
          Seitenaufrufe. Dafür lädt dein Browser ein kleines Skript von{" "}
          <code>static.cloudflareinsights.com</code>. Gemessen werden aufgerufene Seite,
          Verweisquelle, Land, Geräteklasse und Ladezeiten.{" "}
          <strong>Dabei wird nichts auf deinem Gerät gespeichert</strong> - kein Cookie, keine
          Kennung, nichts, woran du bei einem zweiten Besuch wiedererkannt würdest. Eine
          Verfolgung über mehrere Seitenbesuche oder über andere Webseiten hinweg findet nicht
          statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse
          ist zu wissen, ob das Portal benutzt wird. Du kannst dem nach Art. 21 DSGVO
          widersprechen.
        </p>
      ) : null}

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
        angefragte Adresse, Browserkennung). Sie dienen dem Betrieb, der Abwehr von Angriffen und
        der nachträglichen Aufklärung von Manipulationsversuchen. Rechtsgrundlage ist Art. 6
        Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist ein Portal, dessen Wertungen nicht
        gefälscht sind. <strong>Warum wir sie länger aufbewahren, als für die reine
        Angriffsabwehr nötig wäre:</strong> Der Versuch, die Wertung einer Schule zu drehen,
        geschieht nicht an einem Nachmittag, sondern über Wochen - und fällt erst auf, wenn das
        Muster erkennbar wird. Ohne Protokolle aus dieser Zeit lässt sich danach nicht mehr
        klären, was geschehen ist. Betrieben wird der Server von{" "}
        {a.hoster ?? <Fehlt feld="hoster" />}; die Protokolle werden nach{" "}
        {a.protokollfrist ?? <Fehlt feld="protokollfrist" />} gelöscht.
      </p>

      {/* **Dieser Abschnitt richtet sich nach dem, was eingetragen ist.**
          Banner und Messung kommen aus dem Panel; ein fest geschriebener Text
          wuerde entweder etwas nennen, was nicht laeuft, oder etwas
          verschweigen, was laeuft. */}
      <h3 id="einwilligung">2.2 Einwilligung, Banner und Reichweitenmessung</h3>
      {!bannerAktiv ? (
        <>
          <p>
            <strong>Zurzeit fragen wir dich nicht nach einer Einwilligung</strong> - weil es
            nichts zu fragen gibt. Es laufen keine Werbenetzwerke, keine Analysedienste und keine
            Dienste, die dich über mehrere Seiten hinweg wiedererkennen. Was auf deinem Gerät
            abgelegt wird, steht vollständig in Abschnitt 2.1 und ist für den Betrieb
            erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); dafür ist nach dem Gesetz keine Einwilligung
            nötig und deshalb auch kein Banner.
          </p>
          <p>
            Sollte sich das ändern, erscheint ein Banner, das <em>vorher</em> fragt - und dieser
            Abschnitt nennt dann den Anbieter, die Daten und die Widerrufsmöglichkeit.
          </p>
        </>
      ) : (
        <>
          <p>
            Beim ersten Aufruf fragt dich ein <strong>Einwilligungsbanner</strong>, ob du mit der
            Reichweitenmessung einverstanden bist. Bis du zustimmst, wird nichts gemessen und
            nichts dafür auf deinem Gerät gespeichert. Das Banner stammt von einem
            Dienstleister; dafür lädt dein Browser ein Skript von{" "}
            {fremdeHosts.map((h, i) => (
              <span key={h}>
                {i > 0 ? ", " : ""}
                <code>{h}</code>
              </span>
            ))}
            . Rechtsgrundlage für das Speichern und Auslesen auf deinem Gerät ist § 25 Abs. 1
            TDDDG, für die anschließende Verarbeitung Art. 6 Abs. 1 lit. a DSGVO - also deine
            Einwilligung und nichts anderes.
          </p>
          <p>
            <strong>Du kannst jederzeit widerrufen</strong>, so einfach wie du zugestimmt hast
            (Art. 7 Abs. 3 DSGVO): über „Cookie-Einstellungen" unten auf jeder Seite. Ein
            Widerruf wirkt ab sofort; was bis dahin gemessen wurde, bleibt beim Anbieter, bis
            dessen Frist abgelaufen ist. Wenn du ablehnst, fragen wir nicht bei jedem Aufruf
            erneut.
          </p>
          <p>
            <strong>Deine Bewertung ist davon nicht berührt.</strong> Die Messung erfährt nicht,
            welche Schule du bewertet hast, was du geschrieben hast oder wie du dich entschieden
            hast - sie zählt Seitenaufrufe. Dein Kontakt, dein Freitext und deine Antworten gehen
            nie an den Anbieter. Auf den Seiten, über die eine Bewertung bestätigt wird, lädt
            auch das Banner nicht: In deren Adresse steht ein Geheimnis, und das hat bei einem
            Dritten nichts zu suchen.
          </p>
          {/* Das ist die unangenehme Stelle - und sie gehoert deshalb in den
              Text und nicht in eine Fussnote. Art. 8 DSGVO macht die
              Einwilligung einer Person unter 16 ohne die Eltern unwirksam, und
              das Publikum dieses Portals ist ueberwiegend minderjaehrig. */}
          <p>
            <strong>Wenn du unter 16 Jahre alt bist:</strong> Deine Einwilligung in die Messung
            ist nach Art. 8 DSGVO nur wirksam, wenn deine Eltern einverstanden sind - genauso wie
            beim Bewerten selbst. Frag sie, oder lehn im Banner ab. Das Portal funktioniert
            vollständig ohne Zustimmung; du verlierst dadurch nichts, und an deiner Bewertung
            oder deiner Teilnahme an der Verlosung ändert sich nichts.
          </p>
          {messungAktiv ? (
            <p>
              <strong>Was die Messung erhebt:</strong> aufgerufene Seiten, Verweisquelle
              (also woher du kamst), ungefähren Ort auf Landes- oder Stadtebene, Geräte- und
              Browserklasse sowie eine zufällige Kennung, an der dein Browser bei einem zweiten
              Besuch wiedererkannt wird. Nicht erhoben werden Name, Adresse, Telefonnummer oder
              E-Mail - diese Angaben kennt die Messung nicht, weil wir sie ihr nicht geben. Die
              Daten werden auch in die USA übermittelt; was dafür gilt, steht in Abschnitt 5.1.
            </p>
          ) : null}
        </>
      )}

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
        <li>
          <strong>Auslieferung und Schutz vor Angriffen:</strong> Cloudflare Germany GmbH, als
          Auftragsverarbeiter nach Art. 28 DSGVO (Abschnitt 2).
        </li>
        {messungAktiv ? (
          <li>
            <strong>Reichweitenmessung:</strong> der Anbieter der in Abschnitt 2.2 genannten
            Messung - aber nur, wenn du im Banner zugestimmt hast. Ohne Zustimmung wird dort
            nichts hingeschickt.
          </li>
        ) : null}
      </ul>
      <p>Eine Weitergabe zu Werbezwecken findet nicht statt. Wir verkaufen keine Daten.</p>

      {/* **Fehlte bis zuletzt vollstaendig.** Der Betreiber sitzt in Delaware -
          damit ist jede Verarbeitung durch ihn selbst eine Uebermittlung in ein
          Drittland, unabhaengig davon, wo der Server steht. Eine
          Datenschutzerklaerung, die Art. 44 ff. DSGVO nicht erwaehnt, obwohl
          der Verantwortliche ausserhalb der EU sitzt, ist nicht unvollstaendig,
          sondern falsch. */}
      <h3 id="drittland">5.1 Übermittlung in Drittländer</h3>
      <p>
        <strong>Wo die Daten liegen.</strong> Server und Datenbank stehen in der Europäischen
        Union beziehungsweise im Europäischen Wirtschaftsraum
        {a.hoster ? <> ({a.hoster})</> : null}. Deine Bewertung, dein Freitext und dein Kontakt
        verlassen diesen Raum nicht.
      </p>
      {a.land !== null && a.land !== "Deutschland" ? (
        <p>
          <strong>Wer verantwortlich ist, sitzt außerhalb der EU.</strong> Verantwortlich ist{" "}
          <Angabe angaben={a} feld="name" /> mit Sitz in{" "}
          {a.land}. Soweit Mitarbeitende von dort auf die Daten zugreifen - etwa bei der
          Moderation -, liegt darin eine Übermittlung in ein Drittland nach Art. 44 ff. DSGVO.
          Für Betroffene in der EU ist der{" "}
          {a.euVertreter ? <>in Abschnitt 1 genannte Vertreter</> : <Fehlt feld="euVertreter" />}{" "}
          erreichbar; die Zuständigkeit der europäischen Aufsichtsbehörden bleibt davon
          unberührt.
        </p>
      ) : null}
      {messungAktiv ? (
        <p>
          <strong>Reichweitenmessung.</strong> Die Messung überträgt Daten an ihren Anbieter und
          dessen Konzerngesellschaften, auch in die USA. Grundlage ist deine Einwilligung
          (Art. 6 Abs. 1 lit. a, Art. 49 Abs. 1 lit. a DSGVO) in Verbindung mit dem
          Angemessenheitsbeschluss der EU-Kommission für das EU-US Data Privacy Framework,
          soweit der Anbieter dort zertifiziert ist, sonst mit den Standardvertragsklauseln der
          EU-Kommission. Du sollst wissen, was das praktisch bedeutet: Ein vollständiger Schutz
          vor dem Zugriff US-amerikanischer Behörden lässt sich damit nicht zusichern. Wenn dir
          das zu weit geht, lehn im Banner ab - es ändert nichts an deiner Nutzung des Portals.
        </p>
      ) : null}
      <p>
        Für den Versand des Bestätigungslinks über WhatsApp gilt dasselbe: Meta Platforms
        Ireland Ltd. verarbeitet dabei auch in den USA. Du kannst stattdessen SMS oder E-Mail
        wählen - der Weg ist deine Entscheidung.
      </p>

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
              {/* Auf dem Telefon wird gestapelt und `thead` ausgeblendet -
                  ohne `data-spalte` stuende dort dreimal Text ohne Angabe,
                  was er bedeutet. Ausgerechnet in der Aufbewahrungstabelle,
                  in der die Frist die Zusage ist. */}
              <td data-spalte="Daten">{r.gegenstand}</td>
              <td data-spalte="Frist">
                {fristtext(r.tage)} ab {r.ab}
              </td>
              <td data-spalte="Warum">{r.begruendung}</td>
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
