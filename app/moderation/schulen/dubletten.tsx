"use client";

import { useActionState } from "react";
import { dublettenZusammenfuehren, type Dublettenzustand } from "./aktionen";

/**
 * Der Knopf, der Dubletten zusammenführt.
 *
 * Mit Rückfrage, wie beim Löschen der Demodaten: Der Bestand ist die Grundlage
 * von allem anderen, und eine falsche Zusammenführung fiele erst auf, wenn
 * jemand seine Schule nicht mehr findet.
 */
export function Dublettenknopf({ anzahl }: { anzahl: number }) {
  const [zustand, absenden, laeuft] = useActionState<Dublettenzustand, FormData>(
    async () => dublettenZusammenfuehren(),
    {},
  );

  return (
    <form
      action={absenden}
      onSubmit={(e) => {
        if (
          !confirm(
            `${anzahl} Gruppe${anzahl === 1 ? "" : "n"} zusammenführen? ` +
              "Je Gruppe bleibt die Schule mit den meisten Bewertungen stehen, die übrigen werden " +
              "stillgelegt. Gelöscht wird nichts - Stilllegungen lassen sich einzeln zurücknehmen.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button className="knopf zweitrangig klein" disabled={laeuft}>
        {laeuft ? "Wird zusammengeführt …" : "Dubletten zusammenführen"}
      </button>
      {zustand.erfolg ? <p className="erfolg">{zustand.erfolg}</p> : null}
      {zustand.meldung ? <p className="fehler">{zustand.meldung}</p> : null}
    </form>
  );
}
