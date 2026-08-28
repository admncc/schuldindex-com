"use client";

import { useRef, useState } from "react";

/**
 * Die GeoIP-Datenbank im Panel: Zustand ansehen, austauschen, ausprobieren.
 *
 * Der Austausch läuft über einen eigenen Weg statt über eine Server-Aktion -
 * die Datei ist 46 MB, Aktionen riegeln bei einem Megabyte ab. Deshalb hier ein
 * gewöhnliches `fetch` mit Fortschrittsanzeige über `XMLHttpRequest`: Bei einer
 * Datei dieser Größe ist ein Balken kein Zierrat, sondern der Unterschied
 * zwischen „lädt“ und „hängt“.
 */
export default function Geoipblock({
  lage,
  darfAendern,
}: {
  lage: {
    vorhanden: boolean;
    pfad: string;
    groesseMb: number | null;
    art: string | null;
    standAm: string | null;
    eintraege: number | null;
  };
  darfAendern: boolean;
}) {
  const [fortschritt, setFortschritt] = useState<number | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const feld = useRef<HTMLInputElement>(null);

  function hochladen() {
    const datei = feld.current?.files?.[0];
    if (datei === undefined) {
      setMeldung("Bitte erst eine Datei wählen.");
      return;
    }

    setMeldung(null);
    setErfolg(null);
    setFortschritt(0);

    const koerper = new FormData();
    koerper.append("datei", datei);

    const anfrage = new XMLHttpRequest();
    anfrage.open("POST", "/moderation/einstellungen/geoip");
    anfrage.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setFortschritt(Math.round((e.loaded / e.total) * 100));
    });
    anfrage.addEventListener("load", () => {
      setFortschritt(null);
      try {
        const antwort = JSON.parse(anfrage.responseText) as { ok: boolean; meldung?: string };
        if (antwort.ok) {
          setErfolg("Datenbank ersetzt. Die nächste Bewertung wird damit geortet.");
          // Neu laden, damit der Zustand oben stimmt - er kommt vom Server.
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setMeldung(antwort.meldung ?? "Der Austausch ist fehlgeschlagen.");
        }
      } catch {
        setMeldung("Unerwartete Antwort vom Server.");
      }
    });
    anfrage.addEventListener("error", () => {
      setFortschritt(null);
      setMeldung("Die Verbindung ist abgebrochen.");
    });
    anfrage.send(koerper);
  }

  return (
    <section className="abschnitt">
      <h2>Standortbestimmung (GeoIP)</h2>
      <p className="hinweis">
        Daraus entsteht die Entfernung zwischen der bewertenden Person und der Schule - eines der
        Signale der Betrugserkennung. Nachgeschlagen wird <strong>auf diesem Server</strong>; die
        IP-Adresse verlässt ihn nicht und wird nirgends gespeichert.
      </p>

      <div className="karte">
        {erfolg ? <p className="erfolg" role="status">{erfolg}</p> : null}
        {meldung ? <p className="fehler" role="alert">{meldung}</p> : null}

        <ul className="hinweisliste">
          <li>
            <strong>Zustand:</strong>{" "}
            {lage.vorhanden ? (
              `${lage.art ?? "unbekannte Ausgabe"} · ${lage.groesseMb} MB`
            ) : (
              <span className="fehler">
                keine Datenbank hinterlegt - jede Abgabe gilt als „Ort unbekannt“ und geht in die
                Moderation
              </span>
            )}
          </li>
          {lage.vorhanden ? (
            <>
              <li>
                <strong>Stand der Daten:</strong> {lage.standAm ?? "unbekannt"}
              </li>
              <li>
                <strong>Ablage:</strong> <code>{lage.pfad}</code>
              </li>
            </>
          ) : null}
        </ul>

        {darfAendern ? (
          <>
            <label className="feld">
              <span>Neue Datenbank</span>
              <input ref={feld} type="file" accept=".mmdb,.gz,.tar,.tgz,application/gzip" />
            </label>
            <p className="fussnote">
              Das Archiv von MaxMind (<code>GeoIP2-City-….tar.gz</code>) kann unverändert
              hochgeladen werden - die Datenbank wird daraus entpackt. Die alte Fassung wird erst
              ersetzt, wenn die neue vollständig geschrieben ist.
            </p>

            {fortschritt !== null ? (
              <div className="fortschritt" aria-live="polite">
                <span style={{ width: `${fortschritt}%` }} />
              </div>
            ) : null}

            <button
              type="button"
              className="knopf"
              onClick={hochladen}
              disabled={fortschritt !== null}
            >
              {fortschritt === null ? "Datenbank austauschen" : `Wird geladen … ${fortschritt} %`}
            </button>
          </>
        ) : (
          <p className="gedaempft">Die Datenbank darf nur die Leitung austauschen.</p>
        )}
      </div>
    </section>
  );
}
