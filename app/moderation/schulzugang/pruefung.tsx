"use client";

import { useActionState, useState } from "react";
import { ablehnen, freigeben, type Pruefzustand } from "./aktionen";

export default function Pruefung({ anfrageId }: { anfrageId: string }) {
  const [frei, freigebenAbsenden, freigabeLaeuft] = useActionState<Pruefzustand, FormData>(freigeben, {});
  const [abgelehnt, ablehnenAbsenden, ablehnungLaeuft] = useActionState<Pruefzustand, FormData>(ablehnen, {});
  const [fragt, setzeFragt] = useState(false);

  if (frei.link) {
    return (
      <div className="karte">
        <p className="erfolg">Freigegeben. Der Link gilt 24 Stunden und lässt sich einmal benutzen.</p>
        <p className="hinweis">
          Schick ihn an die Schule — an die Adresse aus dem Schulverzeichnis, nicht an die
          angefragte.
          {frei.kontakt ? ` Angefragt wurde von: ${frei.kontakt}` : ""}
        </p>
        <code className="zufallswert">{frei.link}</code>
      </div>
    );
  }

  if (abgelehnt.meldung && !abgelehnt.meldung.startsWith("Bitte")) {
    return <p className="erfolg" role="status">{abgelehnt.meldung}</p>;
  }

  return (
    <div className="schrittleiste">
      {frei.meldung ? <p className="fehler" role="alert">{frei.meldung}</p> : null}

      <form action={freigebenAbsenden}>
        <input type="hidden" name="anfrage" value={anfrageId} />
        <button className="knopf klein" disabled={freigabeLaeuft}>
          {freigabeLaeuft ? "Wird freigegeben …" : "Freigeben"}
        </button>
      </form>

      {fragt ? (
        <form action={ablehnenAbsenden} className="loeschfrage" key={abgelehnt.versuch ?? 0}>
          <input type="hidden" name="anfrage" value={anfrageId} />
          <label className="feld">
            <span>Warum wird abgelehnt?</span>
            <input name="grund" placeholder="Konnte nicht bestätigt werden — Rückruf ohne Ergebnis." required />
          </label>
          {abgelehnt.meldung ? <p className="fehler">{abgelehnt.meldung}</p> : null}
          <button className="knopf gefahr klein" disabled={ablehnungLaeuft}>Ablehnen</button>
          <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(false)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(true)}>
          Ablehnen
        </button>
      )}
    </div>
  );
}
