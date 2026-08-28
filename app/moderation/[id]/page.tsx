import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { FRAGE_NACH_ID, KATEGORIEN, KEINE_ANGABE, LABEL_KEINE_ANGABE, SKALEN, fragenDerKategorie } from "@/domain/fragebogen";
import { pruefeAntwortmuster } from "@/domain/betrugspruefung";
import { SCHWELLE_KM } from "@/domain/geopruefung";
import { alterInStunden, dringlichkeit, DRINGLICHKEIT_LABEL } from "@/domain/moderation";
import { fristtext, regel } from "@/domain/aufbewahrung";
import { holeVorgang, protokollZurBewertung, weitereBewertungenDesKontos } from "@/db/moderation";
import Entscheidungsfeld from "./entscheidung";
import Kontaktfeld from "./kontakt";

export const metadata: Metadata = { title: "Bewertung prüfen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ROLLE_LABEL: Readonly<Record<string, string>> = {
  schueler_unter_16: "Schüler:in unter 16",
  schueler_ab_16: "Schüler:in ab 16",
  eltern: "Elternteil",
  lehrkraft: "Lehrkraft",
  ehemalig: "Ehemalige:r",
};

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
const ZAHL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const PROTOKOLL_LABEL: Readonly<Record<string, string>> = {
  freigeben: "Freigegeben",
  ablehnen: "Abgelehnt",
  spam: "Als Spam abgelehnt",
  rueckfrage: "Rückfrage gestellt",
  einsicht_kontakt: "Kontakt eingesehen",
};

