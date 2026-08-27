"use client";

import { useActionState } from "react";
import { zugangAnfordern, type Anfragezustand } from "../aktionen";

export default function Anfrageformular({
  slug,
  hatAmtlicheAdresse,
}: {
  slug: string;
  hatAmtlicheAdresse: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Anfragezustand, FormData>(zugangAnfordern, {});

  if (zustand.meldung) {
    return (
      <div className="karte">
        <p>{zustand.meldung}</p>
      </div>
    );
  }

  return (
    <form action={absenden} className="formular" key={zustand.versuch ?? 0}>
      {zustand.fehler ? <p className="fehler" role="alert">{zustand.fehler}</p> : null}
      <input type="hidden" name="schule" value={slug} />

      <label className="feld">
        <span>In welcher Funktion sprichst du für die Schule?</span>
        <textarea
          name="notiz"
          rows={3}
          defaultValue={zustand.werte?.["notiz"] ?? ""}
          placeholder="Zum Beispiel: Schulleitung, Sekretariat, Öffentlichkeitsarbeit."
          required
        />
      </label>

      <label className="feld">
        <span>E-Mail-Adresse an der Schule (falls vorhanden)</span>
        <input
          name="kontakt"
          type="email"
          defaultValue={zustand.werte?.["kontakt"] ?? ""}
          placeholder="sekretariat@deine-schule.de"
        />
        <span className="hinweis">
          {hatAmtlicheAdresse
            ? "Nur nötig, wenn im Schulverzeichnis keine Adresse hinterlegt ist. Liegt eine vor, geht der Link dorthin."
            : "Wir nehmen sie nur, wenn ihre Domäne genau zu dieser Schule gehört."}
        </span>
      </label>

      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird geprüft …" : "Zugang anfordern"}
      </button>
    </form>
  );
}
