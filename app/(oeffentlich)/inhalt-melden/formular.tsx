"use client";

import { useActionState, useState } from "react";
import { melden, type Meldezustand } from "./aktion";
import { MELDEGRUND_TEXT } from "@/domain/meldung";

export default function Meldeformular() {
  const [zustand, absenden, laeuft] = useActionState<Meldezustand, FormData>(melden, {});
  const [grund, setzeGrund] = useState<string>("");

  // Siehe `versuch` in der Aktion: der Schlüssel baut das Formular nach jeder
  // Antwort neu auf, damit die zurückgegebenen Werte auch wirklich dastehen.
  const schluessel = zustand.versuch ?? 0;

  if (zustand.bestaetigung) {
    return (
      <div className="leerzustand">
        <h2>Meldung eingegangen</h2>
        <p>{zustand.bestaetigung}</p>
        <p>
          Kennzeichen deiner Meldung: <code>{zustand.kennung}</code>
          <br />
          <span className="hinweis">
            Notier es dir, falls du dich auf diese Meldung beziehen willst.
          </span>
        </p>
        <a className="knopf zweitrangig" href="/">Zur Startseite</a>
      </div>
    );
  }

  const fehlerZu = (feld: string) => zustand.fehler?.find((f) => f.feld === feld)?.meldung;
  const ausgewaehlt = grund || (zustand.werte?.["grund"] ?? "");
  const gewaehlt = MELDEGRUND_TEXT.find((g) => g.id === ausgewaehlt);

  return (
    <form action={absenden} className="formular" key={schluessel}>
      {zustand.fehler && zustand.fehler.length > 0 ? (
        <div className="fehlerkasten" role="alert">
          Bitte sieh dir die markierten Felder an.
        </div>
      ) : null}

      <fieldset className="feldgruppe">
        <legend>Um welchen Inhalt geht es?</legend>
        <label className="feld">
          <span>Adresse der Seite</span>
          <input
            name="url"
            placeholder="https://schulindex.com/schule/…"
            defaultValue={zustand.werte?.["url"] ?? ""}
            required
          />
          {fehlerZu("url") ? <span className="fehler">{fehlerZu("url")}</span> : null}
        </label>

        <div className="feld">
          <span>Was ist das Problem?</span>
          <div className="wahl">
            {MELDEGRUND_TEXT.map((g) => (
              <label key={g.id} className={ausgewaehlt === g.id ? "wahlfeld gewaehlt" : "wahlfeld"}>
                <input
                  type="radio"
                  name="grund"
                  value={g.id}
                  defaultChecked={(zustand.werte?.["grund"] ?? grund) === g.id}
                  onChange={() => setzeGrund(g.id)}
                  required
                />
                {g.kurz}
              </label>
            ))}
          </div>
          {gewaehlt ? <span className="hinweis">{gewaehlt.hilfe}</span> : null}
          {fehlerZu("grund") ? <span className="fehler">{fehlerZu("grund")}</span> : null}
        </div>

        <label className="feld">
          <span>Warum hältst du den Inhalt für rechtswidrig?</span>
          <textarea
            name="erlaeuterung"
            rows={6}
            defaultValue={zustand.werte?.["erlaeuterung"] ?? ""}
            placeholder="Beschreib möglichst genau, welche Stelle du meinst und warum sie rechtswidrig ist."
            required
          />
          {fehlerZu("erlaeuterung") ? <span className="fehler">{fehlerZu("erlaeuterung")}</span> : null}
        </label>
      </fieldset>

      <fieldset className="feldgruppe">
        <legend>Wie erreichen wir dich?</legend>
        <label className="feld">
          <span>Name (freiwillig)</span>
          <input name="name" defaultValue={zustand.werte?.["name"] ?? ""} />
        </label>
        <label className="feld">
          <span>
            E-Mail-Adresse
            {ausgewaehlt === "straftat" ? " (bei einer Drohung freiwillig)" : ""}
          </span>
          <input
            name="kontakt"
            type="email"
            defaultValue={zustand.werte?.["kontakt"] ?? ""}
            required={ausgewaehlt !== "straftat"}
          />
          {fehlerZu("kontakt") ? <span className="fehler">{fehlerZu("kontakt")}</span> : null}
        </label>
        <p className="hinweis">
          Wir brauchen die Adresse nur, um dir das Ergebnis mitzuteilen. Sie wird verschlüsselt
          gespeichert und sechs Monate nach der Entscheidung gelöscht. Meldest du eine Drohung,
          geht es auch ohne — dann können wir dir allerdings nicht antworten.
        </p>
      </fieldset>

      <label className="ankreuzfeld">
        <input
          type="checkbox"
          name="gutglauben"
          defaultChecked={zustand.werte?.["gutglauben"] === "ja"}
          required
        />
        <span>
          Ich versichere nach bestem Wissen, dass meine Angaben richtig und vollständig sind.
        </span>
      </label>
      {fehlerZu("gutglauben") ? <span className="fehler">{fehlerZu("gutglauben")}</span> : null}

      <button className="knopf" disabled={laeuft}>
        {laeuft ? "Wird gesendet …" : "Meldung absenden"}
      </button>
    </form>
  );
}
