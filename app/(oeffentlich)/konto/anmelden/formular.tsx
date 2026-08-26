"use client";

import { useActionState, useState } from "react";
import { linkAnfordern, type Anmeldezustand } from "../aktionen";

const ARTEN = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "E-Mail" },
] as const;

export default function Anmeldeformular() {
  const [zustand, absenden, laeuft] = useActionState<Anmeldezustand, FormData>(linkAnfordern, {});
  const [art, setzeArt] = useState<string>("whatsapp");

  if (zustand.meldung) {
    return (
      <div className="karte">
        <p>{zustand.meldung}</p>
        <p className="hinweis">
          Nichts bekommen? Dann gibt es zu diesem Kontakt kein bestätigtes Konto — oder die
          Nachricht ist noch unterwegs.
        </p>
      </div>
    );
  }

  return (
    <form action={absenden} className="formular karte" key={zustand.versuch ?? 0}>
      <div className="feld">
        <span>Wie hast du bestätigt?</span>
        <div className="wahl">
          {ARTEN.map((a) => (
            <label key={a.id} className={art === a.id ? "wahlfeld gewaehlt" : "wahlfeld"}>
              <input
                type="radio"
                name="kontaktart"
                value={a.id}
                defaultChecked={art === a.id}
                onChange={() => setzeArt(a.id)}
              />
              {a.label}
            </label>
          ))}
        </div>
      </div>

      <label className="feld">
        <span>{art === "email" ? "E-Mail-Adresse" : "Handynummer"}</span>
        <input
          name="kontakt"
          type={art === "email" ? "email" : "tel"}
          autoComplete={art === "email" ? "email" : "tel"}
          defaultValue={zustand.kontakt ?? ""}
          placeholder={art === "email" ? "du@beispiel.de" : "0170 1234567"}
          required
        />
      </label>

      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird geschickt …" : "Anmeldelink schicken"}
      </button>
    </form>
  );
}
