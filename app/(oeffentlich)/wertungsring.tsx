import { scorestufe } from "@/domain/scoring";

/**
 * Die Gesamtwertung als Ring.
 *
 * Es ist die eine Zahl, wegen der die Seite aufgerufen wird - sie soll aus zwei
 * Metern Entfernung lesbar sein und ihre Ampelfarbe ohne Erklärung tragen.
 *
 * Als Server-SVG und nicht als Bibliothek: Ein Kreis mit `stroke-dasharray` ist
 * kein Grund, ein Diagrammpaket auszuliefern, und die Seite soll auch ohne
 * JavaScript vollständig sein.
 *
 * Der Ring ist Dekoration und für Vorleseprogramme ausgeblendet; die Zahl
 * darunter steht als Text da und wird gelesen.
 */
const ZAHL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function Wertungsring({ wert, groesse = 132 }: { wert: number; groesse?: number }) {
  const dicke = groesse / 11;
  const radius = (groesse - dicke) / 2;
  const umfang = 2 * Math.PI * radius;
  const anteil = Math.min(1, Math.max(0, wert / 10));

  return (
    <div className="wertungsring">
      <svg width={groesse} height={groesse} aria-hidden="true" focusable="false">
        <circle
          className="kreis-hinten"
          cx={groesse / 2}
          cy={groesse / 2}
          r={radius}
          fill="none"
          strokeWidth={dicke}
        />
        <circle
          className={`kreis-vorn ${scorestufe(wert)}`}
          cx={groesse / 2}
          cy={groesse / 2}
          r={radius}
          fill="none"
          strokeWidth={dicke}
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - anteil)}
        />
      </svg>
      <span className="mitte">
        <span className="zahl">{ZAHL.format(wert)}</span>
        <span className="skala">von 10</span>
      </span>
    </div>
  );
}
