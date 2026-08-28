import { KATEGORIEN } from "@/domain/fragebogen";
import { aufZehnerskala, hoechstwert, scorestufe } from "@/domain/scoring";

/**
 * Die Wertungen der einzelnen Kategorien.
 *
 * Die Gesamtwertung allein sagt zu wenig: Eine 6,5 kann eine Schule sein, an der
 * alles mittelmäßig ist, oder eine, an der der Unterricht gut und das Klima
 * schlecht ist. Für die Frage, um die es Eltern und Schülern geht, ist das der
 * ganze Unterschied.
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

export interface Kategoriewert {
  /** Mittelwert auf der internen Skala 1-5, wie er in der Datenbank steht. */
  readonly score: string | null;
  readonly kategorie: (typeof KATEGORIEN)[number]["id"];
}

export function Kategoriewertungen({ werte }: { werte: readonly Kategoriewert[] }) {
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
        Schnitt daraus - die Gewichtung steht am Namen, wenn du darauf zeigst.
      </p>
      <div className="kategoriewertungen">
      {zeilen.map((z) => (
        <div key={z.id} className="kategoriewertung">
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
      ))}
      </div>

      {/* Wenn freiwillige Bereiche fehlen, steht die Obergrenze da - sonst
          bliebe unerklärlich, warum eine durchweg gut bewertete Schule nicht
          über 8,5 kommt. */}
      {fehlendeFreiwillige > 0 ? (
        <p className="hinweis">
          Zu {fehlendeFreiwillige === 1 ? "einem freiwilligen Bereich" : `${fehlendeFreiwillige} freiwilligen Bereichen`}{" "}
          liegt noch keine Bewertung vor. Solange das so ist, kann diese Schule höchstens{" "}
          <strong>{ZAHL.format(hoechstwert(3 - fehlendeFreiwillige))} von 10</strong> erreichen.
        </p>
      ) : null}
    </>
  );
}
