import type { Metadata } from "next";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland, type Bundesland } from "@/domain/bundesland";
import { SCHULART_LABEL } from "@/import/schulart";
import { importlage, letzteAenderungen, listeSchulen, SEITENGROESSE } from "@/db/schulverwaltung";
import { verlangeAnmeldung } from "../sitzung";

export const metadata: Metadata = { title: "Schulen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZAHL = new Intl.NumberFormat("de-DE");
const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Der Schulbestand im Panel.
 *
 * Drei Fragen beantwortet die Seite, und zwar in dieser Reihenfolge: Was liegt
 * da? Wie kommt es dahin? Und wie ändere ich einen einzelnen Satz?
 *
 * Der mittlere Teil ist der, der sonst nirgends steht: Der Import läuft **nicht**
 * automatisch. Es gibt keinen Zeitplan, der ihn anstößt - wer das nicht weiß,
 * hält einen ein Jahr alten Bestand für aktuell.
 */
export default async function Schulenseite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bundesland?: string; nur?: string; seite?: string }>;
}) {
  const moderatorin = await verlangeAnmeldung();
  const p = await searchParams;

  const bundesland: Bundesland | undefined =
    p.bundesland !== undefined && istBundesland(p.bundesland) ? p.bundesland : undefined;
  const nur = (["manuell", "ohne_koordinate", "stillgelegt", "bewertet"] as const).find(
    (n) => n === p.nur,
  );
  const seite = Math.max(1, Number(p.seite ?? 1) || 1);

  const [lage, liste, aenderungen] = await Promise.all([
    importlage(),
    listeSchulen({ suche: p.q, bundesland, nur, seite }),
    letzteAenderungen(),
  ]);

  const seiten = Math.max(1, Math.ceil(liste.gesamt / SEITENGROESSE));
  const verweis = (neueSeite: number) => {
    const felder = new URLSearchParams();
    if (p.q) felder.set("q", p.q);
    if (bundesland) felder.set("bundesland", bundesland);
    if (nur) felder.set("nur", nur);
    if (neueSeite > 1) felder.set("seite", String(neueSeite));
    const text = felder.toString();
    return text === "" ? "/moderation/schulen" : `/moderation/schulen?${text}`;
  };

  return (
    <>
      <section className="abschnitt">
        <div className="abschnittskopf">
          <h1>Schulen</h1>
          {moderatorin.rolle === "leitung" ? (
            <a className="knopf klein" href="/moderation/schulen/neu">Schule anlegen</a>
          ) : null}
        </div>

        <div className="kennzahlen">
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.gesamt)}</span>
            <span className="beschriftung">Schulen im Bestand</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.aktiv)}</span>
            <span className="beschriftung">aktiv sichtbar</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.ohneKoordinate)}</span>
            <span className="beschriftung">ohne Koordinate</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.bewertet)}</span>
            <span className="beschriftung">mit Bewertungen</span>
          </div>
          <div className="kennzahl">
            <span className="zahl">{ZAHL.format(lage.manuell)}</span>
            <span className="beschriftung">von Hand gepflegt</span>
          </div>
        </div>
      </section>

      <section className="abschnitt">
        <h2>Woher der Bestand kommt</h2>
        <div className="karte">
          <span className="beschriftung">Kein Zeitplan</span>
          <p>
            Die Daten stammen aus <strong>jedeschule.codefor.de</strong> und werden von Hand
            eingespielt - es gibt keinen Dienst, der das regelmäßig täte. Wer den Bestand
            auffrischen will, führt auf dem Server nacheinander aus:
          </p>
          <pre className="befehl">
{`npx tsx scripts/lade-schulen.ts > schulen.json
SCHULEN_JSON=schulen.json npx tsx scripts/importiere.ts
npx tsx scripts/geokodiere.ts --anzahl 1000`}
          </pre>
          <p className="fussnote">
            Der Import ist wiederholbar: Er gleicht über die Quell-Kennung ab, legt Neues an und
            frischt Bestehendes auf. <strong>Von Hand gepflegte Schulen lässt er in Ruhe</strong> -
            sonst wäre jede Korrektur bis zum nächsten Lauf haltbar. Koordinaten holt ein eigener
            Lauf nach, weil die Quelle sie nicht überall mitliefert.
          </p>
          <ul className="hinweisliste">
            <li>
              <strong>Stand der Quelldaten:</strong>{" "}
              {lage.quelleJuengster === null
                ? "unbekannt"
                : `${DATUM.format(lage.quelleAeltester ?? lage.quelleJuengster)} bis ${DATUM.format(lage.quelleJuengster)}`}
            </li>
            <li>
              <strong>Zuletzt geschrieben:</strong>{" "}
              {lage.zuletztGeschrieben === null ? "nie" : ZEIT.format(lage.zuletztGeschrieben)}
            </li>
            <li>
              <strong>Stillgelegt:</strong> {ZAHL.format(lage.stillgelegt)} Schulen sind nicht
              sichtbar, ihre Bewertungen bleiben erhalten.
            </li>
          </ul>
        </div>

        <details className="verteilung">
          <summary>Verteilung auf die Bundesländer</summary>
          <ul className="hinweisliste">
            {lage.jeBundesland.map((z) => (
              <li key={z.bundesland}>
                <strong>{BUNDESLAND_LABEL[z.bundesland]}:</strong> {ZAHL.format(z.anzahl)}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="abschnitt">
        <h2>Bestand durchsehen</h2>
        <form className="filter" method="get">
          <label htmlFor="q" className="versteckt">Suche</label>
          <input id="q" name="q" defaultValue={p.q ?? ""} placeholder="Name, Ort oder Postleitzahl" />

          <label htmlFor="bundesland" className="versteckt">Bundesland</label>
          <select id="bundesland" name="bundesland" defaultValue={bundesland ?? ""}>
            <option value="">Alle Bundesländer</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>

          <label htmlFor="nur" className="versteckt">Auswahl</label>
          <select id="nur" name="nur" defaultValue={nur ?? ""}>
            <option value="">Alle Schulen</option>
            <option value="bewertet">Nur mit Bewertungen</option>
            <option value="manuell">Nur von Hand gepflegte</option>
            <option value="ohne_koordinate">Nur ohne Koordinate</option>
            <option value="stillgelegt">Nur stillgelegte</option>
          </select>

          <button className="knopf zweitrangig">Filtern</button>
          {p.q || bundesland || nur ? (
            <a className="zuruecksetzen" href="/moderation/schulen">Filter zurücksetzen</a>
          ) : null}
        </form>

        <p className="bestandshinweis">
          {ZAHL.format(liste.gesamt)} Treffer · Seite {seite} von {ZAHL.format(seiten)}
        </p>

        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Schule</th>
              <th scope="col">Ort</th>
              <th scope="col">Schularten</th>
              <th scope="col">Bewertungen</th>
              <th scope="col">Zustand</th>
            </tr>
          </thead>
          <tbody>
            {liste.zeilen.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={`/moderation/schulen/${s.id}`}>{s.name}</a>
                </td>
                <td>{[s.plz, s.ort].filter(Boolean).join(" ") || "-"}</td>
                <td>{s.schularten.map((a) => SCHULART_LABEL[a]).join(", ") || "-"}</td>
                <td>{s.bewertungen === 0 ? "-" : ZAHL.format(s.bewertungen)}</td>
                <td>
                  {!s.ist_aktiv ? <span className="plakette schlecht">stillgelegt</span> : null}
                  {s.manuell_gepflegt ? <span className="plakette demo">von Hand</span> : null}
                  {!s.hat_koordinate ? <span className="plakette mittel">ohne Koordinate</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {liste.zeilen.length === 0 ? <p className="hinweis">Kein Treffer.</p> : null}

        {seiten > 1 ? (
          <div className="blaettern">
            {seite > 1 ? <a className="knopf zweitrangig klein" href={verweis(seite - 1)}>Zurück</a> : null}
            {seite < seiten ? <a className="knopf zweitrangig klein" href={verweis(seite + 1)}>Weiter</a> : null}
          </div>
        ) : null}
      </section>

      {aenderungen.length > 0 ? (
        <section className="abschnitt">
          <h2>Letzte Eingriffe von Hand</h2>
          <ul className="hinweisliste">
            {aenderungen.map((a, i) => (
              <li key={i}>
                <strong>{ZEIT.format(a.erstellt_am)}</strong> · {a.moderator ?? "unbekannt"} ·{" "}
                {a.begruendung}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
