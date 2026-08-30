"use client";

import { useActionState } from "react";
import type { Verlosungsart } from "@/domain/verlosungsgewinne";
import { monatZiehen, type Ziehungszustand } from "./aktionen";

/**
 * Auslöser der Ziehung.
 *
 * Bewusst mit Rückfrage: eine Ziehung lässt sich nicht rückgängig machen. Die
 * Datenbank verhindert eine zweite für denselben Monat, aber der erste Klick
 * ist endgültig.
 */
export default function Ziehungsfeld({
  jahr,
  monat,
  art,
  anzahl,
}: {
  jahr: number;
  monat: number;
  art: Verlosungsart;
  /** Wie viele Gewinne gezogen werden - steht in der Rückfrage. */
  anzahl: number;
}) {
  const [zustand, absenden, laeuft] = useActionState<Ziehungszustand, FormData>(monatZiehen, {});

  if (zustand.erfolg) return <p className="erfolg" role="status">{zustand.erfolg}</p>;

  return (
    <form
      action={absenden}
      key={zustand.versuch ?? 0}
      onSubmit={(e) => {
        if (!confirm(`${anzahl} Gewinne ziehen? Eine Ziehung lässt sich nicht zurücknehmen.`)) {
          e.preventDefault();
        }
      }}
    >
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="monat" value={monat} />
      <input type="hidden" name="art" value={art} />
      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird gezogen …" : "Jetzt ziehen"}
      </button>
      <p className="fussnote">Eine Ziehung lässt sich nicht zurücknehmen.</p>
    </form>
  );
}
