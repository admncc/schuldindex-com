import type { Metadata } from "next";
import { offeneMeldungen } from "@/db/meldungen";
import { MELDEGRUND_TEXT } from "@/domain/meldung";
import { MELDESTATUS_LABEL } from "@/domain/meldungsstatus";
import { alterInStunden, dringlichkeit, DRINGLICHKEIT_LABEL } from "@/domain/moderation";
import { verlangeAnmeldung } from "../sitzung";
import Meldungsentscheidung from "./entscheidung";

export const metadata: Metadata = { title: "Meldungen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function Meldungsseite() {
  await verlangeAnmeldung();
  const meldungen = await offeneMeldungen();
  const jetzt = new Date();

  return (
    <section className="abschnitt">
      <h1>Meldungen</h1>
      <p className="hinweis">
        Meldungen nach Art. 16 DSA. Jede Entscheidung geht mit Begründung und Rechtsbehelfshinweis
        an die meldende Person - auch die ablehnende.
      </p>

      {meldungen.length === 0 ? (
        <div className="leerzustand">
          <h2>Keine offenen Meldungen</h2>
          <p>Es liegt nichts zur Entscheidung vor.</p>
        </div>
      ) : (
        meldungen.map((m) => {
          const stufe = dringlichkeit(m.eingegangen_am, jetzt);
          const grund = MELDEGRUND_TEXT.find((g) => g.id === m.grund);
          return (
            <div key={m.id} className="karte">
              <span className="beschriftung">
                <span className={`plakette ${stufe}`}>{DRINGLICHKEIT_LABEL[stufe]}</span>{" "}
                {grund?.kurz ?? m.grund} · {MELDESTATUS_LABEL[m.status]} ·{" "}
                {ZEIT.format(m.eingegangen_am)} ({Math.floor(alterInStunden(m.eingegangen_am, jetzt))} h)
              </span>

              <dl className="angaben">
                <dt>Gemeldet</dt>
                <dd>
                  {m.schule_slug ? (
                    <a href={`/schule/${m.schule_slug}`}>{m.schule_name}</a>
                  ) : (
                    <span className="gedaempft">nicht zugeordnet</span>
                  )}
                  <br />
                  <code>{m.url}</code>
                </dd>
                {m.bewertung_id ? (
                  <>
                    <dt>Bewertung</dt>
                    <dd>
                      <a href={`/moderation/${m.bewertung_id}`}>Vorgang öffnen</a>
                    </dd>
                  </>
                ) : null}
                <dt>Meldende Person</dt>
                <dd>
                  {m.melder_name ?? <span className="gedaempft">ohne Namen</span>}
                  {m.vom_selben_melder > 1 ? (
                    // Art. 23 DSA: wiederholte unbegründete Meldungen sind ein
                    // eigener Missbrauchstatbestand. Ohne diese Zahl fiele es
                    // niemandem auf.
                    <span className="gedaempft"> · {m.vom_selben_melder} Meldungen von dieser Adresse</span>
                  ) : null}
                </dd>
              </dl>

              <blockquote className="freitext">
                <p>{m.erlaeuterung}</p>
              </blockquote>

              <Meldungsentscheidung meldungId={m.id} />
            </div>
          );
        })
      )}
    </section>
  );
}
