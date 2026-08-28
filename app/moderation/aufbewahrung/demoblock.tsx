"use client";

import { useActionState, useState } from "react";
import { demodatenLoeschen, type Loeschzustand } from "./aktionen";

/**
 * Demodaten entfernen - mit Rückfrage, die die Zahlen nennt.
 *
 * Dieselbe Form wie bei den Aufbewahrungsregeln, aus demselben Grund: „Löschen?“
 * beantwortet man leichtfertig, „550 Bewertungen und 550 Konten löschen?“ nicht.
 */
export default function Demoblock({
  bewertungen,
  konten,
  schulen,
  darfLoeschen,
}: {
  bewertungen: number;
  konten: number;
  schulen: number;
  darfLoeschen: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Loeschzustand, FormData>(demodatenLoeschen, {});
  const [fragt, setzeFragt] = useState(false);

  return (
    <div className="karte">
      <span className="beschriftung">Demodaten</span>
      {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

      {bewertungen === 0 ? (
        <p>
          Zurzeit liegen keine Demodaten vor. Erzeugen lassen sie sich auf dem Server mit{" "}
          <code>npx tsx scripts/demodaten.ts</code>.
        </p>
      ) : (
        <>
          <p>
            <strong>{bewertungen.toLocaleString("de-DE")} erfundene Bewertungen</strong> über{" "}
            {schulen.toLocaleString("de-DE")} Schulen, dazu {konten.toLocaleString("de-DE")}{" "}
            Demokonten. Sie sind in der Datenbank gekennzeichnet; gelöscht wird ausschließlich,
            was diese Kennzeichnung trägt - echte Bewertungen sind davon nicht berührt.
          </p>
          <p className="fussnote">
            Nach dem Löschen werden die Schulwertungen der betroffenen Schulen neu gerechnet.
          </p>

          {!darfLoeschen ? (
            <p className="gedaempft">Löschen darf nur die Leitung.</p>
          ) : !fragt ? (
            <button type="button" className="knopf zweitrangig" onClick={() => setzeFragt(true)}>
              Demodaten löschen
            </button>
          ) : (
            <form action={absenden} className="loeschfrage" key={zustand.versuch ?? 0}>
              <span>
                {bewertungen.toLocaleString("de-DE")} Bewertungen und{" "}
                {konten.toLocaleString("de-DE")} Konten endgültig löschen?
              </span>
              <button className="knopf gefahr" disabled={laeuft}>
                {laeuft ? "Wird gelöscht …" : "Ja, löschen"}
              </button>
              <button
                type="button"
                className="knopf zweitrangig"
                onClick={() => setzeFragt(false)}
              >
                Abbrechen
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
