"use client";

import { useActionState, useState } from "react";
import { sammelAblehnen, type Sammelzustand } from "./aktionen";
import {
  ABLEHNUNGSGRUENDE,
  DRINGLICHKEIT_LABEL,
  MAX_SAMMELAKTION,
  alterInStunden,
  dringlichkeit,
} from "@/domain/moderation";
import type { Warteschlangeneintrag } from "@/db/moderation";

const ROLLE_LABEL: Readonly<Record<string, string>> = {
  schueler_unter_16: "Schüler:in unter 16",
  schueler_ab_16: "Schüler:in ab 16",
  eltern: "Elternteil",
  lehrkraft: "Lehrkraft",
  ehemalig: "Ehemalige:r",
};

const GRUND_LABEL: Readonly<Record<string, string>> = {
  in_pruefung_geo: "Ort",
  in_pruefung_betrug: "Muster",
};

function alter(stunden: number): string {
  if (stunden < 1) return `${Math.max(1, Math.round(stunden * 60))} min`;
  if (stunden < 48) return `${Math.floor(stunden)} h`;
  return `${Math.floor(stunden / 24)} Tage`;
}

/**
 * Die Warteschlange mit Auswahl.
 *
 * Die Sammelaktion kann nur ablehnen. Sie ist für den Fall gedacht, für den sie
 * gebaut wurde - eine Welle gleichartiger Abgaben -, und sie zeigt vor dem Klick,
 * wie viele Menschen die Begründung bekommen.
 */
export default function Warteschlange({ eintraege }: { eintraege: readonly Warteschlangeneintrag[] }) {
  const [zustand, absenden, laeuft] = useActionState<Sammelzustand, FormData>(sammelAblehnen, {});
  const [gewaehlt, setzeGewaehlt] = useState<ReadonlySet<string>>(new Set());
  const jetzt = new Date();

  function umschalten(id: string) {
    setzeGewaehlt((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  const alleGewaehlt = eintraege.length > 0 && gewaehlt.size === eintraege.length;

  return (
    <form action={absenden} key={zustand.versuch ?? 0}>
      {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">
              <input
                type="checkbox"
                aria-label="Alle auswählen"
                checked={alleGewaehlt}
                onChange={() =>
                  setzeGewaehlt(alleGewaehlt ? new Set() : new Set(eintraege.map((e) => e.id)))
                }
              />
            </th>
            <th scope="col">Alter</th>
            <th scope="col">Schule</th>
            <th scope="col">Rolle</th>
            <th scope="col">Grund</th>
            <th scope="col">Entfernung</th>
            <th scope="col">Freitext</th>
            <th scope="col">Wertung</th>
          </tr>
        </thead>
        <tbody>
          {eintraege.map((e) => {
            const stufe = dringlichkeit(e.erstellt_am, jetzt);
            return (
              <tr key={e.id} className={gewaehlt.has(e.id) ? "gewaehlt" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    name="auswahl"
                    value={e.id}
                    checked={gewaehlt.has(e.id)}
                    onChange={() => umschalten(e.id)}
                    aria-label={`${e.schule_name} auswählen`}
                  />
                </td>
                <td>
                  <a href={`/moderation/${e.id}`} className="alterslink">
                    <span className={`plakette ${stufe}`}>{DRINGLICHKEIT_LABEL[stufe]}</span>{" "}
                    {alter(alterInStunden(e.erstellt_am, jetzt))}
                  </a>
                </td>
                <td>
                  <a href={`/moderation/${e.id}`}>{e.schule_name}</a>
                  <span className="gedaempft"> · {e.schule_ort ?? "-"} ({e.bundesland})</span>
                </td>
                <td>
                  {ROLLE_LABEL[e.rolle] ?? e.rolle}
                  {e.klassenstufe ? <span className="gedaempft"> · {e.klassenstufe}. Klasse</span> : null}
                </td>
                <td>{GRUND_LABEL[e.status] ?? e.status}</td>
                <td>
                  {e.geo_unbekannt
                    ? "unbekannt"
                    : e.geo_entfernung_km === null
                      ? "-"
                      : `${Number(e.geo_entfernung_km).toLocaleString("de-DE", { maximumFractionDigits: 0 })} km`}
                </td>
                <td>{e.hat_freitext ? "ja" : "-"}</td>
                <td>
                  {e.gesamtscore === null
                    ? "-"
                    : Number(e.gesamtscore).toLocaleString("de-DE", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {gewaehlt.size > 0 ? (
        <div className="sammelleiste">
          <strong>
            {gewaehlt.size} von {eintraege.length} ausgewählt
          </strong>

          <label htmlFor="sammelgrund" className="versteckt">Ablehnungsgrund</label>
          <select id="sammelgrund" name="grund" required defaultValue="spam">
            {ABLEHNUNGSGRUENDE.map((g) => (
              <option key={g.id} value={g.id}>{g.kurz}</option>
            ))}
          </select>

          <label htmlFor="sammelzusatz" className="versteckt">Zusatz</label>
          <input id="sammelzusatz" name="zusatz" placeholder="Zusatz zur Begründung (freiwillig)" />

          <button className="knopf gefahr" disabled={laeuft}>
            {laeuft ? "Wird abgelehnt …" : `${gewaehlt.size} ablehnen`}
          </button>
          <button type="button" className="knopf zweitrangig" onClick={() => setzeGewaehlt(new Set())}>
            Auswahl aufheben
          </button>

          <p className="fussnote">
            Die Begründung geht an {gewaehlt.size} {gewaehlt.size === 1 ? "Person" : "Personen"}.
            Freigeben lässt sich nur einzeln. Höchstens {MAX_SAMMELAKTION} auf einmal.
          </p>
        </div>
      ) : null}
    </form>
  );
}
