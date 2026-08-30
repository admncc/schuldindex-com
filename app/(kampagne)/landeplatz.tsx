import { GEWINNE, PARTNER, VERLOSUNGSARTEN, VERLOSUNG_LABEL } from "@/domain/verlosungsgewinne";
import { Suchfeld } from "../(oeffentlich)/suchfeld";

const ZAHL = new Intl.NumberFormat("de-DE");

/**
 * Der Landeplatz für Kampagnen.
 *
 * Eine Seite, ein Ziel: die Schule suchen und bewerten. Alles darauf zahlt auf
 * diesen einen Schritt ein, und der Weg dorthin steht dreimal auf der Seite -
 * oben, in der Mitte, unten -, weil niemand scrollt, um einen Knopf zu suchen.
 *
 * **Was hier bewusst nicht steht:** kein Countdown, keine erfundene Zahl von
 * Leuten, die „gerade bewerten“, keine Verknappung. Die Zielgruppe ist
 * überwiegend minderjährig; was hier steht, muss stimmen, auch wenn es weniger
 * drängt. Die Zahlen unten kommen aus der Datenbank, nicht aus dem Text.
 *
 * Neue Landeplätze bekommen eine eigene Adresse und dieselbe Struktur mit
 * anderer Ansprache - deshalb ist alles, was sich zwischen ihnen unterscheidet,
 * ein Argument dieser Funktion.
 */
export function Landeplatz({
  schlagzeile,
  unterzeile,
  schulen,
  bewertungen,
}: {
  schlagzeile: React.ReactNode;
  unterzeile: string;
  schulen: number;
  bewertungen: number;
}) {
  return (
    <>
      {/* Ohne JavaScript geht die Suche, das Profil und der Weg dorthin - nur
          das Formular selbst braucht es. Das gehört gesagt, bevor jemand am
          Ende feststeckt. */}
      <noscript>
        <p className="lp-noscript">
          Für das Bewertungsformular brauchst du JavaScript. Suche und Schulprofile funktionieren
          auch ohne.
        </p>
      </noscript>

      <section className="lp-buehne">
        <p className="lp-marke">Anonym. Geprüft. In drei Minuten.</p>
        <h1>{schlagzeile}</h1>
        <p className="lp-unterzeile">{unterzeile}</p>

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
      </section>

      <section className="lp-gewinne">
        <h2>Jeden Monat zu gewinnen</h2>
        <ul>
          {VERLOSUNGSARTEN.map((art) => (
            <li key={art} className={art === "mega" ? "lp-gewinn gross" : "lp-gewinn"}>
              <span className="lp-wert">{ZAHL.format(GEWINNE[art].wertEuro)} €</span>
              {/* Der Name zuerst, die Zahl dahinter: „50× Verlosung" las sich,
                  seit die normale Ziehung schlicht „Verlosung" heisst, wie eine
                  Menge Ziehungen statt einer Menge Gutscheine. */}
              <span className="lp-anzahl">
                {VERLOSUNG_LABEL[art]} · {GEWINNE[art].anzahl}{" "}
                {GEWINNE[art].anzahl === 1 ? "Gutschein" : "Gutscheine"}
              </span>
              <span className="lp-bedingung">
                {GEWINNE[art].mindestEmpfehlungen === 0
                  ? "Für Schülerinnen und Schüler, die bewerten"
                  : GEWINNE[art].mindestEmpfehlungen === 1
                    ? "Sobald eine Person über deinen Link bewertet"
                    : `Ab ${GEWINNE[art].mindestEmpfehlungen} Personen über deinen Link`}
              </span>
            </li>
          ))}
        </ul>
        <p className="lp-klein">
          Gutscheine von {PARTNER} - einlösbar in über 500 Geschäften. Teilnahme ab einer
          bestätigten Bewertung, ein Los je Konto und Monat.{" "}
          <a href="/verlosung">Teilnahmebedingungen</a>
        </p>
      </section>

      <section className="lp-schritte">
        <h2>Hilf mit, deine Schule besser zu machen</h2>
        <p className="lp-unterzeile">
          Schulen ändern sich nicht, weil jemand im Klassenchat schimpft. Sie ändern sich, wenn
          schwarz auf weiß steht, was nicht läuft - und wenn es viele sagen.
        </p>
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

      <section className="lp-vertrauen">
        <h2>Warum das sicher ist</h2>
        <ul>
          <li>
            <strong>Deine Bewertung ist anonym.</strong> Nicht einmal deine Schule erfährt, wer
            was geschrieben hat. Einzelne Bewertungen sind öffentlich nicht einsehbar - auch
            nicht für die Schule.
          </li>
          <li>
            <strong>Dein Freitext wird nie veröffentlicht.</strong> Er fließt in eine kurze
            Zusammenfassung ein - ohne Namen.
          </li>
          <li>
            <strong>Jede Bewertung wird geprüft.</strong> Erfundene fallen auf und werden
            abgelehnt. Deshalb ist die Wertung am Ende etwas wert.
          </li>
          <li>
            <strong>Wir gehören zu keiner Schule und zu keinem Ministerium.</strong>
          </li>
        </ul>
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