export default async function Vorgangsseite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Ohne diese Prüfung liefe eine erfundene Kennung als Datenbankfehler auf,
  // statt als „nicht gefunden“.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const vorgang = await holeVorgang(id);
  if (vorgang === null) notFound();

  const [weitere, protokoll] = await Promise.all([
    weitereBewertungenDesKontos(vorgang.konto_id, vorgang.id),
    protokollZurBewertung(vorgang.id),
  ]);

  const status = vorgang.status as Zustand;
  const jetzt = new Date();
  const stufe = dringlichkeit(vorgang.erstellt_am, jetzt);
  const muster = pruefeAntwortmuster(vorgang.antworten as never);
  const freitexte = Object.entries(vorgang.freitexte).filter(([, t]) => t.trim() !== "");
  const entfernung = vorgang.geo_entfernung_km === null ? null : Number(vorgang.geo_entfernung_km);

  return (
    <section className="abschnitt">
      <p className="brotkrumen">
        <a href="/moderation">← Warteschlange</a>
      </p>

      <div className="vorgangskopf">
        <div>
          <h1>{vorgang.schule_name}</h1>
          <p className="gedaempft">
            {[vorgang.schule_strasse, [vorgang.schule_plz, vorgang.schule_ort].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}{" "}
            · {BUNDESLAND_LABEL[vorgang.bundesland]} ·{" "}
            <a href={`/schule/${vorgang.schule_slug}`}>Öffentliches Profil</a>
          </p>
        </div>
        <div className="vorgangsstatus">
          <span className={`plakette ${stufe}`}>{DRINGLICHKEIT_LABEL[stufe]}</span>
          {/* Damit niemand eine erfundene Bewertung für eine echte hält und
              umgekehrt - die Entscheidung darüber wäre wertlos. */}
          {vorgang.ist_demo ? <span className="plakette demo">Demodatensatz</span> : null}
          <span className="gedaempft">
            {ZUSTAND_LABEL[status]} · seit {Math.floor(alterInStunden(vorgang.erstellt_am, jetzt))} Stunden
          </span>
        </div>
      </div>

      <div className="vorgangsraster">
        <div>
          <h2>Prüfhinweise</h2>

          {/* Der Befund von der Abgabe, nicht neu gerechnet: die Grenzwerte sind
              einstellbar, und was gestern angeschlagen hat, täte es heute
              vielleicht nicht mehr. Die Moderation muss sehen, warum die
              Bewertung damals angehalten wurde. */}
          {vorgang.signale.length > 0 ? (
            <ul className="signale">
              {vorgang.signale.map((s, i) => (
                <li key={`${s.art}-${i}`}>
                  <span className={`plakette ${s.gewicht >= 3 ? "schlecht" : s.gewicht === 2 ? "mittel" : "gut"}`}>
                    {s.gewicht}
                  </span>
                  <span>{s.erlaeuterung}</span>
                </li>
              ))}
              {vorgang.signalpunkte !== null ? (
                <li className="gedaempft">
                  Summe {vorgang.signalpunkte} - angehalten ab der eingestellten Halteschwelle
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="gedaempft">
              Kein Signal gespeichert. Diese Bewertung stammt aus der Zeit vor der Aufzeichnung
              oder wurde ohne Befund angehalten.
            </p>
          )}

          <ul className="hinweisliste">
            <li>
              <strong>Ort:</strong>{" "}
              {vorgang.geo_unbekannt
                ? "unbekannt - der Absenderort ließ sich nicht bestimmen"
                : entfernung === null
                  ? "nicht geprüft"
                  : `${entfernung.toLocaleString("de-DE", { maximumFractionDigits: 0 })} km zur Schule (Grenze ${SCHWELLE_KM} km)`}
            </li>
            <li>
              <strong>Antwortmuster:</strong>{" "}
              {muster.length === 0 ? "unauffällig" : muster.map((s) => s.erlaeuterung).join("; ")}
            </li>
            <li>
              <strong>Klickverhalten:</strong>{" "}
              {vorgang.klickmuster === null
                ? "nicht gemessen"
                : `${vorgang.klickmuster.anzahl} Abstände, im Mittel ${Math.round(vorgang.klickmuster.medianMs)} ms, Streuung ${Math.round(vorgang.klickmuster.streuung * 100)} %`}
              {/* Die Folge steht eingeklappt da, nicht offen: Für die Entscheidung
                  reichen die Kennzahlen. Wer den Verlauf wirklich braucht - bei
                  Verdacht auf eine Kampagne -, klappt ihn auf, und dass er das
                  getan hat, ist ihm dann bewusst. */}
              {vorgang.klickfolge !== null && vorgang.klickfolge.length > 0 ? (
                <details className="klickfolge">
                  <summary>Vollständige Folge ({vorgang.klickfolge.length} Abstände)</summary>
                  <p className="hinweis">
                    Die Fragen erscheinen in fester Reihenfolge - der n-te Wert ist die Zeit vor
                    der n-ten Antwort. Wird {fristtext(regel("klickfolgen_loeschen").tage)} nach
                    der Abgabe geleert.
                  </p>
                  <code>{vorgang.klickfolge.join(" · ")}</code>
                </details>
              ) : null}
            </li>
            <li>
              <strong>Konto:</strong> {vorgang.kontaktart}
              {vorgang.konto_verifiziert_am ? ", bestätigt" : ", nicht bestätigt"} · angelegt{" "}
              {ZEIT.format(vorgang.konto_erstellt_am)}
            </li>
            <li>
              <strong>Weitere Bewertungen dieses Kontos:</strong>{" "}
              {weitere.length === 0 ? "keine" : weitere.length}
            </li>
            {vorgang.eltern_einwilligung_am ? (
              <li>
                <strong>Elterneinwilligung:</strong> bestätigt am {ZEIT.format(vorgang.eltern_einwilligung_am)}
              </li>
            ) : null}
          </ul>

          {/* Die IP-Adresse taucht hier nicht auf, weil sie nirgends gespeichert
              wird (Entscheidung E3). Sichtbar ist nur, was daraus abgeleitet wurde.
              Der Kontakt liegt verschlüsselt und wird erst auf Klick entschlüsselt -
              auch die verkürzte Anzeige verlangte den Klartext. */}
          <Kontaktfeld bewertungId={vorgang.id} kontaktart={vorgang.kontaktart} />

          {weitere.length > 0 ? (
            <>
              <h2>Weitere Bewertungen desselben Kontos</h2>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th scope="col">Schule</th>
                    <th scope="col">Abgegeben</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {weitere.map((w) => (
                    <tr key={w.id}>
                      <td><a href={`/moderation/${w.id}`}>{w.schule_name}</a></td>
                      <td>{ZEIT.format(w.erstellt_am)}</td>
                      <td>{ZUSTAND_LABEL[w.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          <h2>Angaben</h2>
          <dl className="angaben">
            <dt>Rolle</dt>
            <dd>{ROLLE_LABEL[vorgang.rolle] ?? vorgang.rolle}</dd>
            {vorgang.klassenstufe ? (
              <>
                <dt>Klassenstufe</dt>
                <dd>{vorgang.klassenstufe}. Klasse</dd>
              </>
            ) : null}
            {vorgang.abgangsjahr ? (
              <>
                <dt>Abgangsjahr</dt>
                <dd>{vorgang.abgangsjahr}</dd>
              </>
            ) : null}
            <dt>Abgegeben</dt>
            <dd>{ZEIT.format(vorgang.erstellt_am)}</dd>
            <dt>Gesamtwertung</dt>
            <dd>{vorgang.gesamtscore === null ? "-" : `${ZAHL.format(Number(vorgang.gesamtscore))} von 10`}</dd>
          </dl>

          {freitexte.length > 0 ? (
            <>
              <h2>Freitexte</h2>
              <p className="hinweis">
                Freitexte werden nie wörtlich veröffentlicht - sie gehen in die Zusammenfassung ein
                (Entwicklungsplan, Abschnitt 10.2). Hier stehen sie im Original, weil die Prüfung
                genau daran hängt.
              </p>
              {freitexte.map(([schluessel, text]) => (
                <blockquote key={schluessel} className="freitext">
                  <p>{text}</p>
                  <cite>{FRAGE_NACH_ID.get(schluessel)?.text ?? schluessel}</cite>
                </blockquote>
              ))}
            </>
          ) : null}

          <h2>Antworten</h2>
          {KATEGORIEN.map((kategorie) => {
            const fragen = fragenDerKategorie(kategorie.id).filter(
              (f) => vorgang.antworten[f.id] !== undefined,
            );
            if (fragen.length === 0) return null;
            return (
              <details key={kategorie.id} className="kategorie">
                <summary>
                  {kategorie.id} - {kategorie.titel}{" "}
                  <span className="gedaempft">({fragen.length} beantwortet)</span>
                </summary>
                <ul className="antwortliste">
                  {fragen.map((f) => {
                    const wert = vorgang.antworten[f.id];
                    const label =
                      wert === KEINE_ANGABE
                        ? LABEL_KEINE_ANGABE
                        : (SKALEN[f.skala].find((o) => o.wert === wert)?.label ?? String(wert));
                    return (
                      <li key={f.id}>
                        <span className="frage">{f.text}</span>
                        <span className="antwortwert">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>

        <aside>
          <Entscheidungsfeld bewertungId={vorgang.id} status={status} />

          <h2>Verlauf</h2>
          {protokoll.length === 0 ? (
            <p className="gedaempft">Noch keine Einträge.</p>
          ) : (
            <ol className="verlauf">
              {protokoll.map((e) => (
                <li key={e.id}>
                  <strong>{PROTOKOLL_LABEL[e.aktion] ?? e.aktion}</strong>
                  <span className="gedaempft">
                    {" "}
                    {ZEIT.format(e.erstellt_am)}
                    {e.moderator_name ? ` · ${e.moderator_name}` : ""}
                  </span>
                  {e.begruendung ? <p>{e.begruendung}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}
