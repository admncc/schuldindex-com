"use client";

import { useActionState, useState } from "react";
import { zugangBeenden, zugangFreischalten, type Zugangszustand } from "./aktionen";
import { ZUGANG_STUNDEN } from "@/domain/diagnose";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Der Schalter für den Diagnosezugang.
 *
 * Zwei Dinge, die die Oberfläche tragen muss:
 *
 *  - **Das Kennwort erscheint genau einmal.** Gespeichert ist nur sein Hash;
 *    ein zweites Anzeigen gäbe es nur, wenn wir es im Klartext hielten - und
 *    dann wäre die ganze Vorsicht umsonst.
 *  - **Freischalten ist immer auch ein Zurückziehen.** Jede Freischaltung
 *    erzeugt ein neues Kennwort und beendet das vorige. Das steht hier, damit
 *    niemand zweimal klickt und sich wundert, warum das notierte nicht mehr
 *    geht.
 */
export default function Zugangsblock({
  offen,
  gueltigBis,
  erstelltVon,
  zugriffe,
  letzterZugriffAm,
  darfSchalten,
  basis,
}: {
  offen: boolean;
  gueltigBis: string | null;
  erstelltVon: string | null;
  zugriffe: number;
  letzterZugriffAm: string | null;
  darfSchalten: boolean;
  basis: string;
}) {
  const [frei, freischalten, laeuftFrei] = useActionState<Zugangszustand, FormData>(
    zugangFreischalten,
    {},
  );
  const [ende, beenden, laeuftEnde] = useActionState<Zugangszustand, FormData>(zugangBeenden, {});
  const [kopiert, setzeKopiert] = useState(false);

  const zustand = frei.kennwort ? frei : ende.erfolg || ende.meldung ? ende : frei;

  return (
    <div className="karte">
      <span className="beschriftung">Diagnosezugang</span>

      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}
      {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}

      {frei.kennwort ? (
        <div className="kennwortkasten">
          <p className="erfolg" role="status">
            Freigeschaltet bis{" "}
            {frei.gueltigBis ? ZEIT.format(new Date(frei.gueltigBis)) : "unbekannt"}.
          </p>
          <p>
            <strong>Dieses Kennwort erscheint nur jetzt.</strong> Es ist nirgends gespeichert -
            in der Datenbank steht ausschließlich seine Prüfsumme. Wer es verliert, schaltet neu
            frei; dabei entsteht ein neues, und dieses wird wertlos.
          </p>
          <code className="kennwort">{frei.kennwort}</code>
          <button
            type="button"
            className="knopf zweitrangig klein"
            onClick={() => {
              void navigator.clipboard?.writeText(frei.kennwort ?? "");
              setzeKopiert(true);
            }}
          >
            {kopiert ? "Kopiert" : "Kennwort kopieren"}
          </button>
          <p className="fussnote">Abruf:</p>
          <code className="befehl">
            curl -H &quot;Authorization: Bearer {frei.kennwort}&quot; {basis}/api/diagnose
          </code>
        </div>
      ) : null}

      {offen ? (
        <>
          <p>
            <span className="plakette offen">Offen</span> bis{" "}
            {gueltigBis ? ZEIT.format(new Date(gueltigBis)) : "unbekannt"}
            {erstelltVon ? `, freigeschaltet von ${erstelltVon}` : ""}.
          </p>
          <p className="fussnote">
            {zugriffe === 0
              ? "Bisher nicht benutzt."
              : `${zugriffe.toLocaleString("de-DE")} Zugriffe, zuletzt ${
                  letzterZugriffAm ? ZEIT.format(new Date(letzterZugriffAm)) : "unbekannt"
                }.`}{" "}
            Ein Zugriffszähler, der höher steht als erwartet, ist der Grund, aus dem er hier
            steht.
          </p>
        </>
      ) : (
        <p>
          <span className="plakette">Geschlossen</span> Die Schnittstelle antwortet auf jede
          Anfrage mit 401.
        </p>
      )}

      {!darfSchalten ? (
        <p className="gedaempft">Schalten darf nur die Leitung.</p>
      ) : (
        <div className="schalterreihe">
          <form action={freischalten} key={`f${frei.versuch ?? 0}`}>
            <label className="feldgruppe">
              <span>Dauer</span>
              <select name="stunden" defaultValue={8} className="feld">
                {ZUGANG_STUNDEN.map((s) => (
                  <option key={s} value={s}>
                    {s} {s === 1 ? "Stunde" : "Stunden"}
                  </option>
                ))}
              </select>
            </label>
            <button className="knopf" disabled={laeuftFrei}>
              {laeuftFrei ? "Wird freigeschaltet …" : offen ? "Neu freischalten" : "Freischalten"}
            </button>
          </form>

          {offen ? (
            <form action={beenden} key={`e${ende.versuch ?? 0}`}>
              <button className="knopf gefahr" disabled={laeuftEnde}>
                {laeuftEnde ? "Wird beendet …" : "Sofort beenden"}
              </button>
            </form>
          ) : null}
        </div>
      )}

      <p className="fussnote">
        Der Zugang läuft von selbst ab und wird bei jeder Freischaltung neu erzeugt. Die
        Schnittstelle ist ausschließlich lesend: Sie führt keine Befehle aus, gibt keine
        Kontaktdaten heraus und zeigt keine Freitexte aus Bewertungen.
      </p>
    </div>
  );
}
