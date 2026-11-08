"use client";

import { useState } from "react";
import { CODE_STELLEN, istCodeform, normalisiereCode } from "@/domain/codeform";

/**
 * Die Code-Eingabe nach einer Abgabe per SMS.
 *
 * **Warum der Code und nicht der Link.** In einer SMS wird ein Link
 * umgebrochen, von manchen Geräten nicht erkannt und von Mobilfunkanbietern
 * als Spam eingestuft - vor allem aber reisst er die Person aus dem Formular
 * in einen Browser, womöglich einen anderen als den, in dem sie gerade
 * bewertet hat. Der Code bleibt im selben Fenster.
 *
 * **`inputMode="numeric"` und `autoComplete="one-time-code"`** sind kein
 * Beiwerk: Das erste holt auf dem Telefon die Zifferntastatur, das zweite
 * lässt iOS und Android den Code aus der eingegangenen SMS zum Antippen
 * anbieten. Ohne beides tippt man sechs Ziffern von Hand ab, mit Blick auf
 * eine Benachrichtigung, die den halben Bildschirm verdeckt.
 */
export function Codefeld({
  bewertungId,
  kontaktAnzeige,
  schulSlug,
}: {
  bewertungId: string;
  kontaktAnzeige: string;
  schulSlug: string;
}) {
  const [code, setzeCode] = useState("");
  const [fehler, setzeFehler] = useState<string | null>(null);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fertig, setzeFertig] = useState(false);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!istCodeform(code) || laeuft) return;
    setzeLaeuft(true);
    setzeFehler(null);
    try {
      const antwort = await fetch("/api/bestaetigung", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bewertung: bewertungId, code: normalisiereCode(code) }),
      });
      const ergebnis = (await antwort.json()) as { ok: boolean; meldung?: string };
      if (ergebnis.ok) setzeFertig(true);
      else setzeFehler(ergebnis.meldung ?? "Das hat nicht geklappt.");
    } catch {
      setzeFehler("Keine Verbindung. Versuch es gleich noch einmal.");
    } finally {
      setzeLaeuft(false);
    }
  }

  if (fertig) {
    return (
      <div className="leerzustand">
        <h2>Bestätigt</h2>
        <p>
          Danke. Deine Bewertung ist bestätigt und wird jetzt geprüft - sie erscheint danach auf
          dem Schulprofil. Von jetzt an kannst du weitere Schulen bewerten, ohne dich erneut zu
          bestätigen.
        </p>
        <a className="knopf" href={`/schule/${schulSlug}`}>Zur Schule</a>
        <a className="knopf zweitrangig" href="/konto">Deine Bewertungen</a>
      </div>
    );
  }

  return (
    <div className="leerzustand">
      <h2>Code eingeben</h2>
      <p>
        Wir haben dir eine SMS an <strong>{kontaktAnzeige}</strong> geschickt. Sie enthält{" "}
        {CODE_STELLEN} Ziffern - trag sie hier ein. Der Code gilt zehn Minuten.
      </p>

      {fehler !== null ? <p className="fehler" role="alert">{fehler}</p> : null}

      <form className="codeformular" onSubmit={absenden}>
        <label className="versteckt" htmlFor="bestaetigungscode">
          Bestätigungscode aus der SMS
        </label>
        <input
          id="bestaetigungscode"
          className="codeeingabe"
          value={code}
          onChange={(e) => setzeCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 9))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          aria-describedby="codehinweis"
          disabled={laeuft}
        />
        <button className="knopf" disabled={laeuft || !istCodeform(code)}>
          {laeuft ? "Prüfe …" : "Bestätigen"}
        </button>
      </form>

      <p className="hinweis" id="codehinweis">
        Keine SMS bekommen? Sieh nach, ob die Nummer stimmt, und fordere unter{" "}
        <a href="/konto/anmelden">Deine Bewertungen</a> eine neue an. Erst nach der Bestätigung
        wird deine Bewertung geprüft und veröffentlicht; deine Nummer erscheint nie öffentlich.
      </p>
    </div>
  );
}
