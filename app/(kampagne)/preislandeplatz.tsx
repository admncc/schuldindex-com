import { MINDESTZAHL_PROFIL, MINDESTZAHL_RANGLISTE } from "@/domain/aggregation";
import { GEWINNE, PARTNER } from "@/domain/verlosungsgewinne";
import { Suchfeld } from "../(oeffentlich)/suchfeld";
import { Gewinnekarten } from "./landeplatz";

const ZAHL = new Intl.NumberFormat("de-DE");

/**
 * Der Landeplatz, der mit dem Gewinn anfängt.
 *
 * Der Unterschied zu `/lp1` ist nicht die Ansprache, sondern die Reihenfolge:
 * Dort steht zuerst, worum es geht, und der Gewinn kommt als Zugabe danach.
 * Hier ist der Gewinn das Erste, was jemand sieht - weil er auch das Erste
 * ist, was in der Story stand, der die Person gefolgt ist. Wer aus „1.000 €
 * zu gewinnen" auf eine Seite kommt, die mit „Wie ist deine Schule wirklich?"
 * beginnt, muss erst suchen, ob er richtig ist.
 *
 * **Was auch hier nicht steht:** kein Countdown, keine erfundene Zahl von
 * Leuten, die „gerade mitmachen", keine Verknappung. Ein Gewinnspiel, das sich
 * überwiegend an Minderjährige richtet, ist genau die Stelle, an der solche
 * Mittel aufhören, ein Gestaltungsmittel zu sein. Die Beträge stehen mit ihren
 * Bedingungen daneben, nicht im Kleingedruckten - „bis zu 1.000 €" ohne den
 * Zusatz, wie man dorthin kommt, wäre schon die halbe Unwahrheit.
 *
 * Und ein Satz, der weder aus Vorsicht noch aus Pflicht dort steht, sondern
 * weil er stimmt: Die Teilnahme ist freiwillig, und die Bewertung zählt
 * genauso ohne sie. Wer das erst in den Bedingungen erfährt, hat zu Recht das
 * Gefühl, für einen Gutschein etwas unterschrieben zu haben.
 */
