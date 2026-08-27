"use client";

import { useMemo, useRef, useState } from "react";
import {
  FRAGEN,
  KATEGORIEN,
  KEINE_ANGABE,
  LABEL_KEINE_ANGABE,
  SKALEN,
  fragenDerKategorie,
  type Antwort,
  type KategorieId,
} from "@/domain/fragebogen";
import {
  ROLLEN,
  ROLLE_LABEL,
  beantwortet,
  fortschritt,
  istSchueler,
  pruefeEingabe,
  type Bewertungseingabe,
  type Kontaktart,
  type Rolle,
} from "@/domain/bewertungseingabe";
import { MAX_ABSTAENDE } from "@/domain/klickmuster";

const PFLICHT: KategorieId[] = ["A", "B", "C"];
const FREIWILLIG: KategorieId[] = ["D", "E", "F"];

type Schritt = { art: "rolle" } | { art: "kategorie"; id: KategorieId } | { art: "abschluss" };

/**
 * Eine bestehende Bewertung, die geändert werden soll.
 *
 * Dasselbe Formular, andere Ausgangslage: die Antworten stehen schon da, und
 * Kontakt und Einwilligung fehlen ganz — beide liegen längst vor. Sie erneut zu
 * verlangen würde die Einwilligung zur Formalität machen.
 */
export interface Aenderung {
  readonly id: string;
  readonly rolle: Rolle;
  readonly klassenstufe: number | null;
  readonly abgangsjahr: number | null;
  readonly antworten: Record<string, Antwort>;
  readonly freitexte: Partial<Record<KategorieId, string>>;
}

