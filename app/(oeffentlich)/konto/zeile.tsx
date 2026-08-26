"use client";

import { useActionState, useState } from "react";
import { bewertungLoeschen, type Loeschzustand } from "./aktionen";
import type { Zustand } from "@/domain/bewertungsstatus";

/**
 * Die Schaltflächen zu einer eigenen Bewertung.
 *
 * Das Löschen fragt nach — aber nicht mit einem Browserdialog, sondern mit einer
 * zweiten Schaltfläche im Fluss der Seite. Ein `confirm()` wäre schneller
 * gebaut und auf dem Telefon leicht zu übersehen.
 */
export default function Bewertungszeile({
  bewertungId,
  schulname,
  status,
  slug,
}: {
  bewertungId: string;
  schulname: string;
  status: Zustand;
  slug: string;
}) {
  const [zustand, absenden, laeuft] = useActionState<Loeschzustand, FormData>(bewertungLoeschen, {});
  const [fragt, setzeFragt] = useState(false);

  if (zustand.geloescht) return <p className="erfolg" role="status">Gelöscht.</p>;

  return (
    <div className="schrittleiste">
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

      {/* Eine abgelehnte Bewertung lässt sich nicht ändern: aus „abgelehnt“
          führt kein Weg zurück (siehe bewertungsstatus.ts). Eine neue Abgabe
          legt eine neue Bewertung an — dafür muss die alte weg. */}
      {status !== "abgelehnt" ? (
        <a className="knopf zweitrangig klein" href={`/bewerten/${slug}?aendern=${bewertungId}`}>
          Ändern
        </a>
      ) : null}

      {fragt ? (
        <form action={absenden} className="loeschfrage">
          <input type="hidden" name="bewertung" value={bewertungId} />
          <span>Bewertung zu {schulname} wirklich löschen?</span>
          <button className="knopf klein gefahr" disabled={laeuft}>
            {laeuft ? "Wird gelöscht …" : "Ja, löschen"}
          </button>
          <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(false)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(true)}>
          Löschen
        </button>
      )}
    </div>
  );
}
