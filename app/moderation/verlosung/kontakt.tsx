"use client";

import { useState, useTransition } from "react";
import { kontaktZeigen } from "./aktionen";

/** Wie in der Vorgangsansicht: der Kontakt bleibt verdeckt, bis jemand ihn anfordert. */
export default function Gewinnerkontakt({ ziehungId }: { ziehungId: string }) {
  const [klartext, setzeKlartext] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <div className="kontaktfeld">
      <strong>Kontakt der gewinnenden Person:</strong>{" "}
      {klartext === null ? (
        <button
          type="button"
          className="knopf zweitrangig klein"
          disabled={laeuft}
          onClick={() =>
            starte(async () =>
              setzeKlartext((await kontaktZeigen(ziehungId)) ?? "nicht verfügbar"),
            )
          }
        >
          {laeuft ? "Wird geholt …" : "Einsehen"}
        </button>
      ) : (
        <code>{klartext}</code>
      )}
    </div>
  );
}
