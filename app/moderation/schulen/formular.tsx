"use client";

import { useActionState } from "react";
import { BUNDESLAENDER, BUNDESLAND_LABEL } from "@/domain/bundesland";
import { SCHULART_LABEL, type Schulart } from "@/import/schulart";
import { schuleAnlegen, schuleSpeichern, type Pflegezustand } from "./aktionen";

/**
 * Das Formular für eine Schule - zum Anlegen wie zum Bearbeiten.
 *
 * Ein Formular für beides, weil die Felder dieselben sind und zwei Fassungen
 * garantiert auseinanderlaufen. Der Unterschied steckt in der Aktion und in
 * einer Handvoll Hinweise.
 */

export interface Schulwerte {
  readonly id?: string;
  readonly name: string;
  readonly bundesland: string;
  readonly schularten: readonly string[];
  readonly schulartOriginal: string;
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly traeger: string;
  readonly website: string;
  readonly telefon: string;
  readonly email: string;
  readonly lat: string;
  readonly lon: string;
  readonly istAktiv: boolean;
}

export default function Schulformular({
  werte,
  darfAendern,
  neu = false,
}: {
  werte: Schulwerte;
  darfAendern: boolean;
  neu?: boolean;
}) {
  const [zustand, absenden, laeuft] = useActionState<Pflegezustand, FormData>(
    neu ? schuleAnlegen : schuleSpeichern,
    {},
  );
  const fehlerZu = (feld: string) => zustand.fehler?.find((f) => f.feld === feld)?.meldung;
  // Nach einem Fehlversuch stehen die eingegebenen Werte wieder da: React setzt
  // das Formular nach einer Aktion sonst auf die Ausgangswerte zurück.
  const w = zustand.werte ?? werte;

  return (
    <form action={absenden} className="formular" key={zustand.versuch ?? 0}>
      {werte.id ? <input type="hidden" name="id" value={werte.id} /> : null}

      {zustand.erfolg ? <p className="erfolg" role="status">{zustand.erfolg}</p> : null}
      {zustand.meldung ? <p className="fehler" role="alert">{zustand.meldung}</p> : null}

      <fieldset className="feldgruppe">
        <legend>Schule</legend>

        <label className="feld">
          <span>Name</span>
          <input name="name" defaultValue={w.name} required disabled={!darfAendern} />
        </label>
        {fehlerZu("name") ? <p className="fehler">{fehlerZu("name")}</p> : null}

        <label className="feld">
          <span>Bundesland</span>
          <select name="bundesland" defaultValue={w.bundesland} disabled={!darfAendern}>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>
        </label>
        {fehlerZu("bundesland") ? <p className="fehler">{fehlerZu("bundesland")}</p> : null}

        <fieldset className="feldgruppe schlicht">
          <legend>Schularten</legend>
          <p className="hinweis">
            Steuert Filter und Ranglisten. Mehrfachnennung ist möglich - etwa bei einem
            Schulzentrum mit Haupt- und Realschule.
          </p>
          <div className="wahl">
            {(Object.keys(SCHULART_LABEL) as Schulart[]).map((art) => (
              <label
                key={art}
                className={w.schularten.includes(art) ? "wahlfeld gewaehlt" : "wahlfeld"}
              >
                <input
                  type="checkbox"
                  name="schularten"
                  value={art}
                  defaultChecked={w.schularten.includes(art)}
                  disabled={!darfAendern}
                />
                {SCHULART_LABEL[art]}
              </label>
            ))}
          </div>
        </fieldset>
        {fehlerZu("schularten") ? <p className="fehler">{fehlerZu("schularten")}</p> : null}

        <label className="feld">
          <span>Bezeichnung des Landes (erscheint auf dem Profil)</span>
          <input
            name="schulartOriginal"
            defaultValue={w.schulartOriginal}
            placeholder="z. B. Gemeinschaftsschule"
            disabled={!darfAendern}
          />
        </label>
      </fieldset>

      <fieldset className="feldgruppe">
        <legend>Anschrift</legend>

        <label className="feld">
          <span>Straße und Hausnummer</span>
          <input name="strasse" defaultValue={w.strasse} disabled={!darfAendern} />
        </label>

        <div className="feldreihe">
          <label className="feld">
            <span>Postleitzahl</span>
            <input name="plz" defaultValue={w.plz} inputMode="numeric" disabled={!darfAendern} />
          </label>
          <label className="feld">
            <span>Ort</span>
            <input name="ort" defaultValue={w.ort} disabled={!darfAendern} />
          </label>
        </div>
        {fehlerZu("plz") ? <p className="fehler">{fehlerZu("plz")}</p> : null}

        <div className="feldreihe">
          <label className="feld">
            <span>Breitengrad</span>
            <input name="lat" defaultValue={w.lat} inputMode="decimal" placeholder="52.5163" disabled={!darfAendern} />
          </label>
          <label className="feld">
            <span>Längengrad</span>
            <input name="lon" defaultValue={w.lon} inputMode="decimal" placeholder="13.3777" disabled={!darfAendern} />
          </label>
        </div>
        <p className="hinweis">
          Ohne Koordinate erscheint die Schule nicht auf der Karte und nicht in der Umkreissuche.
          Die Entfernungsprüfung bei Bewertungen greift dann ebenfalls nicht.
        </p>
        {fehlerZu("lat") ? <p className="fehler">{fehlerZu("lat")}</p> : null}
        {fehlerZu("lon") ? <p className="fehler">{fehlerZu("lon")}</p> : null}
      </fieldset>

      <fieldset className="feldgruppe">
        <legend>Kontakt und Träger</legend>

        <label className="feld">
          <span>Träger</span>
          <input name="traeger" defaultValue={w.traeger} disabled={!darfAendern} />
        </label>
        <label className="feld">
          <span>Internetseite</span>
          <input name="website" defaultValue={w.website} placeholder="https://" disabled={!darfAendern} />
        </label>
        {fehlerZu("website") ? <p className="fehler">{fehlerZu("website")}</p> : null}
        <div className="feldreihe">
          <label className="feld">
            <span>Telefon</span>
            <input name="telefon" defaultValue={w.telefon} disabled={!darfAendern} />
          </label>
          <label className="feld">
            <span>E-Mail</span>
            <input name="email" defaultValue={w.email} disabled={!darfAendern} />
          </label>
        </div>
        {fehlerZu("email") ? <p className="fehler">{fehlerZu("email")}</p> : null}

        <label className="ankreuzfeld">
          <input type="checkbox" name="istAktiv" value="an" defaultChecked={w.istAktiv} disabled={!darfAendern} />
          <span>
            <strong>Schule ist aktiv.</strong> Ohne Haken verschwindet sie aus Suche, Karte und
            Ranglisten. Vorhandene Bewertungen bleiben erhalten - das ist der Weg für eine
            geschlossene Schule, nicht das Löschen.
          </span>
        </label>
      </fieldset>

      {darfAendern ? (
        <div className="sammelleiste">
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird gespeichert …" : neu ? "Schule anlegen" : "Änderungen speichern"}
          </button>
          <p className="fussnote">
            Wer hier speichert, markiert die Schule als von Hand gepflegt: Der nächste Import
            überschreibt sie dann nicht mehr mit den Werten der Quelle.
          </p>
        </div>
      ) : (
        <p className="hinweis">Ändern darf den Schulbestand nur die Leitung.</p>
      )}
    </form>
  );
}
