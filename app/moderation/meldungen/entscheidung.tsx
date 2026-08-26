"use client";

import { useActionState } from "react";
import { entscheiden, type Entscheidungszustand } from "./aktion";

export default function Meldungsentscheidung({ meldungId }: { meldungId: string }) {
  const [zustand, absenden, laeuft] = useActionState<Entscheidungszustand, FormData>(entscheiden, {});

  if (zustand.erledigt) return <p className="erfolg" role="status">Entschieden und vermerkt.</p>;

  return (
    <form action={absenden} className="entscheidung" key={zustand.versuch ?? 0}>
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}
      <input type="hidden" name="meldung" value={meldungId} />

      <label htmlFor={`b-${meldungId}`}>Begründung für die meldende Person</label>
      <textarea
        id={`b-${meldungId}`}
        name="begruendung"
        rows={3}
        defaultValue={zustand.text ?? ""}
        placeholder="Was wurde geprüft, und was folgt daraus?"
        required
      />
      <p className="fussnote">
        Der Hinweis auf Rechtsbehelfe wird automatisch angehängt.
      </p>

      <div className="schrittleiste">
        <button className="knopf" name="status" value="erledigt" disabled={laeuft}>
          Inhalt entfernt
        </button>
        <button className="knopf zweitrangig" name="status" value="abgelehnt" disabled={laeuft}>
          Kein Verstoß
        </button>
      </div>
    </form>
  );
}
