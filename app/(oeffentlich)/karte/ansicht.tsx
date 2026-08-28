"use client";

import { useMemo, useRef, useState } from "react";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { SCHULART_LABEL, type Schulart } from "@/import/schulart";
import { entfernungKm } from "@/domain/geopruefung";
import { projiziere, type Ausschnitt, type Bildfeld } from "@/domain/karte";
import { scorestufe } from "@/domain/scoring";
import type { BewerteteSchule } from "@/db/karte";

/**
 * Die bedienbare Karte.
 *
 * Aus dem Bild ist eine Anwendung geworden: zoomen, verschieben, Punkte
 * antippen, filtern, den eigenen Umkreis anzeigen. Alles davon läuft im
 * Browser - die bewerteten Schulen kommen mit der Seite mit, weil es wenige
 * hundert sind. Ein Nachladen beim Verschieben gäbe es nur mit Kacheln von
 * einem fremden Server, und genau die soll es hier nicht geben
 * (`domain/karte.ts`).
 *
 * **Der Standort verlässt das Gerät nicht.** „In meiner Nähe“ fragt den Browser
 * nach der Position und rechnet die Entfernungen hier aus. An den Server geht
 * davon nichts - er könnte damit auch nichts anfangen, außer es zu speichern.
 */

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Grenzen des Zooms. Weiter als 12-fach wird aus Punkten Kunst. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

interface Sicht {
  readonly k: number;
  readonly x: number;
  readonly y: number;
}

type Stufenfilter = "alle" | "gut" | "mittel" | "schlecht";

