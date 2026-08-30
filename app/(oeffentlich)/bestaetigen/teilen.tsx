"use client";

import { useState } from "react";
import { GEWINNE, PARTNER } from "@/domain/verlosungsgewinne";

/**
 * Der Teilen-Bereich nach der Bestätigung.
 *
 * Hier steht die einzige Stelle des Portals, an der jemand etwas für sich
 * selbst tun kann, indem er andere holt - und deshalb steht sie erst **nach**
 * der Bestätigung. Vorher wäre sie ein Anreiz, bevor überhaupt feststeht, dass
 * die Bewertung echt ist.
 *
 * Kopieren statt Teilen-Dialog als erste Wahl: Der Dialog des Browsers gibt es
 * nicht überall, und ein Knopf, der auf dem Rechner nichts tut, wirkt kaputt.
 * Wo es ihn gibt, steht er daneben.
 */
export function Teilen({ link, text }: { link: string; text: string }) {
  const [kopiert, setKopiert] = useState(false);
  const [teilbar] = useState(() => typeof navigator !== "undefined" && "share" in navigator);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2500);
    } catch {
      // Ohne Zwischenablage bleibt der Link im Feld stehen und lässt sich von
      // Hand markieren. Eine Fehlermeldung hilft hier niemandem.
    }
  }

  return (
    <div className="teilen">
      <h2>Hol deine Leute dazu</h2>
      <p>
        Je mehr aus deiner Schule bewerten, desto mehr sagt die Wertung aus. Und: Sobald{" "}
        <strong>eine einzige Person</strong> über deinen Link bewertet, bist du diesen Monat
        zusätzlich in der <strong>Superverlosung</strong> - {GEWINNE.super.anzahl} Gutscheine über
        je {GEWINNE.super.wertEuro} Euro von {PARTNER}.
      </p>

      <div className="linkzeile">
        <input readOnly value={link} aria-label="Dein Empfehlungslink" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="knopf" onClick={kopieren}>
          {kopiert ? "Kopiert" : "Link kopieren"}
        </button>
      </div>

      <div className="teilenwege">
        <a
          className="knopf zweitrangig klein"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener"
        >
          Über WhatsApp
        </a>
        {teilbar ? (
          <button
            type="button"
            className="knopf zweitrangig klein"
            onClick={() => void navigator.share({ text, url: link }).catch(() => {})}
          >
            Teilen …
          </button>
        ) : null}
      </div>

      <p className="fussnote">
        Der Link zählt, sobald jemand darüber eine Bewertung abgibt und diese veröffentlicht wird.
        Wer ihn nur anklickt, zählt nicht - sonst wäre die Superverlosung eine Klickzählung.
      </p>
    </div>
  );
}
