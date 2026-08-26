import type { Metadata } from "next";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland } from "@/domain/bundesland";
import {
  ALARM_ALTER_STUNDEN,
  DRINGLICHKEIT_LABEL,
  ZIEL_REAKTION_STUNDEN,
  alterInStunden,
  dringlichkeit,
  warteschlangenalarm,
} from "@/domain/moderation";
import { warteschlange, warteschlangenlage } from "@/db/moderation";
import type { Zustand } from "@/domain/bewertungsstatus";
import type { Bundesland } from "@/domain/bundesland";
import { verlangeAnmeldung } from "./sitzung";

export const metadata: Metadata = { title: "Warteschlange", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ROLLE_LABEL: Readonly<Record<string, string>> = {
  schueler_unter_16: "Schüler:in unter 16",
  schueler_ab_16: "Schüler:in ab 16",
  eltern: "Elternteil",
  lehrkraft: "Lehrkraft",
  ehemalig: "Ehemalige:r",
};

const GRUND_LABEL: Readonly<Record<string, string>> = {
  in_pruefung_geo: "Ort",
  in_pruefung_betrug: "Muster",
};

function alter(stunden: number): string {
  if (stunden < 1) return `${Math.max(1, Math.round(stunden * 60))} min`;
  if (stunden < 48) return `${Math.floor(stunden)} h`;
  return `${Math.floor(stunden / 24)} Tage`;
}

export default async function Warteschlangenseite({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; bundesland?: string; suche?: string }>;
}) {
  await verlangeAnmeldung();
  const p = await searchParams;

  const status = p.status === "in_pruefung_geo" || p.status === "in_pruefung_betrug"
    ? (p.status as Zustand)
    : undefined;
  const bundesland = p.bundesland !== undefined && istBundesland(p.bundesland) ? p.bundesland : undefined;
  const suche = p.suche?.trim() ? p.suche.trim() : undefined;

  const [eintraege, lage] = await Promise.all([
    warteschlange({ status, bundesland, suche }),
    warteschlangenlage(),
  ]);
  const jetzt = new Date();
  const alarme = warteschlangenalarm(lage, jetzt);

  return (
    <section className="abschnitt">
      <h1>Warteschlange</h1>
      <p className="hinweis">
        {lage.laenge} {lage.laenge === 1 ? "Bewertung wartet" : "Bewertungen warten"} auf eine
        Entscheidung. Zusage an die Nutzenden: {ZIEL_REAKTION_STUNDEN} Stunden.
      </p>

      {alarme.length > 0 ? (
        <div className="alarm" role="alert">
          <strong>Rückstand</strong>
          <ul>
            {alarme.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className="filter" method="get">
        <label htmlFor="suche" className="versteckt">Schule</label>
        <input id="suche" name="suche" placeholder="Schule oder Ort" defaultValue={suche ?? ""} />

        <label htmlFor="status" className="versteckt">Prüfgrund</label>
        <select id="status" name="status" defaultValue={status ?? ""}>
          <option value="">Alle Prüfgründe</option>
          <option value="in_pruefung_geo">Ort auffällig</option>
          <option value="in_pruefung_betrug">Muster auffällig</option>
        </select>

        <label htmlFor="bundesland" className="versteckt">Bundesland</label>
        <select id="bundesland" name="bundesland" defaultValue={bundesland ?? ""}>
          <option value="">Alle Bundesländer</option>
          {BUNDESLAENDER.map((b) => (
            <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
          ))}
        </select>

        <button className="knopf zweitrangig">Filtern</button>
      </form>

      {eintraege.length === 0 ? (
        <div className="leerzustand">
          <h2>Nichts zu tun</h2>
          <p>Keine Bewertung wartet auf eine Entscheidung.</p>
        </div>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Alter</th>
              <th scope="col">Schule</th>
              <th scope="col">Rolle</th>
              <th scope="col">Grund</th>
              <th scope="col">Entfernung</th>
              <th scope="col">Freitext</th>
              <th scope="col">Wertung</th>
            </tr>
          </thead>
          <tbody>
            {eintraege.map((e) => {
              const stufe = dringlichkeit(e.erstellt_am, jetzt);
              return (
                <tr key={e.id} className={stufe}>
                  <td>
                    <a href={`/moderation/${e.id}`} className="alterslink">
                      <span className={`plakette ${stufe}`}>{DRINGLICHKEIT_LABEL[stufe]}</span>{" "}
                      {alter(alterInStunden(e.erstellt_am, jetzt))}
                    </a>
                  </td>
                  <td>
                    <a href={`/moderation/${e.id}`}>{e.schule_name}</a>
                    <span className="gedaempft"> · {e.schule_ort ?? "—"} ({e.bundesland})</span>
                  </td>
                  <td>
                    {ROLLE_LABEL[e.rolle] ?? e.rolle}
                    {e.klassenstufe ? <span className="gedaempft"> · {e.klassenstufe}. Klasse</span> : null}
                  </td>
                  <td>{GRUND_LABEL[e.status] ?? e.status}</td>
                  <td>
                    {e.geo_unbekannt
                      ? "unbekannt"
                      : e.geo_entfernung_km === null
                        ? "—"
                        : `${Number(e.geo_entfernung_km).toLocaleString("de-DE", { maximumFractionDigits: 0 })} km`}
                  </td>
                  <td>{e.hat_freitext ? "ja" : "—"}</td>
                  <td>
                    {e.gesamtscore === null
                      ? "—"
                      : Number(e.gesamtscore).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="fussnote">
        Sortiert nach Alter, älteste zuerst. Ab {ALARM_ALTER_STUNDEN} Stunden gilt ein Eintrag als
        überfällig.
      </p>
    </section>
  );
}
