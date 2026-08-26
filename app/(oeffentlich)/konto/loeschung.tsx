"use client";

import { useState } from "react";
import { kontoLoeschen } from "./aktionen";

/**
 * Kontolöschung mit Tippbestätigung.
 *
 * Anders als bei einer einzelnen Bewertung ist hier nichts wiederherstellbar,
 * und der Klick liegt neben „Überall abmelden“. Das Wort abzutippen kostet fünf
 * Sekunden und verhindert genau den Griff daneben.
 */
export default function Kontoloeschung({ anzahl }: { anzahl: number }) {
  const [offen, setzeOffen] = useState(false);
  const [wort, setzeWort] = useState("");

  if (!offen) {
    return (
      <button type="button" className="knopf zweitrangig" onClick={() => setzeOffen(true)}>
        Konto löschen
      </button>
    );
  }

  return (
    <form action={kontoLoeschen} className="loeschfrage">
      <label className="feld">
        <span>
          Tipp <strong>LÖSCHEN</strong> ein, um{" "}
          {anzahl === 0
            ? "das Konto"
            : anzahl === 1
              ? "deine Bewertung und das Konto"
              : `${anzahl} Bewertungen und das Konto`}{" "}
          zu entfernen.
        </span>
        <input value={wort} onChange={(e) => setzeWort(e.target.value)} autoComplete="off" />
      </label>
      <div className="schrittleiste">
        <button className="knopf gefahr" disabled={wort.trim().toUpperCase() !== "LÖSCHEN"}>
          Unwiderruflich löschen
        </button>
        <button type="button" className="knopf zweitrangig" onClick={() => setzeOffen(false)}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
