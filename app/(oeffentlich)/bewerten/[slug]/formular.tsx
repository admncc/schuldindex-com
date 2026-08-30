"use client";

import { useMemo, useRef, useState } from "react";
import {
  FRAGEN,
  KATEGORIEN,
  KEINE_ANGABE,
  LABEL_KEINE_ANGABE,
  SKALEN,
  frageText,
  fragenDerKategorie,
  type Ansprache,
  type Antwort,
  type KategorieId,
} from "@/domain/fragebogen";
import {
  ROLLEN,
  ROLLE_LABEL,
  ansprachefuer,
  beantwortet,
  fortschritt,
  istSchueler,
  pruefeEingabe,
  type Bewertungseingabe,
  type Kontaktart,
  type Rolle,
} from "@/domain/bewertungseingabe";
import { MAX_ABSTAENDE } from "@/domain/klickmuster";
import {
  HOECHSTWERT_PFLICHT,
  ZUSCHLAG_JE_FREIWILLIGER_BEREICH,
  hoechstwert,
} from "@/domain/scoring";
import { GEWINNE, VERLOSUNG_LABEL } from "@/domain/verlosungsgewinne";
import { gesicherteKennungen } from "../../kennung";

const ZAHL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const PFLICHT: KategorieId[] = ["A", "B", "C"];
const FREIWILLIG: KategorieId[] = ["D", "E", "F"];

type Schritt = { art: "rolle" } | { art: "kategorie"; id: KategorieId } | { art: "abschluss" };

