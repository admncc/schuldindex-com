"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { beiwerk, zerlegeNachTreffer } from "@/domain/suchhervorhebung";
import type { Vorschlag } from "@/db/vorschlaege";

/**
 * Suchfeld mit Autovervollständigung.
 *
 * Das Formular bleibt ein gewöhnliches GET-Formular auf `/schulen`. Das ist
 * keine Nebensache: Ohne JavaScript - abgeschaltet, noch nicht geladen, an
 * einem schlechten Mobilfunkanschluss gescheitert - funktioniert die Suche
 * unverändert weiter, nur ohne Vorschläge. Die Vorschlagsliste ist eine Zugabe,
 * keine Voraussetzung.
 *
 * Bedienung mit der Tastatur nach dem Combobox-Muster der WAI-ARIA-Praxis:
 * Pfeil runter öffnet und wandert, Pfeil hoch zurück, Enter übernimmt den
 * markierten Vorschlag, Escape schließt die Liste ohne etwas zu ändern. Ohne
 * Markierung bleibt Enter das, was es immer war: absenden.
 */

const MINDESTZEICHEN = 2;
/** Wartezeit nach dem letzten Tastendruck. */
const VERZOEGERUNG_MS = 140;

export function Suchfeld({
  vorbelegt = "",
  platzhalter,
  knopftext,
  beschriftung,
  autofokus = false,
}: {
  vorbelegt?: string;
  platzhalter: string;
  knopftext: string;
  beschriftung: string;
  autofokus?: boolean;
}) {
  const [eingabe, setEingabe] = useState(vorbelegt);
  const [liste, setListe] = useState<Vorschlag[]>([]);
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(-1);

  const id = useId();
  const feld = useRef<HTMLInputElement>(null);
  /**
   * Was zuletzt abgeschickt wurde.
   *
   * Antworten können in anderer Reihenfolge eintreffen, als sie losgeschickt
   * wurden - die Antwort auf „gym“ kann nach der auf „gymna“ ankommen und die
   * bessere Liste überschreiben. Deshalb zählt nur die Antwort auf die zuletzt
   * gestellte Frage.
   */
  const letzteAnfrage = useRef("");
  /** Einmal geholte Listen bleiben: Rücktaste soll nicht neu laden. */
  const gedaechtnis = useRef(new Map<string, Vorschlag[]>());

  useEffect(() => {
    const begriff = eingabe.trim();
    if (begriff.length < MINDESTZEICHEN) {
      setListe([]);
      setOffen(false);
      return;
    }

    const bekannt = gedaechtnis.current.get(begriff.toLowerCase());
    if (bekannt !== undefined) {
      setListe(bekannt);
      setOffen(bekannt.length > 0);
      return;
    }

    const abbruch = new AbortController();
    const zeitgeber = setTimeout(async () => {
      letzteAnfrage.current = begriff;
      try {
        const antwort = await fetch(`/api/schulen/vorschlaege?q=${encodeURIComponent(begriff)}`, {
          signal: abbruch.signal,
        });
        const daten = (await antwort.json()) as { vorschlaege: Vorschlag[] };
        gedaechtnis.current.set(begriff.toLowerCase(), daten.vorschlaege);
        if (letzteAnfrage.current !== begriff) return;
        setListe(daten.vorschlaege);
        setOffen(daten.vorschlaege.length > 0);
        setMarkiert(-1);
      } catch {
        // Abgebrochen oder Netz weg: Das Formular bleibt benutzbar, die Liste
        // bleibt eben leer. Eine Fehlermeldung wäre hier nur im Weg.
      }
    }, VERZOEGERUNG_MS);

    return () => {
      clearTimeout(zeitgeber);
      abbruch.abort();
    };
  }, [eingabe]);

  function waehle(vorschlag: Vorschlag) {
    window.location.href = `/schule/${vorschlag.slug}`;
  }

  function beiTaste(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!offen && liste.length > 0) {
        setOffen(true);
        return;
      }
      if (liste.length === 0) return;
      const richtung = e.key === "ArrowDown" ? 1 : -1;
      // Umlaufend: Vom letzten Eintrag nach unten landet man wieder im Feld
      // (-1), und das ist die Stelle, an der man weitertippt.
      const naechster = markiert + richtung;
      setMarkiert(naechster >= liste.length ? -1 : naechster < -1 ? liste.length - 1 : naechster);
      return;
    }

    if (e.key === "Enter" && offen && markiert >= 0) {
      const gewaehlt = liste[markiert];
      if (gewaehlt !== undefined) {
        e.preventDefault();
        waehle(gewaehlt);
      }
      return;
    }

    if (e.key === "Escape" && offen) {
      e.preventDefault();
      setOffen(false);
      setMarkiert(-1);
    }
  }

  const begriff = eingabe.trim();

  return (
    <form
      className="suchzeile"
      action="/schulen"
      method="get"
      // Ohne Markierung ist Enter ein normales Absenden; die offene Liste darf
      // daran nichts ändern, sonst verliert man die Volltextsuche.
      onSubmit={() => setOffen(false)}
      role="search"
    >
      <div className="vorschlagsfeld">
        <input
          ref={feld}
          type="search"
          name="q"
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={beiTaste}
          onFocus={() => setOffen(liste.length > 0)}
          // Der Klick auf einen Vorschlag nimmt dem Feld den Fokus, bevor er
          // ankommt. Deshalb wird erst geschlossen, wenn der Fokus den ganzen
          // Block verlässt - nicht schon beim Verlassen des Feldes.
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
              setOffen(false);
              setMarkiert(-1);
            }
          }}
          placeholder={platzhalter}
          aria-label={beschriftung}
          autoComplete="off"
          autoFocus={autofokus}
          role="combobox"
          aria-expanded={offen}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={markiert >= 0 ? `${id}-eintrag-${markiert}` : undefined}
        />

        {offen && liste.length > 0 ? (
          <ul className="vorschlaege" id={`${id}-liste`} role="listbox" aria-label={beschriftung}>
            {liste.map((v, i) => (
              <li
                key={v.slug}
                id={`${id}-eintrag-${i}`}
                role="option"
                aria-selected={i === markiert}
                className={i === markiert ? "vorschlag markiert" : "vorschlag"}
                // `onMouseDown` statt `onClick`: Ein Klick käme erst nach dem
                // Fokusverlust, und dann ist die Liste schon zu.
                onMouseDown={(e) => {
                  e.preventDefault();
                  waehle(v);
                }}
                onMouseEnter={() => setMarkiert(i)}
              >
                <span className="titel">
                  {zerlegeNachTreffer(v.name, begriff).map((stueck, n) =>
                    stueck.treffer ? <mark key={n}>{stueck.text}</mark> : <span key={n}>{stueck.text}</span>,
                  )}
                </span>
                <span className="beiwerk">
                  {beiwerk([
                    beiwerk([v.plz, v.ort].filter(Boolean)).replace(" · ", " "),
                    BUNDESLAND_LABEL[v.bundesland],
                    v.schulart,
                  ])}
                </span>
              </li>
            ))}
            <li className="vorschlag hinweiszeile" aria-hidden="true">
              Enter für alle Treffer
            </li>
          </ul>
        ) : null}
      </div>

      <button className="knopf" type="submit">
        {knopftext}
      </button>
    </form>
  );
}
