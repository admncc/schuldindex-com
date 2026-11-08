"use client";

import { useActionState, useState } from "react";
import { HOECHSTLAENGE, type Platzbeschreibung } from "@/domain/einbettung";
import { schnipselSpeichern, type Einbettungszustand } from "./aktionen";

/**
 * Ein Platz für einen fremden Schnipsel.
 *
 * Drei Dinge, die diese Oberfläche nicht verschweigt:
 *
 *  - **Was eingetragen ist, steht im Feld** - im Wortlaut, nicht verkürzt.
 *    Anders als beim API-Schlüssel ist hier nichts geheim: Der Schnipsel wird
 *    an jeden Besucher ausgeliefert. Wer ihn nicht lesen kann, kann auch nicht
 *    prüfen, ob noch der richtige drinsteht.
 *  - **Welche fremden Hosts darin stehen.** Das ist die Angabe, die in die
 *    Datenschutzerklärung muss, und sie steht hier, damit niemand sie aus
 *    einem Minifikat heraussuchen muss.
 *  - **Dass ein Schnipsel alles kann, was JavaScript kann.** Die Prüfung
 *    begrenzt die Form, nicht die Macht.
 */
export default function Einbettungsblock({
  beschreibung,
  inhalt,
  aktiv,
  hosts,
  stand,
  darfAendern,
}: {
  beschreibung: Platzbeschreibung;
  inhalt: string;
  aktiv: boolean;
  hosts: readonly string[];
  stand: string | null;
  darfAendern: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Einbettungszustand, FormData>(
    schnipselSpeichern,
    {},
  );
  const [text, setzeText] = useState(inhalt);
  const eigenes = zustand.platz === beschreibung.platz;

  return (
    <section className="abschnitt">
      <h2>{beschreibung.label}</h2>
      <p className="hinweis">{beschreibung.hilfe}</p>

      <div className="karte">
        {eigenes && zustand.erfolg ? (
          <p className="erfolg" role="status">{zustand.erfolg}</p>
        ) : null}
        {eigenes && zustand.meldung ? (
          <p className="fehler" role="alert">{zustand.meldung}</p>
        ) : null}
        {eigenes && (zustand.hinweise?.length ?? 0) > 0 ? (
          <ul className="hinweisliste">
            {zustand.hinweise!.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : null}

        <ul className="hinweisliste">
          <li>
            <strong>Zustand:</strong>{" "}
            {inhalt === ""
              ? "nichts eingetragen"
              : aktiv
                ? "eingetragen und aktiv - läuft bei jedem Besucher"
                : "eingetragen, aber abgeschaltet"}
          </li>
          {hosts.length > 0 ? (
            <li>
              <strong>Fremde Hosts:</strong> {hosts.join(", ")} ·{" "}
              <a href="/datenschutz#einwilligung">muss in der Datenschutzerklärung stehen</a>
            </li>
          ) : null}
          {stand !== null ? (
            <li>
              <strong>Geändert:</strong> {stand}
            </li>
          ) : null}
        </ul>

        <form action={absenden} className="formular">
          <input type="hidden" name="platz" value={beschreibung.platz} />
          <div className="feld">
            <label htmlFor={`inhalt-${beschreibung.platz}`}>Schnipsel des Anbieters</label>
            <textarea
              id={`inhalt-${beschreibung.platz}`}
              name="inhalt"
              rows={10}
              spellCheck={false}
              className="schnipselfeld"
              value={text}
              onChange={(e) => setzeText(e.target.value)}
              disabled={!darfAendern || laeuft}
              placeholder={'<script async src="https://…"></script>'}
              maxLength={HOECHSTLAENGE}
            />
            <p className="fussnote">
              Erlaubt sind <code>&lt;script&gt;</code>-Elemente und HTML-Kommentare, nichts
              anderes, und Adressen nur über <code>https</code>. Ein{" "}
              <code>&lt;noscript&gt;</code>-Teil wird weggelassen. Leeres Feld = Einbettung
              entfernen. Höchstens {HOECHSTLAENGE.toLocaleString("de-DE")} Zeichen.
            </p>
          </div>

          <div className="feld ankreuzfeld">
            <input
              type="checkbox"
              id={`aktiv-${beschreibung.platz}`}
              name="aktiv"
              defaultChecked={aktiv || inhalt === ""}
              disabled={!darfAendern || laeuft}
            />
            <label htmlFor={`aktiv-${beschreibung.platz}`}>
              Aktiv - jetzt an alle Besucher ausliefern
            </label>
          </div>

          <button className="knopf" disabled={!darfAendern || laeuft}>
            {laeuft ? "Speichern …" : "Speichern"}
          </button>
          {!darfAendern ? (
            <p className="fussnote">Fremde Skripte darf nur die Leitung eintragen.</p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
