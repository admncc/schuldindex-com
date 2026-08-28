/**
 * Das Zeichen des Portals.
 *
 * Zwei Formen, mehr nicht: ein Schuldach und darunter drei ansteigende Balken.
 * Das Dach sagt „Schule“, die Balken sagen „Wertung“ - zusammen ergeben sie
 * genau das, was das Portal tut, und man erkennt es noch bei 16 Pixeln.
 *
 * Bewusst nicht: ein Buchstabe im Kreis (austauschbar), eine Sprechblase
 * (jedes Bewertungsportal hat eine), ein Doktorhut (steht für Abschluss, nicht
 * für Schulalltag).
 *
 * Als eingebettetes SVG statt als Bilddatei: Es erbt die Textfarbe, ist im
 * dunklen Modus ohne zweite Fassung richtig, wird nicht separat geladen und
 * bleibt bei jeder Größe scharf. Der höchste Balken trägt die Akzentfarbe -
 * ein Farbtupfer, der zugleich die Leserichtung vorgibt.
 */
export function Markenzeichen({ groesse = 26 }: { groesse?: number }) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="markenzeichen"
    >
      {/* Das Dach - eine offene Linie, kein geschlossenes Haus: Ein Haus wäre
          Immobilie, das Dach allein ist Schule. */}
      <path
        d="M3.5 13.5 16 4l12.5 9.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="7" y="21" width="4.6" height="7" rx="1.6" fill="currentColor" opacity="0.45" />
      <rect x="13.7" y="18" width="4.6" height="10" rx="1.6" fill="currentColor" opacity="0.7" />
      <rect x="20.4" y="14.6" width="4.6" height="13.4" rx="1.6" className="hoechster" />
    </svg>
  );
}
