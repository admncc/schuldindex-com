import { KATEGORIEN } from "@/domain/fragebogen";
import { aufZehnerskala, erreichteObergrenze, scorestufe } from "@/domain/scoring";
import {
  BLOCKGROESSE,
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
  anzahl = 0,
}: {
  werte: readonly Kategoriewert[];
  /** Rohmittel je Frage. Fehlt die Angabe, entfällt die Aufschlüsselung. */
  angaben?: readonly Frageangabe[];
  /** Wie viele Bewertungen die Schule hat - für die Abdeckung der Bereiche. */
  anzahl?: number;
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

  /**
   * Die tatsächlich erreichbare Obergrenze - mit der Abdeckung, nicht ohne.
   *
   * Vorher rechnete der Hinweis mit `hoechstwert()` und hing daran, ob ein
   * Bereich **ganz** fehlt. Die Deckelung kommt aber aus `erreichteObergrenze()`
   * und gewichtet zusätzlich, wie viele Bewertende den Bereich beurteilt haben.
   * Eine Schule, in der eine einzige Person D, E und F beantwortet hat, zeigte
   * sechs Balken, keinen Hinweis - und eine Gesamtwertung von 8,6, obwohl
   * jeder einzelne Balken auf 10 stand. Genau die unerklärliche Zahl, gegen
   * die der Hinweis geschrieben wurde.
   *
   * Die Abdeckung kommt aus der Zahl der Angaben je Frage: Wie viele der
   * ausgewerteten Bewertungen haben in diesem Bereich überhaupt etwas
   * angekreuzt. Bezugsgrösse ist der ausgewertete Block, nicht die
   * Gesamtzahl - sonst käme nie 100 % heraus.
   */
  const ausgewertet = Math.floor(anzahl / BLOCKGROESSE) * BLOCKGROESSE;
  const freiwilligeMitAbdeckung = werte.flatMap((w) => {
    const beschreibung = KATEGORIEN.find((k) => k.id === w.kategorie);
    if (beschreibung === undefined || beschreibung.pflicht || w.score === null) return [];
    const inBereich = angaben.filter((a) => a.frage.startsWith(w.kategorie));
    const hoechste = inBereich.reduce((n, a) => Math.max(n, a.anzahl), 0);
    return [{ wert: Number(w.score), anteil: ausgewertet > 0 ? hoechste / ausgewertet : 0 }];
  });
  const obergrenze =
    ausgewertet > 0 && angaben.length > 0 ? erreichteObergrenze(freiwilligeMitAbdeckung) : null;

  return (
    <>
      <h3>Wertung nach Kategorien</h3>
      <p className="hinweis">
        Jede Kategorie auf derselben Skala von 0 bis 10. Die Gesamtwertung ist der gewichtete
        Schnitt daraus, begrenzt durch die Vollständigkeit der Bewertung - die Gewichtung steht am
        Namen, wenn du darauf zeigst. In „Sicherheit &amp; Schulklima" zählen die beiden Fragen nach
        der Häufigkeit von Mobbing und Gewalt zusammen zu drei Zehnteln; deshalb kann der Wert der
        Kategorie neben den einzelnen Fragen darunter überraschen.
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
                  <span className="titel">
                    {f.text}
                    {/* Ohne diesen Zusatz stand an der sichersten Schule
                        „Wie häufig erlebst du Mobbing … 10,0" - gerechnet
                        richtig, gelesen das Gegenteil. */}
                    {f.invertiert ? (
                      <span className="richtung"> je seltener, desto besser</span>
                    ) : null}
                  </span>
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
              <p className="fussnote">
                {fragen.length < gesamt
                  ? `Zu den übrigen Fragen dieses Bereichs liegen noch weniger als ${MINDESTZAHL_FRAGE} Angaben vor. Einzeln ausgewiesen werden sie erst darüber. `
                  : ""}
                Die Aufschlüsselung rückt in Schritten von {BLOCKGROESSE} Bewertungen weiter - die
                jüngsten sind hier noch nicht enthalten. In der Kategoriewertung darüber sind sie
                es.
              </p>
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
      {obergrenze !== null && obergrenze < 9.95 ? (
        <p className="hinweis">
          {fehlendeFreiwillige > 0 ? (
            <>
              Zu{" "}
              {fehlendeFreiwillige === 1
                ? "einem freiwilligen Bereich"
                : `${fehlendeFreiwillige} von ${FREIWILLIGE_BEREICHE} freiwilligen Bereichen`}{" "}
              liegt noch keine Bewertung vor.{" "}
            </>
          ) : (
            <>Die freiwilligen Bereiche hat bisher nur ein Teil der Bewertenden beurteilt. </>
          )}
          Solange das so ist, kann diese Schule höchstens{" "}
          <strong>{ZAHL.format(obergrenze)} von 10</strong> erreichen - auch dann, wenn jede
          einzelne Kategorie oben steht.
        </p>
      ) : null}
    </>
  );
}