export function Preislandeplatz({
  schulen,
  bewertungen,
}: {
  schulen: number;
  bewertungen: number;
}) {
  return (
    <>
      <noscript>
        <p className="lp-noscript">
          Für das Bewertungsformular brauchst du JavaScript. Suche und Schulprofile funktionieren
          auch ohne.
        </p>
      </noscript>

      <section className="lp-buehne lp-preisbuehne">
        <p className="lp-marke">Jeden Monat zu gewinnen</p>
        {/* Alle drei Betraege, nicht „bis zu": Die Leiter 50 - 100 - 1.000 ist
            das Versprechen, und jede Stufe hat ihre Bedingung gleich darunter. */}
        <h1>
          {ZAHL.format(GEWINNE.normal.wertEuro)} €, {ZAHL.format(GEWINNE.super.wertEuro)} € oder{" "}
          <em>{ZAHL.format(GEWINNE.mega.wertEuro)} €</em>
        </h1>
        <p className="lp-unterzeile">
          Für eine ehrliche Bewertung deiner Schule. Anonym, in drei Minuten.
        </p>

        <Gewinnekarten />
        {/* Der Partner gehoert unter die Karten, nicht in die Augenbraue: Dort
            stand er zweizeilig ueber der Ueberschrift und nahm ihr den Auftritt.
            Und „einloesbar in ueber 500 Geschaeften" ist der Satz, der aus einem
            Betrag einen Gutschein macht, den man sich vorstellen kann. */}
        <p className="lp-klein">
          Gutscheine von {PARTNER} - einlösbar in über 500 Geschäften.
        </p>

        <div className="lp-suche">
          <Suchfeld
            platzhalter="Deine Schule oder dein Ort"
            beschriftung="Deine Schule oder dein Ort"
            knopftext="Schule finden"
            autofokus
          />
          <p className="lp-klein">
            {ZAHL.format(schulen)} Schulen in ganz Deutschland
            {bewertungen > 0 ? ` · ${ZAHL.format(bewertungen)} Bewertungen` : ""}
          </p>
        </div>

        <p className="lp-klein lp-freiwillig">
          Kostenlos. Die Teilnahme ist <strong>freiwillig</strong> - deine Bewertung zählt genauso,
          wenn du das Kästchen nicht ankreuzt. Ein Los je Konto und Monat.{" "}
          <a href="/verlosung">Teilnahmebedingungen</a>
        </p>
      </section>

      <section className="lp-schritte">
        <h2>Was du dafür tust</h2>
        <ol>
          <li>
            <strong>Schule suchen</strong>
            <span>Alle {ZAHL.format(schulen)} Schulen sind schon drin. Deine auch.</span>
          </li>
          <li>
            <strong>Ehrlich bewerten</strong>
            <span>Drei Pflichtbereiche, 31 Fragen, rund drei Minuten. Kein Name.</span>
          </li>
          <li>
            <strong>Kurz bestätigen</strong>
            <span>Eine Nachricht, ein Klick - und wenn du magst, ist dein Los drin.</span>
          </li>
        </ol>
      </section>

      {/* Wer mit einem Geldbetrag angesprochen wird, stellt als Naechstes die
          Frage nach dem Haken - und wenn die Seite sie nicht beantwortet,
          beantwortet er sie sich selbst mit „Abzocke". Deshalb steht dieser
          Abschnitt hier vor dem Warum und nicht danach. */}
      <section className="lp-vertrauen">
        <h2>Kein Haken</h2>
        <ul>
          <li>
            <strong>Es kostet nichts, und es bleibt kostenlos.</strong> Kein Abo, keine
            Rechnung, keine Weitergabe deiner Angaben an Dritte.
          </li>
          <li>
            <strong>Wir brauchen keine Adresse.</strong> Nur eine Handynummer oder E-Mail, damit
            klar ist, dass hier ein Mensch bewertet. Veröffentlicht wird sie nie.
          </li>
          <li>
            <strong>Jede Ziehung steht öffentlich.</strong> Monat, Zahl der Lose und Datum sind{" "}
            <a href="/verlosung">nachzulesen</a> - auch die, bei denen niemand teilgenommen hat.
          </li>
          <li>
            <strong>Deine Bewertung ist anonym.</strong> Nicht einmal deine Schule erfährt, wer
            was geschrieben hat.
          </li>
        </ul>
      </section>

      {/* **Der Einwand, nicht die Mission.**
          Die Frage vor dem Klick lautet nicht „warum gibt es diese Seite", sondern
          „bringt das was, wenn ausgerechnet ich das ausfülle". Der erste Entwurf
          beantwortete die erste Frage und schloss mit „Der Gutschein ist der
          Anlass, die Wertung ist der Grund" - eine huebsche Figur, die aber das
          Motiv der Leserin herabstuft, und zwar direkt vor dem Knopf. Wer mit
          einem Gutschein geworben wurde, bekommt dort einen leisen Rueffel.

          Deshalb steht hier der Einwand selbst als Ueberschrift und darunter die
          Antwort, die ihn wirklich entkraeftet: die Schwellen. Sie machen aus der
          einzelnen Bewertung einen Hebel statt einer Geste - und sie stimmen. */}
      <section className="lp-warum">
        <h2>„Bringt doch eh nichts“</h2>
        <p className="lp-unterzeile">
          Das stimmt genau so lange, wie es alle glauben. Eine einzelne Bewertung ist eine
          Meinung. Ab {MINDESTZAHL_PROFIL} hat deine Schule eine öffentliche Wertung, ab{" "}
          {MINDESTZAHL_RANGLISTE} einen Platz in den Ranglisten - und damit einen Vergleich mit
          allen anderen. Wie viele ihr noch fehlen, steht auf dem Profil deiner Schule.
        </p>
      </section>

      <section className="lp-abschluss">
        <h2>Und jetzt?</h2>
        <p className="lp-unterzeile">Such deine Schule. Der Rest dauert drei Minuten.</p>
        <div className="lp-suche">
          <Suchfeld
            platzhalter="Deine Schule oder dein Ort"
            beschriftung="Deine Schule oder dein Ort"
            knopftext="Schule finden"
          />
        </div>
      </section>
    </>
  );
}
