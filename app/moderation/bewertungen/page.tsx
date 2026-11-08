import type { Metadata } from "next";
import { alleBewertungen, bewertungszahlen } from "@/db/moderation";
import { istBundesland, BUNDESLAND_LABEL, BUNDESLAENDER } from "@/domain/bundesland";
import { ROLLE_LABEL, type Rolle } from "@/domain/bewertungseingabe";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { verlangeAnmeldung } from "../sitzung";

export const metadata: Metadata = { title: "Bewertungen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const PRO_SEITE = 100;

const ZUSTAENDE: readonly Zustand[] = [
  "wartet_auf_verifizierung",
  "in_pruefung_geo",
  "in_pruefung_betrug",
  "freigegeben",
  "abgelehnt",
];

/**
 * Alle Bewertungen, zeitlich.
 *
 * **Warum es diese Seite neben der Warteschlange gibt.** Die Warteschlange
 * beantwortet „was muss ich jetzt entscheiden" und zeigt deshalb nur, was
 * angehalten wurde - älteste zuerst. Was *sonst* passiert, sah man bisher
 * nirgends: ob überhaupt Bewertungen ankommen, wie viele an der Bestätigung
 * hängen, ob eine Welle auf eine Schule läuft. Das sind andere Fragen als
 * „welcher Fall ist dran", und sie brauchen eine andere Ansicht.
 *
 * Kurzform heisst: eine Zeile je Bewertung, alles Wichtige ohne Klick - und
 * **kein Freitext**. Wer hier mitliest, soll den Betrieb überblicken, nicht
 * nebenbei die Texte Minderjähriger durchsehen; dafür gibt es den Vorgang,
 * und der steht im Protokoll.
 */
export default async function Bewertungsseite({
  searchParams,
}: {
  searchParams: Promise<{ zustand?: string; bundesland?: string; suche?: string; seite?: string }>;
}) {
  await verlangeAnmeldung();
  const p = await searchParams;

  const zustand = ZUSTAENDE.includes(p.zustand as Zustand) ? (p.zustand as Zustand) : undefined;
  const roh = p.bundesland ?? "";
  const bundesland = istBundesland(roh) ? roh : undefined;
  const suche = (p.suche ?? "").trim() || undefined;
  const seite = Math.max(Number(p.seite ?? "1") || 1, 1);

  const filter = { zustand, bundesland, suche };
  const [zeilen, zahlen] = await Promise.all([
    alleBewertungen({ status: zustand, bundesland, suche, seite, proSeite: PRO_SEITE }),
    bewertungszahlen({ bundesland, suche }),
  ]);

  const getroffen = zustand === undefined ? zahlen.gesamt : (zahlen.jeZustand[zustand] ?? 0);
  const seiten = Math.max(Math.ceil(getroffen / PRO_SEITE), 1);

  function adresse(aenderung: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    const zusammen = { ...filter, seite, ...aenderung };
    for (const [k, v] of Object.entries(zusammen)) {
      if (v !== undefined && v !== "" && !(k === "seite" && v === 1)) q.set(k, String(v));
    }
    const s = q.toString();
    return s === "" ? "/moderation/bewertungen" : `/moderation/bewertungen?${s}`;
  }

  return (
    <section className="abschnitt">
      <h1>Bewertungen</h1>
      <p className="hinweis">
        Alle Bewertungen, die neueste zuerst - auch die bereits entschiedenen. Freitexte stehen
        hier nicht: Wer sie liest, tut das im Vorgang, und das steht im Protokoll.
      </p>

      <form className="suchfilter" method="get">
        <label className="feld">
          <span>Schule</span>
          <input type="search" name="suche" defaultValue={suche ?? ""} placeholder="Name oder Ort" />
        </label>
        <label className="feld">
          <span>Zustand</span>
          <select name="zustand" defaultValue={zustand ?? ""}>
            <option value="">alle ({zahlen.gesamt})</option>
            {ZUSTAENDE.map((z) => (
              <option key={z} value={z}>
                {ZUSTAND_LABEL[z]} ({zahlen.jeZustand[z] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          <span>Bundesland</span>
          <select name="bundesland" defaultValue={bundesland ?? ""}>
            <option value="">alle</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>
        </label>
        <button className="knopf zweitrangig">Filtern</button>
      </form>

      <p className="bestandshinweis">
        {getroffen === 0
          ? "Keine Bewertung passt zu diesem Filter."
          : `${getroffen} Bewertung${getroffen === 1 ? "" : "en"}${
              seiten > 1 ? ` · Seite ${seite} von ${seiten}` : ""
            }`}
      </p>

      {zeilen.length === 0 ? null : (
        <table className="tabelle bewertungsliste">
          <thead>
            <tr>
              <th scope="col">Abgegeben</th>
              <th scope="col">Schule</th>
              <th scope="col">Rolle</th>
              <th scope="col">Wertung</th>
              <th scope="col">Zustand</th>
              <th scope="col">Risiko</th>
              <th scope="col">Befund</th>
              <th scope="col">Kontakt</th>
              <th scope="col"><span className="versteckt">Vorgang</span></th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const punkte = z.signalpunkte ?? 0;
              return (
                <tr key={z.id} className={z.ist_demo ? "demozeile" : undefined}>
                  <td data-spalte="Abgegeben">
                    {ZEIT.format(z.erstellt_am)}
                    {z.version > 1 ? (
                      <span className="gedaempft"> · geändert {ZEIT.format(z.aktualisiert_am)}</span>
                    ) : null}
                  </td>
                  <td data-spalte="Schule">
                    <a href={`/schule/${z.schule_slug}`}>{z.schule_name}</a>
                    {z.schule_ort ? <span className="gedaempft"> · {z.schule_ort}</span> : null}
                  </td>
                  <td data-spalte="Rolle">{ROLLE_LABEL[z.rolle as Rolle] ?? z.rolle}</td>
                  <td data-spalte="Wertung">
                    {z.gesamtscore === null ? "–" : Number(z.gesamtscore).toFixed(1)}
                    {z.hat_freitext ? <span className="gedaempft" title="mit Freitext"> ·&nbsp;T</span> : null}
                  </td>
                  <td data-spalte="Zustand">{ZUSTAND_LABEL[z.status]}</td>
                  <td data-spalte="Risiko">
                    {punkte === 0 ? (
                      "–"
                    ) : (
                      <>
                        {/* Ein Punkt in Ampelfarbe: Eine 5 und eine 3 sehen als
                            blosse Ziffern gleich aus, und diese Spalte wird
                            überflogen, nicht gelesen. */}
                        <span
                          className={`punkt ${punkte >= 6 ? "schlecht" : punkte >= 3 ? "mittel" : "gut"}`}
                        />{" "}
                        {punkte}
                      </>
                    )}
                  </td>
                  <td data-spalte="Befund" className="befundspalte">
                    {(z.signale ?? []).length === 0 ? (
                      <span className="gedaempft">ohne Befund</span>
                    ) : (
                      (z.signale ?? []).map((s) => s.erlaeuterung ?? s.art).join("; ")
                    )}
                  </td>
                  <td data-spalte="Kontakt">
                    {z.kontaktart ?? "–"}
                    {z.konto_bestaetigt ? null : <span className="gedaempft"> · unbestätigt</span>}
                  </td>
                  <td>
                    <a className="knopf zweitrangig klein" href={`/moderation/${z.id}`}>Vorgang</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {seiten > 1 ? (
        <nav className="blaettern" aria-label="Seiten">
          {seite > 1 ? <a className="knopf zweitrangig" href={adresse({ seite: seite - 1 })}>Neuere</a> : null}
          <span className="gedaempft">Seite {seite} von {seiten}</span>
          {seite < seiten ? <a className="knopf zweitrangig" href={adresse({ seite: seite + 1 })}>Ältere</a> : null}
        </nav>
      ) : null}
    </section>
  );
}
