"use client";

import { useActionState, useState } from "react";
import { entscheiden, type Entscheidungszustand } from "../aktionen";
import { ABLEHNUNGSGRUENDE, AKTION_LABEL, type Aktion } from "@/domain/moderation";
import type { Zustand } from "@/domain/bewertungsstatus";

/**
 * Das Entscheidungsfeld.
 *
 * Die möglichen Aktionen richten sich nach dem Zustand: eine bereits
 * veröffentlichte Bewertung lässt sich nur noch herunternehmen, eine abgelehnte
 * gar nicht mehr ändern. Die Zustandsmaschine würde alles andere ohnehin
 * abweisen — die Oberfläche zeigt es gar nicht erst an, damit niemand auf einen
 * Knopf klickt, der nur eine Fehlermeldung bringt.
 */
function moeglicheAktionen(status: Zustand): readonly Aktion[] {
  if (status === "in_pruefung_geo" || status === "in_pruefung_betrug") {
    return ["freigeben", "ablehnen", "rueckfrage", "spam"];
  }
  if (status === "freigegeben") return ["ablehnen"];
  return [];
}

export default function Entscheidungsfeld({
  bewertungId,
  status,
}: {
  bewertungId: string;
  status: Zustand;
}) {
  const [zustand, absenden, laeuft] = useActionState<Entscheidungszustand, FormData>(entscheiden, {});
  const [aktion, setzeAktion] = useState<Aktion | null>(null);
  const aktionen = moeglicheAktionen(status);

  if (aktionen.length === 0) {
    return (
      <div className="entscheidung karte">
        <h2>Entscheidung</h2>
        <p className="gedaempft">
          Diese Bewertung ist abgeschlossen. Eine abgelehnte Bewertung bleibt abgelehnt; eine erneute
          Abgabe legt eine neue an.
        </p>
      </div>
    );
  }

  if (zustand.erledigt) {
    return (
      <div className="entscheidung karte">
        <h2>Entscheidung</h2>
        <p className="erfolg" role="status">Gespeichert.</p>
        <a className="knopf" href="/moderation">Nächster Vorgang</a>
      </div>
    );
  }

  return (
    <form action={absenden} className="entscheidung karte" key={zustand.versuch ?? 0}>
      <h2>Entscheidung</h2>
      {zustand.meldung ? (
        <p className="fehler" role="alert">{zustand.meldung}</p>
      ) : null}

      <input type="hidden" name="bewertung" value={bewertungId} />

      <fieldset>
        <legend>Was soll geschehen?</legend>
        {aktionen.map((a) => (
          <label key={a} className="auswahl">
            <input
              type="radio"
              name="aktion"
              value={a}
              checked={aktion === a}
              onChange={() => setzeAktion(a)}
              required
            />
            {AKTION_LABEL[a]}
          </label>
        ))}
      </fieldset>

      {aktion === "ablehnen" ? (
        <>
          <label htmlFor="grund">Grund</label>
          <select id="grund" name="grund" required defaultValue={zustand.grund ?? ""}>
            <option value="" disabled>Bitte wählen</option>
            {ABLEHNUNGSGRUENDE.filter((g) => g.id !== "spam").map((g) => (
              <option key={g.id} value={g.id}>{g.kurz}</option>
            ))}
          </select>
        </>
      ) : null}

      {aktion === "ablehnen" || aktion === "rueckfrage" ? (
        <>
          <label htmlFor="zusatz">
            {aktion === "rueckfrage" ? "Rückfrage" : "Zusatz zur Begründung (freiwillig)"}
          </label>
          <textarea
            id="zusatz"
            name="zusatz"
            rows={4}
            defaultValue={zustand.zusatz ?? ""}
            required={aktion === "rueckfrage"}
            placeholder={
              aktion === "rueckfrage"
                ? "Was möchtest du wissen? Der Text geht so an die Person hinaus."
                : "Ergänzt die Vorlage, ersetzt sie nicht."
            }
          />
        </>
      ) : null}

      {aktion === "spam" ? (
        <p className="hinweis">
          Lehnt mit der Vorlage „Spam“ ab, ohne weitere Angabe. Für offensichtliche Wellen gedacht.
        </p>
      ) : null}

      <button className="knopf" disabled={laeuft || aktion === null}>
        {laeuft ? "Wird gespeichert …" : "Entscheidung festhalten"}
      </button>
      <p className="fussnote">
        Jede Entscheidung wird mit Person, Zeitpunkt und Begründung protokolliert.
      </p>
    </form>
  );
}
