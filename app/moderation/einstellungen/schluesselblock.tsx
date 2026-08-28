"use client";

import { useActionState, useState } from "react";
import { schluesselEntfernen, schluesselSetzen, type Schluesselzustand } from "./aktionen";

/**
 * Der Claude-Schlüssel im Panel.
 *
 * Er wird nie angezeigt - auch nicht der gespeicherte. Was man sieht, ist der
 * Anfang und das Ende, gerade genug, um zu erkennen, ob der hinterlegte
 * Schlüssel der ist, den man in der Hand hält. Wer ihn ersetzen will, trägt
 * einen neuen ein; wer ihn nicht mehr braucht, entfernt ihn.
 */
export default function Schluesselblock({
  lage,
  darfAendern,
}: {
  lage: {
    ausUmgebung: boolean;
    inDatenbank: boolean;
    hinweis: string | null;
    gesetztAm: string | null;
    gesetztVon: string | null;
  };
  darfAendern: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Schluesselzustand, FormData>(schluesselSetzen, {});
  const [entfernen, entfernenAbsenden, entferntGerade] = useActionState<Schluesselzustand, FormData>(
    schluesselEntfernen,
    {},
  );
  const [fragt, setzeFragt] = useState(false);

  return (
    <section className="abschnitt">
      <h2>Claude-API</h2>
      <p className="hinweis">
        Für die Freitext-Zusammenfassungen auf den Schulprofilen. Ohne Schlüssel läuft alles
        andere weiter - nur der Zusammenfassungslauf bricht ab.
      </p>

      <div className="karte">
        {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
        {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}
        {entfernen.erfolg ? <p className="erfolg" role="status">{entfernen.erfolg}</p> : null}

        <ul className="hinweisliste">
          <li>
            <strong>Zustand:</strong>{" "}
            {lage.ausUmgebung
              ? "aus der Serverumgebung (ANTHROPIC_API_KEY) - diese geht vor"
              : lage.inDatenbank
                ? `hier hinterlegt: ${lage.hinweis}`
                : "kein Schlüssel hinterlegt"}
          </li>
          {lage.inDatenbank ? (
            <li>
              <strong>Gesetzt:</strong> {lage.gesetztAm}
              {lage.gesetztVon ? ` von ${lage.gesetztVon}` : ""}
              {lage.ausUmgebung ? " · wird zurzeit nicht verwendet, die Umgebung hat Vorrang" : ""}
            </li>
          ) : null}
        </ul>

        {darfAendern ? (
          <>
            <form action={absenden} className="formular" key={zustand.versuch ?? 0}>
              <label className="feld">
                <span>Neuer Schlüssel</span>
                <input
                  name="schluessel"
                  type="password"
                  autoComplete="off"
                  placeholder="sk-ant-…"
                  disabled={laeuft}
                />
              </label>
              <p className="fussnote">
                Wird verschlüsselt gespeichert und nie wieder im Klartext angezeigt - auch nicht
                hier. Wer ihn verliert, trägt einen neuen ein.
              </p>
              <button className="knopf" disabled={laeuft}>
                {laeuft ? "Wird gespeichert …" : "Schlüssel speichern"}
              </button>
            </form>

            {lage.inDatenbank ? (
              fragt ? (
                <form action={entfernenAbsenden} className="loeschfrage">
                  <span>Hinterlegten Schlüssel entfernen?</span>
                  <button className="knopf gefahr klein" disabled={entferntGerade}>
                    Ja, entfernen
                  </button>
                  <button
                    type="button"
                    className="knopf zweitrangig klein"
                    onClick={() => setzeFragt(false)}
                  >
                    Abbrechen
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="knopf zweitrangig klein"
                  onClick={() => setzeFragt(true)}
                >
                  Schlüssel entfernen
                </button>
              )
            ) : null}
          </>
        ) : (
          <p className="gedaempft">Den Schlüssel darf nur die Leitung ändern.</p>
        )}
      </div>
    </section>
  );
}
