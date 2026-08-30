import type { Metadata } from "next";
import { BUNDESLAND_LABEL } from "@/domain/bundesland";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { ROLLE_LABEL, type Rolle } from "@/domain/bewertungseingabe";
import { KATEGORIEN } from "@/domain/fragebogen";
import { aufZehnerskala, scorestufe } from "@/domain/scoring";
import {
  analysiereSchule,
  bewertungenDerSchule,
  gesamtlage,
  signalhaeufigkeit,
  sucheSchulenFuerAnalyse,
  verlaufNachMonat,
} from "@/db/analytik";
import { holeEinstellungen } from "@/db/einstellungen";
import { zahl } from "@/domain/einstellungen";
import { verlangeAnmeldung } from "../sitzung";
import Risikotabelle from "./risikotabelle";
import { einer } from "@/domain/suchparameter";

export const metadata: Metadata = { title: "Auswertung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

const ZUSTAENDE: readonly Zustand[] = [
  "freigegeben",
  "in_pruefung_geo",
  "in_pruefung_betrug",
  "wartet_auf_verifizierung",
  "abgelehnt",
];

function istZustand(wert: string): wert is Zustand {
  return (ZUSTAENDE as readonly string[]).includes(wert);
}

/** Ein Balken, dessen Länge sich am größten Wert der Reihe bemisst. */
function Balkenzeile({
  beschriftung,
  wert,
  hoechster,
  zusatz,
}: {
  beschriftung: string;
  wert: number;
  hoechster: number;
  zusatz?: string;
}) {
  return (
    <div className="analysezeile">
      <span className="beschriftung">{beschriftung}</span>
      <span className="kategoriebalken" aria-hidden="true">
        <span
          className="fuellung"
          style={{ width: `${hoechster === 0 ? 0 : Math.max(2, (wert / hoechster) * 100)}%` }}
        />
      </span>
      <span className="zahl">
        {ZAHL.format(wert)}
        {zusatz ? <span className="gedaempft"> {zusatz}</span> : null}
      </span>
    </div>
  );
}

/**
 * Auswertung.
 *
 * Zwei Ebenen: das Portal im Ganzen und eine einzelne Schule. Beide zeigen
 * bewusst auch, was öffentlich nicht sichtbar ist - abgelehnte, angehaltene und
 * unbestätigte Bewertungen. Wer die Qualität des Bestandes beurteilen will,
 * muss sie sehen; die Startseite zeigt sie zu Recht nicht.
 *
 * Entschieden wird hier nichts. Eine Auswertung, aus der heraus man freigeben
 * kann, verführt dazu, aus der Statistik statt aus dem Vorgang zu moderieren.
 */
export default async function Analyseseite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; schule?: string | string[]; status?: string | string[] }>;
}) {
  const moderatorin = await verlangeAnmeldung();
  const p = await searchParams;
  const rohStatus = einer(p.status);
  const status = rohStatus !== undefined && istZustand(rohStatus) ? rohStatus : "alle";
  const suchbegriff = einer(p.q);
  const schulkennung = einer(p.schule);

  const [lage, signale, verlauf, treffer, einstellungen] = await Promise.all([
    gesamtlage(),
    signalhaeufigkeit(),
    verlaufNachMonat(),
    suchbegriff ? sucheSchulenFuerAnalyse(suchbegriff) : Promise.resolve([]),
    holeEinstellungen(),
  ]);
  // Die Risikofarben hängen an derselben Halteschwelle, die auch entscheidet,
  // was angehalten wird - sonst hieße „hohes Risiko“ etwas anderes als das,
  // was das Portal tatsächlich zurückhält.
  const halteschwelle = zahl(einstellungen, "halteschwelle");

  const analyse = schulkennung ? await analysiereSchule(schulkennung) : null;
  const bewertungen = analyse === null ? [] : await bewertungenDerSchule(analyse.schule.id, status);

  const hoechsterMonat = Math.max(1, ...verlauf.map((m) => m.abgaben));
  const hoechstesSignal = Math.max(1, ...signale.map((s) => s.anzahl));

  return (
    <>
      <section className="abschnitt">
        <h1>Auswertung</h1>
        <p className="hinweis">
          Zahlen über den ganzen Bestand - einschließlich dessen, was öffentlich nicht sichtbar
          ist. Entschieden wird hier nichts; dafür ist die Warteschlange da.
        </p>

        <div className="kennzahlen">
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.bewertungen)}</span>
            <span className="beschriftung">Bewertungen insgesamt</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.freigegeben)}</span>
            <span className="beschriftung">freigegeben</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.inPruefung)}</span>
            <span className="beschriftung">in Prüfung</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.abgelehnt)}</span>
            <span className="beschriftung">abgelehnt</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.wartetAufBestaetigung)}</span>
            <span className="beschriftung">unbestätigt</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.letzte7Tage)}</span>
            <span className="beschriftung">in sieben Tagen</span>
          </div>
        </div>

        <ul className="hinweisliste">
          <li>
            <strong>Ablehnungsquote:</strong>{" "}
            {lage.freigegeben + lage.abgelehnt === 0
              ? "noch keine Entscheidungen"
              : `${WERT.format((lage.abgelehnt / (lage.freigegeben + lage.abgelehnt)) * 100)} % der entschiedenen Bewertungen`}
          </li>
          <li>
            <strong>Mittlere Bearbeitungsdauer:</strong>{" "}
            {lage.bearbeitungsdauerStunden === null
              ? "noch nichts entschieden"
              : `${WERT.format(lage.bearbeitungsdauerStunden)} Stunden von der Abgabe bis zur Entscheidung`}
          </li>
          <li>
            <strong>Ältester offener Vorgang:</strong>{" "}
            {lage.aeltesterOffenerVorgang === null
              ? "keiner offen"
              : ZEIT.format(lage.aeltesterOffenerVorgang)}
          </li>
          <li>
            <strong>Schulen mit mindestens einer Bewertung:</strong>{" "}
            {ZAHL.format(lage.schulenBewertet)}
          </li>
        </ul>
      </section>

      <section className="abschnitt">
        <h2>Abgaben je Monat</h2>
        <div className="analyse">
          {verlauf.length === 0 ? (
            <p className="gedaempft">Noch keine Abgaben.</p>
          ) : (
            verlauf.map((m) => (
              <Balkenzeile
                key={m.monat}
                beschriftung={m.monat}
                wert={m.abgaben}
                hoechster={hoechsterMonat}
                zusatz={`· ${m.freigegeben} frei, ${m.abgelehnt} abgelehnt`}
              />
            ))
          )}
        </div>
      </section>

      <section className="abschnitt">
        <h2>Welche Signale anschlagen</h2>
        <p className="hinweis">
          Wie oft ein Signal in einem gespeicherten Befund vorkam - und bei wie vielen davon die
          Bewertung angehalten oder abgelehnt wurde. Ein Signal, das nie mit einer Entscheidung
          zusammenfällt, ist entweder zu locker eingestellt oder überflüssig.
        </p>
        <div className="analyse">
          {signale.length === 0 ? (
            <p className="gedaempft">Noch keine Befunde gespeichert.</p>
          ) : (
            signale.map((s) => (
              <Balkenzeile
                key={s.art}
                beschriftung={s.art}
                wert={s.anzahl}
                hoechster={hoechstesSignal}
                zusatz={`· ${s.gehalten} angehalten`}
              />
            ))
          )}
        </div>
      </section>

      <section className="abschnitt">
        <h2>Einzelne Schule ansehen</h2>
        <form className="filter" method="get">
          <label htmlFor="q" className="versteckt">Schule suchen</label>
          <input id="q" name="q" defaultValue={suchbegriff ?? ""} placeholder="Name, Ort oder Postleitzahl" />
          <button className="knopf zweitrangig">Suchen</button>
        </form>

        {treffer.length > 0 ? (
          <ul className="kartentreffer">
            {treffer.map((s) => (
              <li key={s.id}>
                <a
                  className={analyse?.schule.id === s.id ? "eintrag gewaehlt" : "eintrag"}
                  href={`/moderation/analytik?schule=${s.id}${suchbegriff ? `&q=${encodeURIComponent(suchbegriff)}` : ""}`}
                >
                  <span className="name">
                    {s.name}
                    <span>
                      {[s.ort, BUNDESLAND_LABEL[s.bundesland]].filter(Boolean).join(" · ")} ·{" "}
                      {ZAHL.format(s.bewertungen)} Bewertungen
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : suchbegriff ? (
          <p className="gedaempft">Kein Treffer.</p>
        ) : null}
      </section>

      {analyse !== null ? (
        <>
          <section className="abschnitt">
            <div className="abschnittskopf">
              <h2>{analyse.schule.name}</h2>
              <a href={`/schule/${analyse.schule.slug}`}>Öffentliches Profil</a>
            </div>

            <div className="kennzahlen">
              {ZUSTAENDE.map((z) => (
                <div key={z} className="kennzahl">
                  <span className="zahl">{ZAHL.format(analyse.zustaende[z] ?? 0)}</span>
                  <span className="beschriftung">{ZUSTAND_LABEL[z]}</span>
                </div>
              ))}
              <div className="kennzahl">
                <span className="zahl">
                  {analyse.aggregat?.gesamtscore === null || analyse.aggregat === null
                    ? "-"
                    : WERT.format(Number(analyse.aggregat.gesamtscore))}
                </span>
                <span className="beschriftung">veröffentlichte Wertung</span>
              </div>
            </div>
          </section>

          <section className="abschnitt">
            <h3>Wer bewertet hat</h3>
            <div className="analyse">
              {analyse.rollen.map((r) => (
                <Balkenzeile
                  key={r.rolle}
                  beschriftung={ROLLE_LABEL[r.rolle as Rolle] ?? r.rolle}
                  wert={r.anzahl}
                  hoechster={Math.max(1, ...analyse.rollen.map((x) => x.anzahl))}
                />
              ))}
            </div>

            <h3>Kategorien im Schnitt</h3>
            <div className="analyse">
              {analyse.kategorien.map((k) => {
                const anzeige = k.schnitt === null ? 0 : aufZehnerskala(k.schnitt);
                return (
                  <div key={k.kategorie} className="analysezeile">
                    <span className="beschriftung">
                      {KATEGORIEN.find((x) => x.id === k.kategorie)?.titel ?? k.kategorie}
                    </span>
                    <span className="kategoriebalken" aria-hidden="true">
                      <span
                        className={`fuellung ${scorestufe(anzeige)}`}
                        style={{ width: `${Math.max(2, anzeige * 10)}%` }}
                      />
                    </span>
                    <span className={`zahl ${scorestufe(anzeige)}`}>{WERT.format(anzeige)}</span>
                  </div>
                );
              })}
            </div>

            {analyse.signale.length > 0 ? (
              <>
                <h3>Signale bei dieser Schule</h3>
                <div className="analyse">
                  {analyse.signale.map((s) => (
                    <Balkenzeile
                      key={s.art}
                      beschriftung={s.art}
                      wert={s.anzahl}
                      hoechster={Math.max(1, ...analyse.signale.map((x) => x.anzahl))}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="abschnitt">
            <div className="abschnittskopf">
              <h3>Alle Bewertungen dieser Schule</h3>
              <span className="gedaempft">{ZAHL.format(bewertungen.length)} angezeigt</span>
            </div>

            <div className="wahl">
              {(["alle", ...ZUSTAENDE] as const).map((z) => (
                <a
                  key={z}
                  className={status === z ? "wahlfeld gewaehlt" : "wahlfeld"}
                  href={`/moderation/analytik?schule=${analyse.schule.id}${
                    suchbegriff ? `&q=${encodeURIComponent(suchbegriff)}` : ""
                  }${z === "alle" ? "" : `&status=${z}`}`}
                >
                  {/* Zwei Zustände heißen beide „Wird geprüft“ - in einer
                      Filterleiste nebeneinander ist das unbrauchbar. Hier steht
                      deshalb dazu, woran sie hängen. */}
                  {z === "alle"
                    ? "Alle"
                    : z === "in_pruefung_geo"
                      ? "Prüfung: Ort"
                      : z === "in_pruefung_betrug"
                        ? "Prüfung: Muster"
                        : ZUSTAND_LABEL[z]}
                </a>
              ))}
            </div>

            <Risikotabelle
              schuleId={analyse.schule.id}
              halteschwelle={halteschwelle}
              darfAnalysieren={moderatorin.rolle === "leitung"}
              zeilen={bewertungen.map((b) => ({
                id: b.id,
                status: b.status,
                rolle: b.rolle,
                erstellt_am: b.erstellt_am.toISOString(),
                gesamtscore: b.gesamtscore,
                signalpunkte: b.signalpunkte,
                signale: b.signale ?? [],
                hat_freitext: b.hat_freitext,
                ist_demo: b.ist_demo,
                ablehnungsgrund: b.ablehnungsgrund,
              }))}
            />

          </section>
        </>
      ) : null}
    </>
  );
}
