"use client";

import { useActionState } from "react";
import { testmailSenden, type Versandzustand } from "./aktionen";

/**
 * Der Zustand des Nachrichtenversands.
 *
 * Er steht hier, weil er die Frage beantwortet, an der das ganze Portal hängt:
 * Ohne zugestellte Bestätigung wird keine einzige Bewertung veröffentlicht.
 * Dass das lange niemandem auffiel, lag daran, dass der Fehlschlag leise war -
 * die Abgabe funktionierte, die Nachricht kam nur nie an.
 */
export default function Versandblock({
  email,
  darfAendern,
  eigeneKennung,
}: {
  email: { eingerichtet: boolean; host: string | null; absender: string | null };
  darfAendern: boolean;
  eigeneKennung: string;
}) {
  const [zustand, absenden, laeuft] = useActionState<Versandzustand, FormData>(testmailSenden, {});

  return (
    <section className="abschnitt">
      <h2>Nachrichtenversand</h2>
      <p className="hinweis">
        Jede Bewertung braucht eine Bestätigung über einen Link, und der Link geht über diesen
        Weg hinaus. Kommt er nicht an, bleibt die Bewertung unbestätigt - sichtbar wird sie dann
        nie.
      </p>

      <div className="karte">
        {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
        {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

        <ul className="hinweisliste">
          <li>
            <strong>E-Mail:</strong>{" "}
            {email.eingerichtet ? (
              <>
                eingerichtet über <code>{email.host}</code>, Absender{" "}
                <code>{email.absender}</code>
              </>
            ) : (
              <strong>nicht eingerichtet - es geht nichts hinaus</strong>
            )}
          </li>
          <li>
            <strong>WhatsApp und SMS:</strong> nicht eingerichtet. Beide brauchen Zugangsdaten
            (Meta-Freigabe beziehungsweise einen Vertrag beim SMS-Anbieter); solange sie fehlen,
            laufen beide ins Leere und das Formular sollte sie nicht anbieten.
          </li>
        </ul>

        {email.eingerichtet ? (
          <form action={absenden} className="formular">
            <div className="feld">
              <label htmlFor="testmail-an">Testnachricht an</label>
              <input
                type="email"
                id="testmail-an"
                name="an"
                autoComplete="email"
                placeholder="deine@adresse.de"
                disabled={!darfAendern || laeuft}
                required
              />
              <p className="fussnote">
                Geht denselben Weg wie eine echte Bestätigung. Landet sie im Spam statt im
                Posteingang, fehlen beim Anbieter die DNS-Einträge für SPF und DKIM - dann wird
                auch jede echte Bestätigung dort landen. Höchstens fünf je Stunde; jeder Versuch
                steht im Ereignisprotokoll unter deiner Kennung ({eigeneKennung}).
              </p>
            </div>
            <button className="knopf zweitrangig" disabled={!darfAendern || laeuft}>
              {laeuft ? "Verschicke …" : "Testnachricht verschicken"}
            </button>
          </form>
        ) : (
          <p className="fussnote">
            Einzurichten in <code>/srv/schulindex/.env</code>: <code>SMTP_HOST</code>,{" "}
            <code>SMTP_PORT</code>, <code>SMTP_BENUTZER</code>, <code>SMTP_KENNWORT</code> und{" "}
            <code>SMTP_ABSENDER</code>. Danach <code>systemctl restart schulindex</code> - die
            Werte werden beim Start gelesen.
          </p>
        )}
      </div>
    </section>
  );
}
