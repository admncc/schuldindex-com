"use client";

import { useActionState, useState } from "react";
import { ABLEHNUNGSGRUENDE } from "@/domain/moderation";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { RISIKO_LABEL, risikoklasse, risikostufe } from "@/domain/risiko";
import { analyseStarten, ausAnalyseAblehnen, type Ablehnzustand, type Analysezustand } from "./aktionen";

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

export interface Zeile {
  id: string;
  status: Zustand;
  rolle: string;
  erstellt_am: string;
  gesamtscore: string | null;
  signalpunkte: number | null;
  signale: { art: string; gewicht: number; erlaeuterung: string }[];
  hat_freitext: boolean;
  ist_demo: boolean;
  ablehnungsgrund: string | null;
}

/**
 * Die Bewertungen einer Schule, nach Risiko eingefärbt - und ablehnbar.
 *
 * Die Farbe kommt aus den gespeicherten Signalpunkten, gemessen an der
 * eingestellten Halteschwelle (`domain/risiko.ts`). Sie ist eine Lesehilfe für
 * lange Listen, kein Urteil: Was rot ist, gehört angesehen, nicht automatisch
 * abgelehnt.
 *
 * Die KI-Analyse setzt eine zweite Markierung darüber. Beide zusammen sagen
 * mehr als jede für sich - die Signale sehen die einzelne Abgabe, das Modell
 * das Muster über die Schule.
 */
export default function Risikotabelle({
  zeilen,
  schuleId,
  halteschwelle,
  darfAnalysieren,
}: {
  zeilen: readonly Zeile[];
  schuleId: string;
  halteschwelle: number;
  darfAnalysieren: boolean;
}) {
  const [analyse, analyseAbsenden, analyseLaeuft] = useActionState<Analysezustand, FormData>(
    analyseStarten,
    {},
  );
  const [ablehnung, ablehnenAbsenden, lehntAb] = useActionState<Ablehnzustand, FormData>(
    ausAnalyseAblehnen,
    {},
  );
  const [offen, setzeOffen] = useState<string | null>(null);

  /** Was die KI zu einer Bewertung gesagt hat - über die laufende Nummer. */
  const kiBefund = new Map<string, { risiko: string; begruendung: string }>();
  if (analyse.befund && analyse.zuordnung) {
    for (const eintrag of analyse.befund.auffaellige) {
      const id = analyse.zuordnung.find((z) => z.nr === eintrag.nr)?.id;
      if (id !== undefined) kiBefund.set(id, { risiko: eintrag.risiko, begruendung: eintrag.begruendung });
    }
  }

  return (
    <>
      <div className="sammelleiste">
        {darfAnalysieren ? (
          <form action={analyseAbsenden}>
            <input type="hidden" name="schule" value={schuleId} />
            <button className="knopf zweitrangig" disabled={analyseLaeuft}>
              {analyseLaeuft ? "Claude sieht nach …" : "Mit Claude auf Muster prüfen"}
            </button>
          </form>
        ) : (
          <p className="gedaempft">Die KI-Analyse darf nur die Leitung starten.</p>
        )}
        <p className="fussnote">
          Geprüft wird das Muster über die ganze Schule: gleiche Handschrift in Freitexten,
          Häufungen, gleichförmiges Klickverhalten. Übertragen werden Kennzahlen und Freitexte -
          <strong> keine Kontaktdaten und keine Kontokennungen</strong>. Der Befund entscheidet
          nichts; ablehnen kannst nur du.
        </p>
      </div>

      {analyse.meldung ? <p className="fehler" role="alert">{analyse.meldung}</p> : null}
      {ablehnung.meldung ? <p className="fehler" role="alert">{ablehnung.meldung}</p> : null}
      {ablehnung.erfolg ? <p className="erfolg" role="status">{ablehnung.erfolg}</p> : null}

      {analyse.befund ? (
        <div className="karte">
          <span className="beschriftung">Befund der KI-Analyse</span>
          <p>{analyse.befund.gesamteindruck}</p>
          {analyse.befund.muster.length > 0 ? (
            <ul className="hinweisliste">
              {analyse.befund.muster.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : null}
          <p className="fussnote">
            {analyse.befund.auffaellige.length === 0
              ? "Keine einzelne Bewertung auffällig."
              : `${analyse.befund.auffaellige.length} Bewertungen sind unten markiert.`}
          </p>
        </div>
      ) : null}

      <table className="tabelle risikotabelle">
        <thead>
          <tr>
            <th scope="col">Abgegeben</th>
            <th scope="col">Zustand</th>
            <th scope="col">Wertung</th>
            <th scope="col">Risiko</th>
            <th scope="col">Befund</th>
            <th scope="col">Entscheidung</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const stufe = risikostufe(z.signalpunkte, halteschwelle);
            const ki = kiBefund.get(z.id);
            const hoch = stufe === "hoch" || ki?.risiko === "hoch";
            const entschieden = z.status === "abgelehnt" || z.status === "freigegeben";

            return (
              <tr key={z.id} className={hoch ? "hohesrisiko" : stufe === "auffaellig" ? "auffaellig" : ""}>
                <td>{ZEIT.format(new Date(z.erstellt_am))}</td>
                <td>
                  {ZUSTAND_LABEL[z.status]}
                  {z.ist_demo ? <span className="plakette demo">Demo</span> : null}
                </td>
                <td>{z.gesamtscore === null ? "-" : WERT.format(Number(z.gesamtscore))}</td>
                <td>
                  <span className={`plakette ${risikoklasse(stufe)}`}>
                    {RISIKO_LABEL[stufe]}
                    {z.signalpunkte !== null ? ` · ${ZAHL.format(z.signalpunkte)}` : ""}
                  </span>
                </td>
                <td className="befundspalte">
                  {z.signale.length > 0 ? (
                    <span className="gedaempft">{z.signale.map((s) => s.erlaeuterung).join("; ")}</span>
                  ) : (
                    <span className="gedaempft">-</span>
                  )}
                  {ki !== undefined ? (
                    <span className="kibefund">
                      <strong>Claude ({ki.risiko}):</strong> {ki.begruendung}
                    </span>
                  ) : null}
                </td>
                <td>
                  <a className="knopf zweitrangig klein" href={`/moderation/${z.id}`}>Vorgang</a>{" "}
                  {z.status === "abgelehnt" ? (
                    <span className="gedaempft">abgelehnt</span>
                  ) : offen === z.id ? (
                    <form action={ablehnenAbsenden} className="loeschfrage" key={ablehnung.versuch ?? 0}>
                      <input type="hidden" name="bewertung" value={z.id} />
                      <label className="versteckt" htmlFor={`grund-${z.id}`}>Ablehnungsgrund</label>
                      <select id={`grund-${z.id}`} name="grund" defaultValue="spam">
                        {ABLEHNUNGSGRUENDE.map((g) => (
                          <option key={g.id} value={g.id}>{g.kurz}</option>
                        ))}
                      </select>
                      <button className="knopf gefahr klein" disabled={lehntAb}>
                        Ablehnen
                      </button>
                      <button
                        type="button"
                        className="knopf zweitrangig klein"
                        onClick={() => setzeOffen(null)}
                      >
                        Abbrechen
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="knopf zweitrangig klein"
                      onClick={() => setzeOffen(z.id)}
                    >
                      {entschieden ? "Zurückziehen" : "Ablehnen"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {zeilen.length === 0 ? <p className="gedaempft">Keine Bewertung in diesem Zustand.</p> : null}
    </>
  );
}
