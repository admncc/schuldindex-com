"use client";

import { useActionState } from "react";
import { monatZiehen, type Ziehungszustand } from "./aktionen";

/**
 * Auslöser der Ziehung.
 *
 * Bewusst mit Rückfrage: eine Ziehung lässt sich nicht rückgängig machen. Die
 * Datenbank verhindert eine zweite für denselben Monat, aber der erste Klick
 * ist endgültig.
 */
export default function Ziehungsfeld({ jahr, monat }: { jahr: number; monat: number }) {
  const [zustand, absenden, laeuft] = useActionState<Ziehungszustand, FormData>(monatZiehen, {});

  if (zustand.erfolg) return <p className="erfolg" role="status">{zustand.erfolg}</p>;

  return (
    <form action={absenden} key={zustand.versuch ?? 0}>
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="monat" value={monat} />
      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird gezogen …" : "Jetzt ziehen"}
      </button>
      <p className="fussnote">Eine Ziehung lässt sich nicht zurücknehmen.</p>
    </form>
  );
}