/**
 * Eine bestehende Bewertung, die geändert werden soll.
 *
 * Dasselbe Formular, andere Ausgangslage: die Antworten stehen schon da, und
 * Kontakt und Einwilligung fehlen ganz - beide liegen längst vor. Sie erneut zu
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
  kontaktwege,
}: {
  schulSlug: string;
  schulname: string;
  aenderung?: Aenderung | undefined;
  /** Signierter Zeitstempel des Servers; geht unverändert zurück. */
  stempel?: string | undefined;
  /** Welche Wege der Bestätigung angeboten werden - aus den Einstellungen. */
  kontaktwege: readonly Kontaktart[];
}) {
  const [rolle, setRolle] = useState<Rolle | null>(aenderung?.rolle ?? null);
  const [klassenstufe, setKlassenstufe] = useState<number | null>(aenderung?.klassenstufe ?? null);
  const [abgangsjahr, setAbgangsjahr] = useState<number | null>(aenderung?.abgangsjahr ?? null);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>(aenderung?.antworten ?? {});
  const [freitexte, setFreitexte] = useState<Partial<Record<KategorieId, string>>>(
    aenderung?.freitexte ?? {},
  );
  // Bei einer Änderung sind die freiwilligen Kategorien schon aufgeklappt, wenn
  // sie beantwortet wurden - sonst wären die Antworten unsichtbar und würden
  // beim Speichern trotzdem mitgeschickt.
  const [freiwillige, setFreiwillige] = useState<KategorieId[]>(
    aenderung === undefined
      ? []
      : FREIWILLIG.filter((id) => fragenDerKategorie(id).some((f) => aenderung.antworten[f.id] !== undefined)),
  );
  const [kontaktart, setKontaktart] = useState<Kontaktart | null>(kontaktwege[0] ?? "email");
  const [kontakt, setKontakt] = useState("");
  const [datenschutz, setDatenschutz] = useState(false);
  const [eltern, setEltern] = useState(false);
  const [verlosung, setVerlosung] = useState(false);
  const [nummer, setNummer] = useState(0);
  const [gezeigt, setGezeigt] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState<{ kontaktAnzeige: string; versandt: boolean } | null>(
    null,
  );
  const [serverfehler, setServerfehler] = useState<string[]>([]);

  /**
   * Zeitpunkt des letzten Antwortklicks, auf die Millisekunde genau, und die
   * Abstände dazwischen.
   *
   * Als Ref und nicht als State: Jeder Klick soll das Formular nicht neu
   * rendern, und die Werte gehen ohnehin nur einmal mit, beim Absenden. Was
   * hier entsteht, ist eine Zahlenreihe ohne Bezug zu einzelnen Fragen - welche
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
  /** Freiwillige Bereiche mit mindestens einer Antwort - nicht bloß aufgeklappte. */
  const beantworteteFreiwillige = FREIWILLIG.filter((id) => beantwortet(id, antworten) > 0).length;
  const anteil = Math.round(fortschritt(antworten) * 100);

  /** Ist das gerade ein freiwilliger Bereich? Die werden anders verlassen. */
  const imFreiwilligen = schritt.art === "kategorie" && FREIWILLIG.includes(schritt.id);
  const abschlussnummer = schritte.length - 1;
  /** Rolle plus die drei Pflichtbereiche - dahinter fängt das Freiwillige an. */
  const letzterPflichtschritt = PFLICHT.length;

  /**
   * Hat der Bereich etwas, das man verlöre?
   *
   * Auch ein Freitext zählt. Vorher hing es allein an den Antworten, und wer
   * nur einen Kommentar geschrieben hatte, verlor ihn beim Zurückgehen
   * kommentarlos.
   */
  function hatInhalt(id: KategorieId): boolean {
    return beantwortet(id, antworten) > 0 || (freitexte[id] ?? "").trim() !== "";
  }

  /**
   * Verlässt einen freiwilligen Bereich Richtung Abschluss.
   *
   * Ein freiwilliger Bereich wird vom Abschluss aus geöffnet - also führt der
   * Weg zurück auch dorthin und nicht in den letzten Pflichtbereich. Wer ihn
   * leer verlässt, hat es sich anders überlegt: Dann verschwindet er wieder
   * aus der Liste und steht auf dem Abschluss erneut zur Auswahl.
   *
   * Gilt für **beide** Knöpfe. „Übernehmen" räumte den leeren Bereich vorher
   * nicht weg: Er blieb in `freiwillige` stehen, verschwand damit aus der
   * Auswahlliste am Abschluss und war nicht mehr zu erreichen - während der
   * Anreiztext daneben weiter „mit jedem weiteren Bereich 9,0" versprach.
   */
  function verlasseFreiwilligen(id: KategorieId) {
    const leer = !hatInhalt(id);
    if (leer) {
      setFreiwillige((bisher) => bisher.filter((k) => k !== id));
      setFreitexte((t) => ({ ...t, [id]: "" }));
    }
    // Ohne die neue Länge zu kennen: Nach dem Entfernen ist der Abschluss
    // einen Schritt weiter vorn. `schritte` wird erst im nächsten Durchlauf
    // neu gebaut, deshalb hier von Hand.
    setNummer(leer ? abschlussnummer - 1 : abschlussnummer);
  }

  function zurueck() {
    setGezeigt(false);
    if (imFreiwilligen && schritt.art === "kategorie") {
      verlasseFreiwilligen(schritt.id);
      return;
    }
    // Vom Abschluss aus **über** die freiwilligen Bereiche hinweg in den
    // letzten Pflichtbereich. Ein Schritt zurück landete vorher im zuletzt
    // geöffneten freiwilligen Bereich, und von dort ging es wieder auf den
    // Abschluss: eine geschlossene Schleife. Wer merkte, dass er in Bereich A
    // falsch geklickt hatte, kam dorthin nie zurück.
    if (schritt.art === "abschluss") {
      setNummer(letzterPflichtschritt);
      return;
    }
    setNummer((n) => Math.max(0, n - 1));
  }

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
    // Aus einem freiwilligen Bereich geht es zurück zum Abschluss, nicht in
    // den nächsten Bereich: Von dort ist er geöffnet worden, und dort steht
    // die Auswahl der übrigen.
    if (imFreiwilligen && schritt.art === "kategorie") {
      verlasseFreiwilligen(schritt.id);
      return;
    }
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
          // Die im Browser gesicherten Kennungen gehen mit: Der Server nimmt
          // sie **nur**, wenn der zugehörige Cookie fehlt - sonst könnte sich
          // jeder in der Konsole eine Empfehlung ausdenken
          // (`domain/geraetekennung.ts`).
          body: JSON.stringify({
            ...eingabe,
            stempel,
            klickabstaende: abstaende.current,
            gesichert: gesicherteKennungen(),
          }),
        },
      );
      const ergebnis = (await antwort.json()) as
        | { ok: true; kontaktAnzeige?: string; nachrichtVersandt?: boolean }
        | { ok: false; fehler: { feld: string; meldung: string }[] };

      if (ergebnis.ok) {
        setGesendet({
          kontaktAnzeige: ergebnis.kontaktAnzeige ?? "",
          // Die Antwort sagt seit jeher, ob die Nachricht hinausging - gelesen
          // hat es niemand. Der Bildschirm behauptete in jedem Fall, sie sei
          // unterwegs; im Betrieb ist sie das derzeit nie, weil noch kein
          // Versandweg eingerichtet ist.
          versandt: ergebnis.nachrichtVersandt !== false,
        });
      }
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

  if (gesendet !== null && !gesendet.versandt) {
    return (
      <div className="leerzustand">
        <h2>Deine Bewertung ist gespeichert - die Nachricht nicht angekommen</h2>
        <p>
          Wir konnten die Bestätigung an <strong>{gesendet.kontaktAnzeige}</strong> gerade nicht
          zustellen. Deine Antworten sind gespeichert und gehen nicht verloren; veröffentlicht
          wird die Bewertung erst nach der Bestätigung.
        </p>
        <p>
          Fordere den Link bitte in ein paar Minuten noch einmal an - dafür genügt derselbe
          Kontakt.
        </p>
        <a className="knopf" href="/konto/anmelden">Bestätigungslink anfordern</a>
        <a className="knopf zweitrangig" href={`/schule/${schulSlug}`}>Zurück zur Schule</a>
      </div>
    );
  }

  if (gesendet !== null) {
    return (
      <div className="leerzustand">
        <h2>Fast geschafft</h2>
        <p>
          Wir haben dir eine Nachricht an <strong>{gesendet.kontaktAnzeige}</strong> geschickt.
          Bitte bestätige darüber deine Bewertung - der Link ist 24 Stunden gültig.
        </p>
        <p className="hinweis">
          Erst nach der Bestätigung wird deine Bewertung geprüft und veröffentlicht. Deine
          Kontaktdaten erscheinen nie öffentlich. Kommt nichts an, kannst du den Link unter{" "}
          <a href="/konto/anmelden">Deine Bewertungen</a> noch einmal anfordern.
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
                    // Die Elterneinwilligung blieb beim Rollenwechsel stehen.
                    // Wer „unter 16" wählte, das Häkchen setzte und dann auf
                    // „Lehrkraft" wechselte, schickte sie mit - und in der
                    // Datenbank stand danach eine Einwilligung, die es für
                    // diese Rolle nie gab. Als Nachweis nach DSGVO ist das
                    // schlimmer als gar keine.
                    if (r !== "schueler_unter_16") setEltern(false);
                  }}
                />
                {ROLLE_LABEL[r]}
              </label>
            ))}
          </div>
          {fehlerZu("rolle") && <p className="fehler">{fehlerZu("rolle")}</p>}

          {/* Die Elterneinwilligung erscheint nur dort, wo sie hingehört -
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

      {/* Einmal, direkt nach dem ersten Schritt: Wer gleich anfängt zu würfeln,
          soll vorher wissen, dass es auffällt. Später im Formular wäre es
          wirkungslos, auf jeder Seite wäre es Lärm. */}
      {schritt.art === "kategorie" && nummer === 1 && (
        <div className="warnkasten" role="note">
          <strong>Bitte ehrlich antworten - erfundene Bewertungen erkennen wir.</strong>
          <p>
            Jede Abgabe wird geprüft, auf mehreren Wegen und automatisch. Was dabei auffällt,
            landet bei einem Menschen und wird abgelehnt: Die Bewertung zählt dann nicht - weder
            für die Schule noch für dich.
          </p>
          <p>
            <strong>Abgelehnte Bewertungen nehmen auch nicht an der Verlosung teil.</strong> Eine
            ehrliche Bewertung dauert drei Minuten und zählt.
          </p>
        </div>
      )}

      {schritt.art === "kategorie" && (
        <Kategorieschritt
          id={schritt.id}
          ansprache={ansprachefuer(rolle)}
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
          {/* Die freiwilligen Kategorien werden erst hier angeboten - einzeln
              und eingeklappt. Dreißig weitere Fragen als Wand hätten viele
              abgeschreckt, bevor sie den Pflichtteil abgeschlossen haben. */}
          {FREIWILLIG.filter((id) => !freiwillige.includes(id)).length > 0 && (
            <fieldset className="feldgruppe">
              <legend>Möchtest du noch etwas bewerten?</legend>
              {/* Der Anreiz gehört genau hierhin: An dieser Stelle entscheidet
                  sich, ob jemand weitermacht - und die Regel ist erklärbar,
                  nicht bloß ein Appell. */}
              <p className="hinweis">
                Freiwillig - deine Bewertung zählt auch ohne. Aber:{" "}
                <strong>
                  Mit nur den Pflichtbereichen kann eine Schule höchstens{" "}
                  {ZAHL.format(HOECHSTWERT_PFLICHT)} von 10 erreichen.
                </strong>{" "}
                Jeder freiwillige Bereich hebt die Grenze um{" "}
                {ZAHL.format(ZUSCHLAG_JE_FREIWILLIGER_BEREICH)} - bei allen dreien sind die
                vollen 10 möglich. Deine Schule bekommt also nur dann die Spitzenwertung, wenn
                jemand auch diese Bereiche beurteilt.
              </p>
              <p className="hinweis">
                {/* Gezählt wird, was **beantwortet** ist, nicht was aufgeklappt
                    ist. Vorher zeigte das Formular „9,0 möglich“, sobald jemand
                    Bereich D aufklappte - auch wenn er ihn leer ließ, und dann
                    galten am Ende doch 8,5. */}
                Zurzeit möglich: <strong>{ZAHL.format(hoechstwert(beantworteteFreiwillige))} von 10</strong>
                {beantworteteFreiwillige < FREIWILLIG.length
                  ? ` · mit jedem weiteren Bereich ${ZAHL.format(
                      hoechstwert(beantworteteFreiwillige + 1),
                    )}`
                  : ""}
              </p>
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
                {/* Nur die Wege, die im Panel angeschaltet sind. Ein
                    abgeschalteter Weg verschwindet hier und wird auch dann
                    nicht angenommen, wenn ihn jemand von Hand mitschickt. */}
                {kontaktwege.map((art) => (
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
                    Ich möchte an der {VERLOSUNG_LABEL.normal} teilnehmen ({GEWINNE.normal.anzahl}{" "}
                    Gutscheine über je {GEWINNE.normal.wertEuro} Euro) und habe die{" "}
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
                erneute Bestätigung brauchst du nicht - dein Konto ist bestätigt.
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
          <button type="button" className="knopf zweitrangig" onClick={zurueck}>
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
          <button type="button" className="knopf" onClick={weiter}>
            {imFreiwilligen ? "Übernehmen" : "Weiter"}
          </button>
        )}
      </div>
    </form>
  );
}

function Kategorieschritt({
  id,
  ansprache,
  antworten,
  setAntwort,
  freitext,
  setFreitext,
  fehler,
}: {
  id: KategorieId;
  ansprache: Ansprache;
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

      {/* Ein Satz zur Blickrichtung. Die Fragen selbst sind je Rolle anders
          formuliert; dieser Hinweis sagt, worauf sie sich beziehen. */}
      {ansprache === "ehemalig" ? (
        <p className="hinweis">Beziehe dich auf die Zeit, in der du an dieser Schule warst.</p>
      ) : ansprache === "eltern" ? (
        <p className="hinweis">Beziehe dich auf das, was du an der Schule deines Kindes erlebst.</p>
      ) : ansprache === "lehrkraft" ? (
        // Die Lehrkraft war die einzige Rolle ohne eigenen Satz - und
        // ausgerechnet bei ihr ist die Blickrichtung nicht selbstverständlich:
        // Gefragt ist die Schule, wie sie ist, nicht die eigene Arbeit darin.
        <p className="hinweis">
          Beziehe dich auf die Schule, wie du sie im Arbeitsalltag erlebst - nicht auf deinen
          eigenen Unterricht.
        </p>
      ) : null}

      <ol className="fragen">
        {fragen.map((frage) => (
          <li key={frage.id}>
            <p className="fragetext">{frageText(frage, ansprache)}</p>
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
          <strong>Bitte nenne keine Namen</strong> - weder von Lehrkräften noch von{" "}
          {ansprache === "eltern" || ansprache === "lehrkraft"
            ? "Schülerinnen und Schülern"
            : "Mitschülerinnen und Mitschülern"}
          . Bewertungen mit Namen werden abgelehnt.
        </p>
        <textarea rows={4} value={freitext} onChange={(e) => setFreitext(e.target.value)} />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}
    </fieldset>
  );
}
