"use client";

import { useActionState } from "react";
import { anmelden, type Anmeldezustand } from "../aktionen";

export default function Anmeldeformular() {
  const [zustand, absenden, laeuft] = useActionState<Anmeldezustand, FormData>(anmelden, {});

  return (
    <form action={absenden} className="formular karte">
      {zustand.meldung ? (
        <p className="fehler" role="alert">
          {zustand.meldung}
        </p>
      ) : null}

      <label htmlFor="kennung">Kennung</label>
      <input
        id="kennung"
        name="kennung"
        autoComplete="username"
        defaultValue={zustand.kennung ?? ""}
        required
        autoFocus
      />

      <label htmlFor="passwort">Kennwort</label>
      <input id="passwort" name="passwort" type="password" autoComplete="current-password" required />

      <label htmlFor="code">Code aus der App</label>
      {/* inputMode numeric holt auf dem Telefon die Zifferntastatur; autoComplete
          one-time-code lässt iOS den Code aus der Zwischenablage anbieten. */}
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,8}"
        maxLength={8}
        required
      />

      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird geprüft …" : "Anmelden"}
      </button>
    </form>
  );
}
