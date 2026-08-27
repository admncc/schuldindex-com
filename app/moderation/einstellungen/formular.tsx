"use client";

import { useActionState, useState } from "react";
import { speichern, type Einstellungszustand } from "./aktionen";
import {
  GRUPPEN_HILFE,
  GRUPPEN_LABEL,
  KATALOG,
  type Einstellungen,
  type Einstellungsbeschreibung,
} from "@/domain/einstellungen";

const GRUPPEN = [...new Set(KATALOG.map((k) => k.gruppe))];

function wertText(b: Einstellungsbeschreibung, wert: number): string {
  return b.art === "ganzzahl" ? String(wert) : String(wert).replace(".", ",");
}

export default function Einstellungsformular({
  werte,
  darfAendern,
}: {
  werte: Einstellungen;
  darfAendern: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Einstellungszustand, FormData>(speichern, {});
  const fehlerZu = (s: string) => zustand.fehler?.find((f) => f.schluessel === s)?.meldung;

  /**
   * Die Felder werden hier gehalten, nicht im DOM.
   *
   * „Auf Vorgabe“ trägt damit einfach den Vorgabewert ein, und gespeichert wird
   * über denselben Weg wie jede andere Änderung. Der erste Entwurf hatte dafür
   * eine zweite Server-Aktion am Knopf — die lief still durch die Hauptaktion
   * des Formulars, und das Zurücksetzen tat nichts.
   */
  const [felder, setzeFelder] = useState<Record<string, string>>(() =>
    Object.fromEntries(KATALOG.map((b) => [b.schluessel, wertText(b, werte[b.schluessel] ?? b.vorgabe)])),
  );

  return (
    <form action={absenden} key={zustand.versuch ?? 0}>
      {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

      {GRUPPEN.map((gruppe) => (
        <section key={gruppe} className="abschnitt">
          <h2>{GRUPPEN_LABEL[gruppe]}</h2>
          <p className="hinweis">{GRUPPEN_HILFE[gruppe]}</p>

          <div className="einstellungen">
            {KATALOG.filter((b) => b.gruppe === gruppe).map((b) => {
              const eingetragen = felder[b.schluessel] ?? wertText(b, b.vorgabe);
              const abweichend = eingetragen !== wertText(b, b.vorgabe);
              return (
                <div key={b.schluessel} className={abweichend ? "einstellung abweichend" : "einstellung"}>
                  <label htmlFor={b.schluessel}>{b.label}</label>
                  <div className="eingabe">
                    <input
                      id={b.schluessel}
                      name={b.schluessel}
                      value={eingetragen}
                      onChange={(e) =>
                        setzeFelder((bisher) => ({ ...bisher, [b.schluessel]: e.target.value }))
                      }
                      inputMode={b.art === "ganzzahl" ? "numeric" : "decimal"}
                      disabled={!darfAendern}
                      aria-describedby={`${b.schluessel}-hilfe`}
                    />
                    {b.einheit ? <span className="einheit">{b.einheit}</span> : null}
                    <span className="gedaempft">
                      {b.min}–{b.max}, Vorgabe {wertText(b, b.vorgabe)}
                    </span>
                    {abweichend && darfAendern ? (
                      <button
                        type="button"
                        className="knopf zweitrangig klein"
                        onClick={() =>
                          setzeFelder((bisher) => ({ ...bisher, [b.schluessel]: wertText(b, b.vorgabe) }))
                        }
                      >
                        Auf Vorgabe
                      </button>
                    ) : null}
                  </div>
                  <p className="hilfe" id={`${b.schluessel}-hilfe`}>{b.hilfe}</p>
                  {fehlerZu(b.schluessel) ? <p className="fehler">{fehlerZu(b.schluessel)}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {darfAendern ? (
        <div className="sammelleiste">
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird gespeichert …" : "Einstellungen speichern"}
          </button>
          <p className="fussnote">
            Änderungen wirken sofort — auf Bewertungen, die ab jetzt eingehen. Bereits
            entschiedene Bewertungen bleiben, wie sie sind.
          </p>
        </div>
      ) : (
        <p className="hinweis">Ändern darf diese Werte nur die Leitung.</p>
      )}
    </form>
  );
}
