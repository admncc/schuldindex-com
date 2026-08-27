import type { Metadata } from "next";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland } from "@/domain/bundesland";
import { ALARM_ALTER_STUNDEN, ZIEL_REAKTION_STUNDEN, warteschlangenalarm } from "@/domain/moderation";
import { warteschlange, warteschlangenlage } from "@/db/moderation";
import { eskalierteZusammenfassungen } from "@/db/zusammenfassungen";
import type { Zustand } from "@/domain/bewertungsstatus";
import type { Bundesland } from "@/domain/bundesland";
import { verlangeAnmeldung } from "./sitzung";
import Warteschlange from "./warteschlange";

export const metadata: Metadata = { title: "Warteschlange", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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

  const [eintraege, lage, zusammenfassungen] = await Promise.all([
    warteschlange({ status, bundesland, suche }),
    warteschlangenlage(),
    eskalierteZusammenfassungen(),
  ]);
  const alarme = warteschlangenalarm(lage);

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
        <Warteschlange eintraege={eintraege} />
      )}

      <p className="fussnote">
        Sortiert nach Alter, älteste zuerst. Ab {ALARM_ALTER_STUNDEN} Stunden gilt ein Eintrag als
        überfällig. Mehrere auswählen geht nur zum Ablehnen — freigegeben wird einzeln.
      </p>

      {/* Zusammenfassungen, die die Nachprüfung aufgehalten hat. Sie stehen
          hier und nicht in einer eigenen Ansicht, weil sonst niemand hinsieht —
          und weil eine aufgehaltene Zusammenfassung dasselbe bedeutet wie eine
          gehaltene Bewertung: es fehlt eine Entscheidung. */}
      {zusammenfassungen.length > 0 ? (
        <section className="abschnitt">
          <h2>Aufgehaltene Zusammenfassungen</h2>
          <p className="hinweis">
            Diese Texte hat die Nachprüfung vor der Veröffentlichung gestoppt. Sie sind nirgends
            öffentlich. Der nächste Lauf erzeugt einen neuen Text; bleibt es dabei, gehört der
            Fall angesehen.
          </p>
          {zusammenfassungen.map((z) => (
            <div key={z.id} className="karte">
              <span className="beschriftung">
                <a href={`/schule/${z.schule_slug}`}>{z.schule_name}</a> · aus {z.aus_anzahl}{" "}
                Bewertungen · {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(z.erstellt_am)}
              </span>
              <blockquote className="freitext">
                <p>{z.text}</p>
              </blockquote>
              <ul className="antwortliste">
                {z.beanstandungen.map((b, i) => (
                  <li key={`${b.regel}-${i}`}>
                    <span className="frage">{b.regel}</span>
                    <span className="antwortwert">{b.fund}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}
