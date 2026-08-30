import type { Metadata } from "next";
import { einer } from "@/domain/suchparameter";
import { empfehlungsliste, empfehlungszahlen, topWerber } from "@/db/empfehlungen";
import { GEWINNE, VERLOSUNG_LABEL, monatsname, monatszeitraum } from "@/domain/verlosung";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { verlangeAnmeldung } from "../sitzung";

export const metadata: Metadata = {
  title: "Empfehlungen",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const ZAHL = new Intl.NumberFormat("de-DE");

/** Die letzten zwölf Monate zur Auswahl - weiter zurück fragt niemand. */
function monatsauswahl(jetzt = new Date()): { jahr: number; monat: number }[] {
  const liste: { jahr: number; monat: number }[] = [];
  let jahr = jetzt.getUTCFullYear();
  let monat = jetzt.getUTCMonth() + 1;
  for (let i = 0; i < 12; i++) {
    liste.push({ jahr, monat });
    monat -= 1;
    if (monat === 0) {
      monat = 12;
      jahr -= 1;
    }
  }
  return liste;
}

/**
 * Wer wen geworben hat.
 *
 * Die Liste zeigt beide Kennungen: die des werbenden Kontos - das ist die
 * UUID, die im Empfehlungslink steht - und die des geworbenen. Dazu, ob die
 * geworbene Bewertung schon veröffentlicht ist, denn erst dann zählt die
 * Empfehlung für Super- und Mega-Verlosung.
 *
 * **Die Spalte, auf die es ankommt, ist „selbes Gerät“.** Wer sich selbst
 * wirbt, tut das fast immer im selben Browser - privates Fenster, zweites
 * Konto, dieselbe Maschine. Ein Beweis ist es nicht: In einer Familie oder im
 * Computerraum ist derselbe Browser der Normalfall. Es ist der erste Ort, an
 * dem man hinsieht, bevor 100 Empfehlungen einen Gutschein über 1000 Euro
 * auslösen.
 */
export default async function Empfehlungsseite({
  searchParams,
}: {
  searchParams: Promise<{
    zeitraum?: string | string[];
    /** Altbestand: einzelne Parameter aus gespeicherten Links. */
    jahr?: string | string[];
    monat?: string | string[];
    nur?: string | string[];
  }>;
}) {
  await verlangeAnmeldung();
  const p = await searchParams;

  const jetzt = new Date();
  const auswahl = monatsauswahl(jetzt);
  // Jahr und Monat in einem Wert. Vorher trug die Option nur den Monat und das
  // Jahr stand fest daneben - wer im August 2026 „Dezember 2025" wählte,
  // sendete `jahr=2026&monat=12`, fand nichts und landete kommentarlos wieder
  // im laufenden Monat. Vier von zwölf Monaten waren so unerreichbar,
  // ausgerechnet in dem Bereich, der die Rückschau leisten soll.
  const [rohJahr, rohMonat] = (einer(p.zeitraum) ?? "").split("-");
  const jahr = Number(rohJahr ?? einer(p.jahr) ?? auswahl[0]!.jahr);
  const monat = Number(rohMonat ?? einer(p.monat) ?? auswahl[0]!.monat);
  const gewaehlt = auswahl.find((m) => m.jahr === jahr && m.monat === monat) ?? auswahl[0]!;
  const nurAuffaellig = einer(p.nur) === "geraet";

  const zeitraum = monatszeitraum(gewaehlt.jahr, gewaehlt.monat);
  const [zahlen, liste, werber] = await Promise.all([
    empfehlungszahlen(zeitraum),
    empfehlungsliste(zeitraum, { nurAuffaellig }),
    topWerber(zeitraum),
  ]);


  return (
    <section className="abschnitt">
      <h1>Empfehlungen</h1>
      <p className="hinweis">
        Wer über den Link einer anderen Person gekommen ist und selbst bewertet hat. Gezählt wird
        eine Empfehlung erst, wenn die geworbene Bewertung <strong>veröffentlicht</strong> ist -
        ab einer zählenden Empfehlung ist die werbende Person in der {VERLOSUNG_LABEL.super}, ab{" "}
        {GEWINNE.mega.mindestEmpfehlungen} in der {VERLOSUNG_LABEL.mega}.
      </p>

      <form className="filter" method="get">
        <label htmlFor="monat" className="versteckt">Monat</label>
        <select
          id="monat"
          name="zeitraum"
          defaultValue={`${gewaehlt.jahr}-${gewaehlt.monat}`}
        >
          {auswahl.map((m) => (
            <option key={`${m.jahr}-${m.monat}`} value={`${m.jahr}-${m.monat}`}>
              {monatsname(m.jahr, m.monat)}
            </option>
          ))}
        </select>
        <label className="feld klein schalterfeld">
          <input type="checkbox" name="nur" value="geraet" defaultChecked={nurAuffaellig} />
          <span>Nur vom selben Gerät</span>
        </label>
        <button className="knopf zweitrangig klein">Anzeigen</button>
      </form>

      <div className="kennzahlen">
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(zahlen.gesamt)}</span>
          <span className="beschriftung">geworbene Bewertungen</span>
        </div>
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(zahlen.zaehlend)}</span>
          <span className="beschriftung">davon veröffentlicht</span>
        </div>
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(zahlen.werber)}</span>
          <span className="beschriftung">werbende Konten</span>
        </div>
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(zahlen.selbesGeraet)}</span>
          <span className="beschriftung">davon selbes Gerät</span>
        </div>
      </div>

      <h2>Aktivste Werber im {monatsname(gewaehlt.jahr, gewaehlt.monat)}</h2>
      {werber.length === 0 ? (
        <p className="gedaempft">In diesem Monat wurde niemand geworben.</p>
      ) : (
        <ul className="werberliste">
          {werber.map((w) => (
            <li key={w.kontoId}>
              <code className="kennung">{w.kontoId}</code>
              <span className="code">{w.code ?? "ohne Code"}</span>
              <span className="zaehler">
                {ZAHL.format(w.zaehlend)} zählend / {ZAHL.format(w.geworben)} gesamt
              </span>
              {w.vomSelbenGeraet > 0 ? (
                <span className="plakette schlecht">
                  {ZAHL.format(w.vomSelbenGeraet)} vom selben Gerät
                </span>
              ) : null}
              {w.zaehlend >= GEWINNE.mega.mindestEmpfehlungen ? (
                <span className="plakette gut">{VERLOSUNG_LABEL.mega}</span>
              ) : w.zaehlend >= GEWINNE.super.mindestEmpfehlungen ? (
                <span className="plakette neutral">{VERLOSUNG_LABEL.super}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h2>Einzelne Empfehlungen</h2>
      {liste.length === 0 ? (
        <p className="gedaempft">
          {nurAuffaellig
            ? "Keine Empfehlung aus demselben Browser in diesem Monat."
            : "In diesem Monat wurde niemand geworben."}
        </p>
      ) : (
        <ul className="empfehlungsliste">
          {liste.map((z) => (
            <li key={z.id} className={z.gleichesGeraet ? "auffaellig" : ""}>
              <div className="zeile">
                <span className="beschriftung">geworben von</span>
                <code className="kennung">{z.werberId}</code>
                <span className="code">{z.werbercode ?? "ohne Code"}</span>
              </div>
              <div className="zeile">
                <span className="beschriftung">Konto</span>
                <code className="kennung">{z.geworbenId}</code>
                <span className="gedaempft">{ZEIT.format(z.erstelltAm)}</span>
              </div>
              <div className="zeile">
                <span className="beschriftung">Bewertung</span>
                {z.bewertungId === null ? (
                  <span className="gedaempft">keine</span>
                ) : (
                  <>
                    <a href={`/moderation/${z.bewertungId}`}>
                      {z.schulname ?? "Schule unbekannt"}
                    </a>
                    <span className={z.status === "freigegeben" ? "plakette gut" : "plakette neutral"}>
                      {z.status !== null && Object.hasOwn(ZUSTAND_LABEL, z.status)
                        ? ZUSTAND_LABEL[z.status as Zustand]
                        : (z.status ?? "unbekannt")}
                    </span>
                  </>
                )}
                {z.gleichesGeraet ? (
                  <span className="plakette schlecht">selbes Gerät wie der Werber</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="fussnote">
        Die Gerätekennung ist ein Hinweis, kein Nachweis: Ein privates Fenster hat eine neue, und
        Geschwister an einem Rechner teilen sich dieselbe. Was hier rot steht, gehört angesehen -
        nicht automatisch abgelehnt.
      </p>
    </section>
  );
}
