import type { Metadata } from "next";
import { lageDiagnosezugang } from "@/db/diagnosezugang";
import { ereigniszahlen, leseEreignisse, raeumeAuf } from "@/db/ereignisse";
import { EREIGNISARTEN, istEreignisart, PROTOKOLL_STUNDEN } from "@/domain/diagnose";
import { verlangeAnmeldung } from "../sitzung";
import Zugangsblock from "./zugangsblock";

export const metadata: Metadata = { title: "Diagnose", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "medium",
});

/**
 * Diagnose: der Schalter und das Protokoll.
 *
 * Beides auf einer Seite, weil beides dieselbe Frage beantwortet - „was ist
 * hier los?“ - und weil der Schalter sonst eine Seite für sich wäre, die man
 * einmal im Quartal aufruft und deren Zustand niemand im Blick hat. So steht
 * neben jedem Protokolleintrag, ob gerade jemand von außen mitliest.
 */
export default async function Diagnoseseite({
  searchParams,
}: {
  searchParams: Promise<{ art?: string; bereich?: string; suche?: string }>;
}) {
  const moderatorin = await verlangeAnmeldung();
  const p = await searchParams;

  await raeumeAuf();

  const [lage, zeilen, zahlen] = await Promise.all([
    lageDiagnosezugang(),
    leseEreignisse({
      art: p.art !== undefined && istEreignisart(p.art) ? p.art : undefined,
      bereich: p.bereich === undefined || p.bereich === "" ? undefined : p.bereich,
      suche: p.suche === undefined || p.suche === "" ? undefined : p.suche,
      grenze: 200,
    }),
    ereigniszahlen(),
  ]);

  const bereiche = [...new Set(zahlen.map((z) => z.bereich))].sort();
  const fehlerzahl = zahlen
    .filter((z) => z.art === "fehler")
    .reduce((s, z) => s + z.anzahl, 0);

  return (
    <section className="abschnitt">
      <h1>Diagnose</h1>
      <p className="hinweis">
        Das Betriebsprotokoll der letzten {PROTOKOLL_STUNDEN} Stunden und der Zugang, über den
        es sich von außen abrufen lässt. Ältere Einträge werden gelöscht - das ist die einzige
        Stelle im Portal, an der etwas ohne Klick verschwindet, und der Unterschied ist
        beabsichtigt: Hier liegen Betriebsspuren, keine Angaben von Menschen.
      </p>

      <Zugangsblock
        offen={lage.offen}
        gueltigBis={lage.gueltigBis?.toISOString() ?? null}
        erstelltVon={lage.erstelltVon}
        zugriffe={lage.zugriffe}
        letzterZugriffAm={lage.letzterZugriffAm?.toISOString() ?? null}
        darfSchalten={moderatorin.rolle === "leitung"}
        basis={process.env["BASIS_URL"] ?? ""}
      />

      <div className="karte">
        <span className="beschriftung">Protokoll</span>

        {zahlen.length === 0 ? (
          <p>
            Keine Einträge in den letzten {PROTOKOLL_STUNDEN} Stunden. Bei einem Portal, das
            läuft, ist das der Normalfall - Erfolge werden nicht protokolliert.
          </p>
        ) : (
          <p className="fussnote">
            {zahlen.reduce((s, z) => s + z.anzahl, 0).toLocaleString("de-DE")} Einträge, davon{" "}
            {fehlerzahl.toLocaleString("de-DE")} Fehler.
          </p>
        )}

        <form method="get" className="filterreihe">
          <label className="feldgruppe">
            <span>Art</span>
            <select name="art" defaultValue={p.art ?? ""} className="feld">
              <option value="">alle</option>
              {EREIGNISARTEN.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="feldgruppe">
            <span>Bereich</span>
            <select name="bereich" defaultValue={p.bereich ?? ""} className="feld">
              <option value="">alle</option>
              {bereiche.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="feldgruppe">
            <span>Suche in der Meldung</span>
            <input name="suche" defaultValue={p.suche ?? ""} className="feld" />
          </label>
          <button className="knopf zweitrangig">Filtern</button>
        </form>

        {zeilen.length === 0 ? (
          <p className="gedaempft">Keine Einträge zu diesem Filter.</p>
        ) : (
          <div className="tabellenrahmen">
            <table className="tabelle protokolltabelle">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Art</th>
                  <th>Bereich</th>
                  <th>Meldung</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.id}>
                    <td className="einspaltig">{ZEIT.format(z.erstellt_am)}</td>
                    <td>
                      <span className={`plakette ${z.art}`}>{z.art}</span>
                    </td>
                    <td>{z.bereich}</td>
                    <td>
                      {z.meldung}
                      {z.pfad ? <div className="fussnote">{z.pfad}</div> : null}
                      {Object.keys(z.einzelheiten).length > 0 ? (
                        <details className="einzelheiten">
                          <summary>Einzelheiten</summary>
                          <pre>{JSON.stringify(z.einzelheiten, null, 2)}</pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