export function Kartenansicht({
  schulen,
  ausschnitt,
  feld,
  bestandsbild,
  bestandszahl,
}: {
  schulen: readonly BewerteteSchule[];
  ausschnitt: Ausschnitt;
  feld: Bildfeld;
  bestandsbild: string;
  bestandszahl: number;
}) {
  const [sicht, setSicht] = useState<Sicht>({ k: 1, x: 0, y: 0 });
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [stufe, setStufe] = useState<Stufenfilter>("alle");
  const [schulart, setSchulart] = useState<Schulart | "alle">("alle");
  const [mindestzahl, setMindestzahl] = useState(0);
  const [standort, setStandort] = useState<{ lat: number; lon: number } | null>(null);
  const [ortungslage, setOrtungslage] = useState<"aus" | "laeuft" | "abgelehnt">("aus");

  const rahmen = useRef<HTMLDivElement>(null);
  /**
   * Die Zeiger, die gerade auf der Karte liegen.
   *
   * Einer zieht, zwei zoomen. Ein `Map` statt eines einzelnen Zustands, weil
   * auf dem Telefon beide Finger einzeln gemeldet werden und der zweite sonst
   * als Sprung des ersten ankäme.
   */
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const zieht = useRef<{ x: number; y: number; sicht: Sicht; ziel: Element | null } | null>(null);
  const kneift = useRef<{ abstand: number; k: number } | null>(null);

  const sichtbar = useMemo(
    () =>
      schulen.filter((s) => {
        const punkte = Number(s.gesamtscore);
        if (stufe !== "alle" && scorestufe(punkte) !== stufe) return false;
        if (schulart !== "alle" && !s.schularten.includes(schulart)) return false;
        if (s.anzahl < mindestzahl) return false;
        return true;
      }),
    [schulen, stufe, schulart, mindestzahl],
  );

  /** Die nächstgelegenen Schulen - nur wenn jemand die Ortung erlaubt hat. */
  const inDerNaehe = useMemo(() => {
    if (standort === null) return [];
    return sichtbar
      .map((s) => ({ schule: s, km: entfernungKm(standort, { lat: s.lat, lon: s.lon }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }, [sichtbar, standort]);

  const ausgewaehlt = sichtbar.find((s) => s.slug === gewaehlt) ?? null;

  /** Die vorhandenen Schularten - nur die, die im Ausschnitt auch vorkommen. */
  const schularten = useMemo(() => {
    const menge = new Set<Schulart>();
    for (const s of schulen) for (const a of s.schularten) menge.add(a);
    return [...menge].sort((a, b) => SCHULART_LABEL[a].localeCompare(SCHULART_LABEL[b], "de"));
  }, [schulen]);

  const schnitt = useMemo(() => {
    if (sichtbar.length === 0) return null;
    return sichtbar.reduce((summe, s) => summe + Number(s.gesamtscore), 0) / sichtbar.length;
  }, [sichtbar]);

  function begrenze(neu: Sicht): Sicht {
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neu.k));
    // Nicht über den Rand hinausschieben: Beim Hineinzoomen wächst der erlaubte
    // Spielraum, bei k = 1 ist er null.
    const spielraum = { x: (feld.breite * (k - 1)) / 2, y: (feld.hoehe * (k - 1)) / 2 };
    return {
      k,
      x: Math.min(spielraum.x, Math.max(-spielraum.x, neu.x)),
      y: Math.min(spielraum.y, Math.max(-spielraum.y, neu.y)),
    };
  }

  function zoome(faktor: number, mitte?: { x: number; y: number }) {
    setSicht((alt) => {
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, alt.k * faktor));
      if (mitte === undefined) return begrenze({ ...alt, k });
      // Der Punkt unter dem Zeiger bleibt liegen: Sonst springt die Karte beim
      // Zoomen weg, und man verliert die Stelle, die man ansehen wollte.
      const verhaeltnis = k / alt.k;
      return begrenze({
        k,
        x: mitte.x - (mitte.x - alt.x) * verhaeltnis,
        y: mitte.y - (mitte.y - alt.y) * verhaeltnis,
      });
    });
  }

  function beiRad(e: React.WheelEvent<HTMLDivElement>) {
    const kasten = rahmen.current?.getBoundingClientRect();
    if (kasten === undefined) return;
    e.preventDefault();
    const massstab = feld.breite / kasten.width;
    const mitte = {
      x: (e.clientX - kasten.left) * massstab - feld.breite / 2,
      y: (e.clientY - kasten.top) * massstab - feld.hoehe / 2,
    };
    zoome(e.deltaY < 0 ? 1.2 : 1 / 1.2, mitte);
  }

  function zeigeAuf(lat: number, lon: number, k = 6) {
    const punkt = projiziere(lat, lon, ausschnitt, feld);
    setSicht(
      begrenze({
        k,
        x: (feld.breite / 2 - punkt.x) * k,
        y: (feld.hoehe / 2 - punkt.y) * k,
      }),
    );
  }

  function orten() {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setOrtungslage("abgelehnt");
      return;
    }
    setOrtungslage("laeuft");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const ort = { lat: position.coords.latitude, lon: position.coords.longitude };
        setStandort(ort);
        setOrtungslage("aus");
        zeigeAuf(ort.lat, ort.lon, 7);
      },
      () => setOrtungslage("abgelehnt"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  return (
    <>
      <div className="kartenleiste">
        <label className="feld klein">
          <span>Wertung</span>
          <select value={stufe} onChange={(e) => setStufe(e.target.value as Stufenfilter)}>
            <option value="alle">Alle</option>
            <option value="gut">Gut bewertet</option>
            <option value="mittel">Durchschnittlich</option>
            <option value="schlecht">Unterdurchschnittlich</option>
          </select>
        </label>

        <label className="feld klein">
          <span>Schulart</span>
          <select
            value={schulart}
            onChange={(e) => setSchulart(e.target.value === "alle" ? "alle" : (e.target.value as Schulart))}
          >
            <option value="alle">Alle Schularten</option>
            {schularten.map((a) => (
              <option key={a} value={a}>{SCHULART_LABEL[a]}</option>
            ))}
          </select>
        </label>

        <label className="feld klein">
          <span>Mindestens Bewertungen</span>
          <select value={mindestzahl} onChange={(e) => setMindestzahl(Number(e.target.value))}>
            <option value={0}>egal</option>
            <option value={20}>ab 20</option>
            <option value={50}>ab 50</option>
            <option value={100}>ab 100</option>
          </select>
        </label>

        <button type="button" className="knopf zweitrangig klein" onClick={orten}>
          {ortungslage === "laeuft" ? "Suche Standort …" : "In meiner Nähe"}
        </button>
      </div>

      {ortungslage === "abgelehnt" ? (
        <p className="hinweis">
          Ohne Standortfreigabe geht das nicht - du kannst die Karte aber von Hand verschieben.
        </p>
      ) : null}

      <div className="kartenbuehne">
        <div
          className="karte-rahmen"
          ref={rahmen}
          style={{ aspectRatio: `${feld.breite} / ${feld.hoehe}` }}
          onWheel={beiRad}
          onPointerDown={(e) => {
            // Die Zoomknöpfe liegen im selben Rahmen. Ohne diese Ausnahme fängt
            // der Rahmen den Zeiger ein, und der Knopf bekommt seinen Klick nie
            // zu sehen - genau so ist es beim ersten Versuch passiert.
            if ((e.target as Element).closest(".kartenknoepfe") !== null) return;

            zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            e.currentTarget.setPointerCapture(e.pointerId);

            if (zeiger.current.size === 2) {
              const [a, b] = [...zeiger.current.values()];
              kneift.current = { abstand: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: sicht.k };
              zieht.current = null;
              return;
            }
            zieht.current = { x: e.clientX, y: e.clientY, sicht, ziel: e.target as Element };
          }}
          onPointerMove={(e) => {
            if (!zeiger.current.has(e.pointerId)) return;
            zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            const kasten = rahmen.current?.getBoundingClientRect();
            if (kasten === undefined) return;
            const massstab = feld.breite / kasten.width;

            // Zwei Finger: Der Abstand zwischen ihnen bestimmt den Maßstab.
            if (zeiger.current.size === 2 && kneift.current !== null) {
              const [a, b] = [...zeiger.current.values()];
              const abstand = Math.hypot(a!.x - b!.x, a!.y - b!.y);
              setSicht((alt) =>
                begrenze({ ...alt, k: (kneift.current!.k * abstand) / kneift.current!.abstand }),
              );
              return;
            }

            const start = zieht.current;
            if (start === null) return;
            setSicht(
              begrenze({
                k: start.sicht.k,
                x: start.sicht.x + (e.clientX - start.x) * massstab,
                y: start.sicht.y + (e.clientY - start.y) * massstab,
              }),
            );
          }}
          onPointerUp={(e) => {
            const start = zieht.current;
            zeiger.current.delete(e.pointerId);
            if (zeiger.current.size < 2) kneift.current = null;
            zieht.current = null;

            // Ein Klick ist ein Zug, der nirgendwo hingeführt hat. Die Auswahl
            // hier zu treffen statt am Kreis selbst ist der Preis dafür, dass
            // der Rahmen den Zeiger für das Ziehen einfängt.
            if (start === null || start.ziel === null) return;
            const bewegt = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            const slug = start.ziel.getAttribute("data-slug");
            if (bewegt < 5 && slug !== null) setGewaehlt(slug);
          }}
          onPointerCancel={(e) => {
            zeiger.current.delete(e.pointerId);
            zieht.current = null;
            kneift.current = null;
          }}
        >
          <div
            className="kartenebenen"
            style={{ transform: `translate(${sicht.x}px, ${sicht.y}px) scale(${sicht.k})` }}
          >
            {/* Zwei Ebenen übereinander: der Bestand als eigene,
                zwischenspeicherbare Datei, darüber die anklickbaren bewerteten
                Schulen. Beide haben denselben Ausschnitt und liegen deshalb
                deckungsgleich. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="schulkarte bestandsebene"
              src={bestandsbild}
              alt={`Karte mit ${ZAHL.format(bestandszahl)} Schulen`}
              width={feld.breite}
              height={feld.hoehe}
              draggable={false}
            />
            <svg viewBox={`0 0 ${feld.breite} ${feld.hoehe}`} className="schulkarte bewertungsebene">
              <g className="bewertet">
                {standort !== null
                  ? (() => {
                      const p = projiziere(standort.lat, standort.lon, ausschnitt, feld);
                      return (
                        <g className="standort">
                          <circle cx={p.x} cy={p.y} r={14 / sicht.k} className="hof" />
                          <circle cx={p.x} cy={p.y} r={4 / sicht.k} className="kern" />
                        </g>
                      );
                    })()
                  : null}

                {sichtbar.map((s) => {
                  const punkt = projiziere(s.lat, s.lon, ausschnitt, feld);
                  const wert = Number(s.gesamtscore);
                  // Größe nach Zahl der Bewertungen, gedeckelt: Eine Schule mit
                  // 400 Bewertungen ist wichtiger als eine mit 12, aber nicht
                  // dreißigmal so groß.
                  const r = (4 + Math.min(4, Math.log10(Math.max(1, s.anzahl)) * 2)) / Math.sqrt(sicht.k);
                  return (
                    <circle
                      key={s.slug}
                      cx={punkt.x.toFixed(1)}
                      cy={punkt.y.toFixed(1)}
                      r={r.toFixed(2)}
                      className={`${scorestufe(wert)}${gewaehlt === s.slug ? " gewaehlt" : ""}`}
                      strokeWidth={1.5 / Math.sqrt(sicht.k)}
                      data-slug={s.slug}
                    >
                      <title>
                        {s.name}
                        {s.ort ? `, ${s.ort}` : ""} - {WERT.format(wert)} von 10
                      </title>
                    </circle>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="kartenknoepfe">
            <button type="button" onClick={() => zoome(1.5)} aria-label="Vergrößern">+</button>
            <button type="button" onClick={() => zoome(1 / 1.5)} aria-label="Verkleinern">−</button>
            <button
              type="button"
              onClick={() => setSicht({ k: 1, x: 0, y: 0 })}
              aria-label="Ganze Karte zeigen"
            >
              ⤢
            </button>
          </div>
        </div>

        {/* Die Liste ist die Bedienung ohne Maus: Sie zeigt dieselben Schulen,
            lässt sich mit der Tastatur durchgehen und schiebt die Karte auf den
            gewählten Punkt. Ohne sie wäre die Karte für einen Teil der Leute
            schlicht nicht benutzbar. */}
        <div className="kartenliste">
          <p className="hinweis">
            {ZAHL.format(sichtbar.length)} bewertete Schulen
            {schnitt !== null ? ` · Schnitt ${WERT.format(schnitt)}` : ""}
          </p>

          {ausgewaehlt !== null ? (
            <div className="kartenauswahl">
              <button
                type="button"
                className="schliessen"
                onClick={() => setGewaehlt(null)}
                aria-label="Auswahl schließen"
              >
                ×
              </button>
              <span className={`punktzahl ${scorestufe(Number(ausgewaehlt.gesamtscore))}`}>
                {WERT.format(Number(ausgewaehlt.gesamtscore))}
              </span>
              <strong>{ausgewaehlt.name}</strong>
              <span className="beiwerk">
                {[ausgewaehlt.plz, ausgewaehlt.ort].filter(Boolean).join(" ")} ·{" "}
                {BUNDESLAND_LABEL[ausgewaehlt.bundesland]}
              </span>
              <span className="beiwerk">
                {ZAHL.format(ausgewaehlt.anzahl)} Bewertungen
                {ausgewaehlt.aggressionsindex !== null
                  ? ` · Mobbing-Index ${WERT.format(Number(ausgewaehlt.aggressionsindex))} von 5`
                  : ""}
              </span>
              <a className="knopf klein" href={`/schule/${ausgewaehlt.slug}`}>Schulprofil</a>
            </div>
          ) : null}

          <ol className="kartentreffer">
            {(standort !== null ? inDerNaehe.map((n) => n.schule) : sichtbar.slice(0, 40)).map((s) => {
              const wert = Number(s.gesamtscore);
              const naehe = inDerNaehe.find((n) => n.schule.slug === s.slug);
              return (
                <li key={s.slug}>
                  <button
                    type="button"
                    className={gewaehlt === s.slug ? "eintrag gewaehlt" : "eintrag"}
                    onClick={() => {
                      setGewaehlt(s.slug);
                      zeigeAuf(s.lat, s.lon);
                    }}
                  >
                    <span className={`punktzahl klein ${scorestufe(wert)}`}>{WERT.format(wert)}</span>
                    <span className="name">
                      {s.name}
                      <span>
                        {s.ort ?? ""}
                        {naehe !== undefined ? ` · ${WERT.format(naehe.km)} km entfernt` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {sichtbar.length > 40 && standort === null ? (
            <p className="fussnote">
              Es werden die 40 meistbewerteten aufgeführt. Die Karte zeigt alle{" "}
              {ZAHL.format(sichtbar.length)}.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
