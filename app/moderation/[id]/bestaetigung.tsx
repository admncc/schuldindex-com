"use client";

import { useActionState, useState } from "react";
import {
  bestaetigungErneutSenden,
  vonHandBestaetigen,
  type Bestaetigungszustand,
} from "../aktionen";

/**
 * Was mit einer Bewertung geschieht, die auf die Bestätigung wartet.
 *
 * **Zwei Wege, und die Reihenfolge ist die Aussage.** Oben der Regelweg: den
 * Link noch einmal schicken. Er kostet nichts, hebt keine Zusage auf und löst
 * den häufigsten Fall - Spamordner, volles Postfach, Tippfehler. Darunter, als
 * Ausnahme und optisch nachgeordnet, die Bestätigung von Hand.
 *
 * **Was die Bestätigung von Hand tut und was nicht.** Sie ersetzt den Klick
 * auf den Link - nicht die Prüfung danach. Die wartenden Bewertungen gehen
 * anschliessend denselben Weg wie nach einem echten Klick: Wer über der
 * Halteschwelle liegt, landet in der Moderation und wird dort einzeln
 * entschieden. Veröffentlicht wird dadurch nichts, was nach einem echten Klick
 * nicht auch veröffentlicht worden wäre. Ein Knopf, der direkt auf
 * „freigegeben" setzt, hätte die Betrugsprüfung mit übersprungen - und zwar
 * genau bei den Bewertungen, bei denen sie angeschlagen hat.
 */
export default function Bestaetigungsfeld({
  bewertungId,
  darfVonHand,
}: {
  bewertungId: string;
  darfVonHand: boolean;
}) {
  const [erneut, erneutAbsenden, sendet] = useActionState<Bestaetigungszustand, FormData>(
    bestaetigungErneutSenden,
    {},
  );
  const [hand, handAbsenden, bestaetigt] = useActionState<Bestaetigungszustand, FormData>(
    vonHandBestaetigen,
    {},
  );
  const [offen, setzeOffen] = useState(false);

  return (
    <div className="entscheidung karte">
      <h2>Wartet auf Bestätigung</h2>
      <p className="gedaempft">
        Die Person hat den Code aus der Nachricht noch nicht eingegeben. Bis dahin ist nichts
        zu entscheiden - erst mit der Bestätigung steht fest, dass der Kontakt echt ist.
      </p>

      {erneut.erfolg ? <p className="erfolg" role="status">{erneut.erfolg}</p> : null}
      {erneut.meldung ? <p className="fehler" role="alert">{erneut.meldung}</p> : null}

      <form action={erneutAbsenden} key={erneut.versuch ?? 0}>
        <input type="hidden" name="bewertung" value={bewertungId} />
        <button className="knopf" disabled={sendet}>
          {sendet ? "Verschicke …" : "Bestätigungscode erneut senden"}
        </button>
        <p className="fussnote">
          Geht an denselben Kontakt wie beim ersten Mal, als sechsstelliger Code. Der Kontakt
          wird dafür entschlüsselt, aber nicht angezeigt - er geht direkt in den Versand. Der
          alte Code wird damit hinfällig.
        </p>
      </form>

      {darfVonHand ? (
        <details className="ausnahme" open={offen} onToggle={(e) => setzeOffen(e.currentTarget.open)}>
          <summary>Von Hand bestätigen (Ausnahme)</summary>

          {hand.erfolg ? <p className="erfolg" role="status">{hand.erfolg}</p> : null}
          {hand.meldung ? <p className="fehler" role="alert">{hand.meldung}</p> : null}

          <p className="fussnote">
            Ersetzt die Eingabe des Codes, <strong>nicht die Prüfung danach</strong>: Die
            Bewertung geht anschliessend denselben Weg wie nach einem echten Klick und landet bei
            auffälligen Signalen weiterhin hier in der Moderation.
          </p>
          <p className="fussnote">
            In den Nutzungsbedingungen steht, dass jede Bewertung einen bestätigten Kontakt hat.
            Wer diesen Weg gewohnheitsmässig nimmt, hebt diese Zusage auf. Nimm ihn, wenn die
            Zustellung nachweislich gescheitert ist - und schreib auf, woran.
          </p>

          <form action={handAbsenden} key={hand.versuch ?? 0}>
            <input type="hidden" name="bewertung" value={bewertungId} />
            <label className="feld">
              <span>Begründung (steht im Protokoll)</span>
              <textarea
                name="begruendung"
                rows={3}
                required
                minLength={20}
                placeholder="Zum Beispiel: Zustellung an die angegebene Adresse scheitert dauerhaft (Bounce vom 08.11.), Kontakt telefonisch bestätigt."
                disabled={bestaetigt}
              />
            </label>
            <button className="knopf gefahr" disabled={bestaetigt}>
              {bestaetigt ? "Bestätige …" : "Kontakt von Hand bestätigen"}
            </button>
          </form>
        </details>
      ) : (
        <p className="fussnote">Von Hand bestätigen darf nur die Leitung.</p>
      )}
    </div>
  );
}
