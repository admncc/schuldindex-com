"use client";

import { useState, useTransition } from "react";
import { kontaktZeigen } from "../aktionen";

const ART_LABEL: Readonly<Record<string, string>> = {
  whatsapp: "WhatsApp-Nummer",
  sms: "Mobilnummer",
  email: "E-Mail-Adresse",
};

/**
 * Kontakt der bewertenden Person — verdeckt, bis jemand ihn ausdrücklich anfordert.
 *
 * Die Moderation braucht ihn selten: bei Rückfragen und beim Verdacht auf
 * Mehrfachkonten. Eine Oberfläche, die ihn ungefragt anzeigt, macht aus dieser
 * Ausnahme den Regelfall — und der Hinweis, dass jede Einsicht im Protokoll
 * steht, wirkt nur, solange sie eine Entscheidung ist.
 */
export default function Kontaktfeld({
  bewertungId,
  kontaktart,
}: {
  bewertungId: string;
  kontaktart: string;
}) {
  const [klartext, setzeKlartext] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  return (
    <div className="kontaktfeld">
      <strong>{ART_LABEL[kontaktart] ?? "Kontakt"}:</strong>{" "}
      {klartext === null ? (
        <>
          <button
            type="button"
            className="knopf zweitrangig klein"
            disabled={laeuft}
            onClick={() =>
              starte(async () =>
                setzeKlartext(
                  (await kontaktZeigen(bewertungId)) ?? "Sitzung abgelaufen — bitte neu anmelden.",
                ),
              )
            }
          >
            {laeuft ? "Wird geholt …" : "Einsehen"}
          </button>
          <span className="gedaempft"> Jede Einsicht wird protokolliert.</span>
        </>
      ) : (
        <code>{klartext}</code>
      )}
    </div>
  );
}
