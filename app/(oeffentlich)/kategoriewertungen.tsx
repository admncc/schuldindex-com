import { KATEGORIEN } from "@/domain/fragebogen";
import { aufZehnerskala, hoechstwert, scorestufe } from "@/domain/scoring";
import {
  MINDESTZAHL_FRAGE,
  fragenzahl,
  fragewertungen,
  type Frageangabe,
} from "@/domain/fragewertung";

/**
 * Die Wertungen der einzelnen Kategorien - und darunter, eingerückt, die
 * Einzelfragen.
 *
 * Die Gesamtwertung allein sagt zu wenig: Eine 6,5 kann eine Schule sein, an der
 * alles mittelmäßig ist, oder eine, an der der Unterricht gut und das Klima
 * schlecht ist. Für die Frage, um die es Eltern und Schülern geht, ist das der
 * ganze Unterschied.
 *
 * Dasselbe Argument endet nicht bei der Kategorie: „Ausstattung 4,2" lässt
 * offen, ob die Räume, das WLAN oder die Toiletten gemeint sind. Deshalb steht
 * unter jeder Kategorie die Aufschlüsselung nach Fragen - **zugeklappt**. Alle
 * 61 Zeilen auf einmal wären keine Auskunft mehr, sondern eine Tabelle, in der
 * die Kategoriewertung untergeht; wer es genau wissen will, klappt einen
 * Bereich auf. Ohne JavaScript funktioniert das ebenso, `details` ist ein
 * Element und kein Skript.
 *
 * Angezeigt wird nur, was beantwortet wurde. Die optionalen Kategorien fehlen
 * bei vielen Schulen, und eine leere Zeile mit „keine Angabe“ suggeriert einen
 * Mangel, wo nur niemand gefragt wurde.
 *
 * Die Gewichtung steht dabei: Wer sieht, dass „Sicherheit & Schulklima“ vierfach
 * zählt und „Umwelt & Nachhaltigkeit“ einfach, kann die Gesamtzahl einordnen -
 * sonst wirkt sie wie ein Mittelwert, der sie nicht ist.
 */

const ZAHL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const GANZ = new Intl.NumberFormat("de-DE");

export interface Kategoriewert {
  /** Mittelwert auf der internen Skala 1-5, wie er in der Datenbank steht. */
  readonly score: string | null;
  readonly kategorie: (typeof KATEGORIEN)[number]["id"];
}

/** Wie viele Bereiche freiwillig sind - nicht die Zahl 3 von Hand. */
const FREIWILLIGE_BEREICHE = KATEGORIEN.filter((k) => !k.pflicht).length;

export function Kategoriewertungen({
  werte,
  angaben = [],
}: {
  werte: readonly Kategoriewert[];
  /** Rohmittel je Frage. Fehlt die Angabe, entfällt die Aufschlüsselung. */
  angaben?: readonly Frageangabe[];
}) {
  const zeilen = werte
    .map((w) => {
      const beschreibung = KATEGORIEN.find((k) => k.id === w.kategorie);
      if (beschreibung === undefined || w.score === null) return null;
      const anzeige = aufZehnerskala(Number(w.score));
      return { id: w.kategorie, titel: beschreibung.titel, gewichtung: beschreibung.gewichtung, anzeige };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  if (zeilen.length === 0) return null;

  const fehlendeFreiwillige = KATEGORIEN.filter(
    (k) => !k.pflicht && !zeilen.some((z) => z.id === k.id),
  ).length;

  return (
    <>
      <h3>Wertung nach Kategorien</h3>
      <p className="hinweis">
        Jede Kategorie auf derselben Skala von 0 bis 10. Die Gesamtwertung ist der gewichtete
        Schnitt daraus, begrenzt durch die Vollständigkeit der Bewertung - die Gewichtung steht am
        Namen, wenn du darauf zeigst.
      </p>
      <div className="kategoriewertungen">
      {zeilen.map((z) => {
        const fragen = fragewertungen(z.id, angaben);
        const gesamt = fragenzahl(z.id);

        return (
        <div key={z.id} className="kategoriegruppe">
        <div className="kategoriewertung">
          {/* Die Gewichtung steht nur im Titel-Attribut: In der Zeile wiederholte
              sie eine Erklärung, die schon über der Liste und auf „Über uns“
              steht - und machte aus jeder zweiten Zeile einen Zweizeiler. */}
          <span className="titel" title={`Gewichtung ${z.gewichtung}-fach`}>{z.titel}</span>
          <span className="kategoriebalken" aria-hidden="true">
            <span
              className={`fuellung ${scorestufe(z.anzeige)}`}
              style={{ width: `${Math.max(2, z.anzeige * 10)}%` }}
            />
          </span>
          <span className={`zahl ${scorestufe(z.anzeige)}`}>{ZAHL.format(z.anzeige)}</span>
        </div>

        {fragen.length > 0 ? (
          <details className="fragedetails">
            <summary>
              Einzelne Fragen{" "}
              <span className="gedaempft">
                ({fragen.length} von {gesamt} ausgewertet)
              </span>
            </summary>
            <div className="fragewertungen">
              {fragen.map((f) => (
                <div key={f.id} className="fragewertung">
                  {/* Der Wortlaut, wie er gestellt wird - nicht eine Kurzform
                      davon. Eine Zeile „WLAN 3,1“ ließe offen, wonach genau
                      gefragt wurde, und damit auch, was die Zahl bedeutet. */}
                  <span className="titel">{f.text}</span>
                  <span className="kategoriebalken" aria-hidden="true">
                    <span
                      className={`fuellung ${scorestufe(f.anzeige)}`}
                      style={{ width: `${Math.max(2, f.anzeige * 10)}%` }}
                    />
                  </span>
                  <span className={`zahl ${scorestufe(f.anzeige)}`}>{ZAHL.format(f.anzeige)}</span>
                  <span className="anzahl">{GANZ.format(f.anzahl)} Angaben</span>
                </div>
              ))}
              {fragen.length < gesamt ? (
                <p className="fussnote">
                  Zu den übrigen Fragen dieses Bereichs liegen noch weniger als{" "}
                  {MINDESTZAHL_FRAGE} Angaben vor. Einzeln ausgewiesen werden sie erst darüber.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
        </div>
        );
      })}
      </div>

      {/* Wenn freiwillige Bereiche fehlen, steht die Obergrenze da - sonst
          bliebe unerklärlich, warum eine durchweg gut bewertete Schule nicht
          über 8,5 kommt. */}
      {fehlendeFreiwillige > 0 ? (
        <p className="hinweis">
          Zu {fehlendeFreiwillige === 1 ? "einem freiwilligen Bereich" : `${fehlendeFreiwillige} freiwilligen Bereichen`}{" "}
          liegt noch keine Bewertung vor. Solange das so ist, kann diese Schule höchstens{" "}
          <strong>{ZAHL.format(hoechstwert(FREIWILLIGE_BEREICHE - fehlendeFreiwillige))} von 10</strong> erreichen.
        </p>
      ) : null}
    </>
  );
}