export function Bewertungsformular({
  schulSlug,
  schulname,
  aenderung,
  stempel,
}: {
  schulSlug: string;
  schulname: string;
  aenderung?: Aenderung | undefined;
  /** Signierter Zeitstempel des Servers; geht unverändert zurück. */
  stempel?: string | undefined;
}) {
  const [rolle, setRolle] = useState<Rolle | null>(aenderung?.rolle ?? null);
  const [klassenstufe, setKlassenstufe] = useState<number | null>(aenderung?.klassenstufe ?? null);
  const [abgangsjahr, setAbgangsjahr] = useState<number | null>(aenderung?.abgangsjahr ?? null);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>(aenderung?.antworten ?? {});
  const [freitexte, setFreitexte] = useState<Partial<Record<KategorieId, string>>>(
    aenderung?.freitexte ?? {},
  );
  // Bei einer Änderung sind die freiwilligen Kategorien schon aufgeklappt, wenn
  // sie beantwortet wurden — sonst wären die Antworten unsichtbar und würden
  // beim Speichern trotzdem mitgeschickt.
  const [freiwillige, setFreiwillige] = useState<KategorieId[]>(
    aenderung === undefined
      ? []
      : FREIWILLIG.filter((id) => fragenDerKategorie(id).some((f) => aenderung.antworten[f.id] !== undefined)),
  );
  const [kontaktart, setKontaktart] = useState<Kontaktart | null>("whatsapp");
  const [kontakt, setKontakt] = useState("");
  const [datenschutz, setDatenschutz] = useState(false);
  const [eltern, setEltern] = useState(false);
  const [verlosung, setVerlosung] = useState(false);
  const [nummer, setNummer] = useState(0);
  const [gezeigt, setGezeigt] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState<{ kontaktAnzeige: string } | null>(null);
  const [serverfehler, setServerfehler] = useState<string[]>([]);

  /**
   * Zeitpunkt des letzten Antwortklicks, auf die Millisekunde genau, und die
   * Abstände dazwischen.
   *
   * Als Ref und nicht als State: Jeder Klick soll das Formular nicht neu
   * rendern, und die Werte gehen ohnehin nur einmal mit, beim Absenden. Was
   * hier entsteht, ist eine Zahlenreihe ohne Bezug zu einzelnen Fragen — welche
   * Frage jemand wie lange bedacht hat, wird nicht festgehalten und verlässt
   * den Browser nie.
   */
  const letzterKlick = useRef<number | null>(null);
  const abstaende = useRef<number[]>([]);

  function merkeKlick() {
    const jetzt = Date.now();
    const vorher = letzterKlick.current;
    letzterKlick.current = jetzt;
    if (vorher !== null && abstaende.current.length < MAX_ABSTAENDE) {
      abstaende.current.push(jetzt - vorher);
    }
  }

  const schritte: Schritt[] = useMemo(
    () => [
      { art: "rolle" },
      ...PFLICHT.map((id) => ({ art: "kategorie" as const, id })),
      ...freiwillige.map((id) => ({ art: "kategorie" as const, id })),
      { art: "abschluss" },
    ],
    [freiwillige],
  );

  const eingabe: Bewertungseingabe = {
    schulSlug,
    rolle,
    klassenstufe,
    abgangsjahr,
    antworten,
    freitexte,
    kontaktart,
    kontakt,
    datenschutzEinwilligung: datenschutz,
    elternEinwilligung: eltern,
    verlosungTeilnahme: verlosung,
  };

  const fehler = pruefeEingabe(eingabe, new Date(), { kontaktNoetig: aenderung === undefined });
  const fehlerZu = (feld: string) => (gezeigt ? fehler.find((f) => f.feld === feld)?.meldung : undefined);
  const schritt = schritte[Math.min(nummer, schritte.length - 1)]!;
  const anteil = Math.round(fortschritt(antworten) * 100);

  function weiter() {
    // Erst die Fehler des aktuellen Schritts zeigen, dann weitergehen. Alle
    // Fehler auf einmal zu zeigen überfordert; gar keine zu zeigen frustriert.
    const relevant =
      schritt.art === "rolle"
        ? ["rolle", "klassenstufe", "abgangsjahr", "elternEinwilligung"]
        : schritt.art === "kategorie"
          ? [`kategorie.${schritt.id}`]
          : [];
    const offen = fehler.filter((f) => relevant.includes(f.feld));
    if (offen.length > 0) {
      setGezeigt(true);
      return;
    }
    setGezeigt(false);
    setNummer((n) => Math.min(n + 1, schritte.length - 1));
  }

  async function absenden() {
    setGezeigt(true);
    if (fehler.length > 0) return;

    setSendet(true);
    setServerfehler([]);
    try {
      const antwort = await fetch(
        aenderung === undefined ? "/api/bewertungen" : `/api/bewertungen/${aenderung.id}`,
        {
          method: aenderung === undefined ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...eingabe, stempel, klickabstaende: abstaende.current }),
        },
      );
      const ergebnis = (await antwort.json()) as
        | { ok: true; kontaktAnzeige?: string }
        | { ok: false; fehler: { feld: string; meldung: string }[] };

      if (ergebnis.ok) setGesendet({ kontaktAnzeige: ergebnis.kontaktAnzeige ?? "" });
      else setServerfehler(ergebnis.fehler.map((f) => f.meldung));
    } catch {
      setServerfehler(["Die Verbindung ist abgebrochen. Bitte versuche es noch einmal."]);
    } finally {
      setSendet(false);
    }
  }

  if (gesendet !== null && aenderung !== undefined) {
    return (
      <div className="leerzustand">
        <h2>Änderung gespeichert</h2>
        <p>
          Deine neue Fassung wird geprüft und ersetzt danach die bisherige. Bis dahin bleibt die
          alte Fassung stehen, falls sie veröffentlicht war.
        </p>
        <a className="knopf zweitrangig" href="/konto">Zu deinen Bewertungen</a>
      </div>
    );
  }

  if (gesendet !== null) {
    return (
      <div className="leerzustand">
        <h2>Fast geschafft</h2>
        <p>
          Wir haben dir eine Nachricht an <strong>{gesendet.kontaktAnzeige}</strong> geschickt.
          Bitte bestätige darüber deine Bewertung — der Link ist 24 Stunden gültig.
        </p>
        <p className="hinweis">
          Erst nach der Bestätigung wird deine Bewertung geprüft und veröffentlicht. Deine
          Kontaktdaten erscheinen nie öffentlich.
        </p>
        <a className="knopf zweitrangig" href={`/schule/${schulSlug}`}>Zurück zur Schule</a>
      </div>
    );
  }

  return (
    <form className="formular" onSubmit={(e) => e.preventDefault()}>
      <div className="fortschritt" aria-hidden="true">
        <span style={{ width: `${anteil}%` }} />
      </div>
      <p className="hinweis">
        Schritt {nummer + 1} von {schritte.length} · Pflichtfragen zu {anteil} % beantwortet
      </p>

      {schritt.art === "rolle" && (
        <fieldset className="feldgruppe">
          <legend>Ich bin:</legend>
          <div className="wahl">
            {ROLLEN.map((r) => (
              <label key={r} className={rolle === r ? "wahlfeld gewaehlt" : "wahlfeld"}>
                <input
                  type="radio"
                  name="rolle"
                  value={r}
                  checked={rolle === r}
                  onChange={() => {
                    setRolle(r);
                    if (!istSchueler(r)) setKlassenstufe(null);
                    if (r !== "ehemalig") setAbgangsjahr(null);
                    if (!istSchueler(r)) setVerlosung(false);
                  }}
                />
                {ROLLE_LABEL[r]}
              </label>
            ))}
          </div>
          {fehlerZu("rolle") && <p className="fehler">{fehlerZu("rolle")}</p>}

          {/* Die Elterneinwilligung erscheint nur dort, wo sie hingehört —
              direkt nach der Rollenwahl, nicht irgendwo am Ende. */}
          {rolle === "schueler_unter_16" && (
            <label className="ankreuzfeld">
              <input type="checkbox" checked={eltern} onChange={(e) => setEltern(e.target.checked)} />
              <span>
                Meine Eltern sind damit einverstanden, dass ich diese Bewertung abgebe und meine
                Kontaktdaten gespeichert werden.
              </span>
            </label>
          )}
          {fehlerZu("elternEinwilligung") && <p className="fehler">{fehlerZu("elternEinwilligung")}</p>}

          {rolle !== null && istSchueler(rolle) && (
            <label className="feld">
              <span>Welche Klassenstufe besuchst du?</span>
              <select
                value={klassenstufe ?? ""}
                onChange={(e) => setKlassenstufe(e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">Bitte wählen</option>
                {Array.from({ length: 13 }, (_, i) => i + 1).map((k) => (
                  <option key={k} value={k}>{k}. Klasse</option>
                ))}
              </select>
            </label>
          )}
          {fehlerZu("klassenstufe") && <p className="fehler">{fehlerZu("klassenstufe")}</p>}

          {rolle === "ehemalig" && (
            <label className="feld">
              <span>In welchem Jahr hast du die Schule verlassen?</span>
              <input
                type="number"
                min={1950}
                max={new Date().getFullYear()}
                value={abgangsjahr ?? ""}
                onChange={(e) => setAbgangsjahr(e.target.value === "" ? null : Number(e.target.value))}
              />
            </label>
          )}
          {fehlerZu("abgangsjahr") && <p className="fehler">{fehlerZu("abgangsjahr")}</p>}
        </fieldset>
      )}

      {schritt.art === "kategorie" && (
        <Kategorieschritt
          id={schritt.id}
          antworten={antworten}
          setAntwort={(id, wert) => {
            merkeKlick();
            setAntworten((a) => ({ ...a, [id]: wert }));
          }}
          freitext={freitexte[schritt.id] ?? ""}
          setFreitext={(text) => setFreitexte((f) => ({ ...f, [schritt.id]: text }))}
          fehler={fehlerZu(`kategorie.${schritt.id}`)}
        />
      )}

      {schritt.art === "abschluss" && (
        <>
          {/* Die freiwilligen Kategorien werden erst hier angeboten — einzeln
              und eingeklappt. Dreißig weitere Fragen als Wand hätten viele
              abgeschreckt, bevor sie den Pflichtteil abgeschlossen haben. */}
          {FREIWILLIG.filter((id) => !freiwillige.includes(id)).length > 0 && (
            <fieldset className="feldgruppe">
              <legend>Möchtest du noch etwas bewerten?</legend>
              <p className="hinweis">Freiwillig — deine Bewertung zählt auch ohne.</p>
              <div className="wahl">
                {FREIWILLIG.filter((id) => !freiwillige.includes(id)).map((id) => {
                  const k = KATEGORIEN.find((x) => x.id === id)!;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="knopf zweitrangig"
                      onClick={() => {
                        setFreiwillige((f) => [...f, id]);
                        setNummer(schritte.length - 1);
                      }}
                    >
                      {k.titel} ({fragenDerKategorie(id).length} Fragen)
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {aenderung === undefined ? (
            <fieldset className="feldgruppe">
              <legend>Bestätigung</legend>
              <p className="hinweis">
                Wir schicken dir eine Nachricht, um zu bestätigen, dass die Bewertung von einem
                Menschen kommt. Deine Kontaktdaten werden nie veröffentlicht.
              </p>
              <div className="wahl">
                {(["whatsapp", "sms", "email"] as const).map((art) => (
                  <label key={art} className={kontaktart === art ? "wahlfeld gewaehlt" : "wahlfeld"}>
                    <input
                      type="radio"
                      name="kontaktart"
                      checked={kontaktart === art}
                      onChange={() => setKontaktart(art)}
                    />
                    {art === "whatsapp" ? "WhatsApp" : art === "sms" ? "SMS" : "E-Mail"}
                  </label>
                ))}
              </div>
              <label className="feld">
                <span>{kontaktart === "email" ? "E-Mail-Adresse" : "Mobilnummer"}</span>
                <input
                  type={kontaktart === "email" ? "email" : "tel"}
                  value={kontakt}
                  onChange={(e) => setKontakt(e.target.value)}
                  placeholder={kontaktart === "email" ? "name@beispiel.de" : "0170 1234567"}
                />
              </label>
              {fehlerZu("kontaktart") && <p className="fehler">{fehlerZu("kontaktart")}</p>}
              {fehlerZu("kontakt") && <p className="fehler">{fehlerZu("kontakt")}</p>}

              <label className="ankreuzfeld">
                <input type="checkbox" checked={datenschutz} onChange={(e) => setDatenschutz(e.target.checked)} />
                <span>
                  Ich habe die <a href="/datenschutz">Datenschutzerklärung</a> gelesen und willige in die
                  Verarbeitung meiner Kontaktdaten zur Bestätigung und Missbrauchsprävention ein.
                </span>
              </label>
              {fehlerZu("datenschutzEinwilligung") && <p className="fehler">{fehlerZu("datenschutzEinwilligung")}</p>}

              {rolle !== null && istSchueler(rolle) && (
                <label className="ankreuzfeld">
                  <input type="checkbox" checked={verlosung} onChange={(e) => setVerlosung(e.target.checked)} />
                  <span>
                    Ich möchte an der monatlichen Verlosung teilnehmen und habe die{" "}
                    <a href="/verlosung" target="_blank" rel="noopener">Teilnahmebedingungen</a>{" "}
                    gelesen. Ein Los je Konto und Monat.
                  </span>
                </label>
              )}
            </fieldset>
          ) : (
            <fieldset className="feldgruppe">
              <legend>Änderung speichern</legend>
              <p className="hinweis">
                Deine neue Fassung wird noch einmal geprüft und ersetzt danach die bisherige. Eine
                erneute Bestätigung brauchst du nicht — dein Konto ist bestätigt.
              </p>
            </fieldset>
          )}

          {gezeigt && fehler.length > 0 && (
            <div className="fehlerkasten">
              <strong>Es fehlt noch etwas:</strong>
              <ul>
                {fehler.map((f) => (
                  <li key={f.feld}>{f.meldung}</li>
                ))}
              </ul>
            </div>
          )}

          {serverfehler.length > 0 && (
            <div className="fehlerkasten">
              <strong>Die Bewertung wurde nicht angenommen:</strong>
              <ul>
                {serverfehler.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="schrittleiste">
        {nummer > 0 && (
          <button type="button" className="knopf zweitrangig" onClick={() => { setGezeigt(false); setNummer((n) => n - 1); }}>
            Zurück
          </button>
        )}
        {schritt.art === "abschluss" ? (
          <button type="button" className="knopf" onClick={absenden} disabled={sendet}>
            {sendet
              ? "Wird gesendet …"
              : aenderung === undefined
                ? `Bewertung für ${schulname} absenden`
                : "Änderung speichern"}
          </button>
        ) : (
          <button type="button" className="knopf" onClick={weiter}>Weiter</button>
        )}
      </div>
    </form>
  );
}

function Kategorieschritt({
  id,
  antworten,
  setAntwort,
  freitext,
  setFreitext,
  fehler,
}: {
  id: KategorieId;
  antworten: Record<string, Antwort>;
  setAntwort: (frageId: string, wert: Antwort) => void;
  freitext: string;
  setFreitext: (text: string) => void;
  fehler?: string | undefined;
}) {
  const kategorie = KATEGORIEN.find((k) => k.id === id)!;
  const fragen = fragenDerKategorie(id);
  const fertig = beantwortet(id, antworten);

  return (
    <fieldset className="feldgruppe">
      <legend>{kategorie.titel}</legend>
      <p className="hinweis">
        {fertig} von {fragen.length} Fragen beantwortet
        {kategorie.pflicht ? "" : " · freiwillig"}
      </p>

      <ol className="fragen">
        {fragen.map((frage) => (
          <li key={frage.id}>
            <p className="fragetext">{frage.text}</p>
            <div className="antworten">
              {SKALEN[frage.skala].map((option) => (
                <label
                  key={option.wert}
                  className={antworten[frage.id] === option.wert ? "antwort gewaehlt" : "antwort"}
                >
                  <input
                    type="radio"
                    name={frage.id}
                    checked={antworten[frage.id] === option.wert}
                    onChange={() => setAntwort(frage.id, option.wert)}
                  />
                  {option.label}
                </label>
              ))}
              <label className={antworten[frage.id] === KEINE_ANGABE ? "antwort gewaehlt weiss-nicht" : "antwort weiss-nicht"}>
                <input
                  type="radio"
                  name={frage.id}
                  checked={antworten[frage.id] === KEINE_ANGABE}
                  onChange={() => setAntwort(frage.id, KEINE_ANGABE)}
                />
                {LABEL_KEINE_ANGABE}
              </label>
            </div>
          </li>
        ))}
      </ol>

      <label className="feld">
        <span>{kategorie.freitextLabel} (freiwillig)</span>
        <p className="warnung">
          <strong>Dein Text wird nicht veröffentlicht.</strong> Er fließt zusammen mit anderen
          Bewertungen in eine kurze Zusammenfassung für diese Schule ein.{" "}
          <strong>Bitte nenne keine Namen</strong> — weder von Lehrkräften noch von Mitschülerinnen
          und Mitschülern. Bewertungen mit Namen werden abgelehnt.
        </p>
        <textarea rows={4} value={freitext} onChange={(e) => setFreitext(e.target.value)} />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}
    </fieldset>
  );
}
