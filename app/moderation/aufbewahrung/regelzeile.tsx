"use client";

import { useActionState, useState } from "react";
import { regelAusfuehren, type Loeschzustand } from "./aktionen";
import type { Aufbewahrungsart } from "@/domain/aufbewahrung";

/**
 * Die Löschung einer einzelnen Regel.
 *
 * Mit Rückfrage, und die Rückfrage nennt die Zahl: „37 Datensätze löschen?“ ist
 * eine andere Frage als „Löschen?“.
 */
export default function Regelzeile({
  art,
  gegenstand,
  betroffen,
  darfLoeschen,
}: {
  art: Aufbewahrungsart;
  gegenstand: string;
  betroffen: number;
  darfLoeschen: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Loeschzustand, FormData>(regelAusfuehren, {});
  const [fragt, setzeFragt] = useState(false);

  if (zustand.erfolg) return <span className="erfolg">{zustand.erfolg}</span>;
  if (betroffen === 0) return <span className="gedaempft">nichts fällig</span>;
  if (!darfLoeschen) return <span className="gedaempft">nur die Leitung</span>;

  if (!fragt) {
    return (
      <>
        {zustand.meldung ? <span className="fehler">{zustand.meldung}</span> : null}
        <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(true)}>
          Löschen
        </button>
      </>
    );
  }

  return (
    <form action={absenden} className="loeschfrage" key={zustand.versuch ?? 0}>
      <input type="hidden" name="art" value={art} />
      <span>
        {betroffen.toLocaleString("de-DE")} Datensätze - {gegenstand.toLowerCase()} - endgültig löschen?
      </span>
      <button className="knopf gefahr klein" disabled={laeuft}>
        {laeuft ? "Wird gelöscht …" : "Ja, löschen"}
      </button>
      <button type="button" className="knopf zweitrangig klein" onClick={() => setzeFragt(false)}>
        Abbrechen
      </button>
    </form>
  );
}
