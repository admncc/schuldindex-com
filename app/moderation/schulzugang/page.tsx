import type { Metadata } from "next";
import { offeneAnfragen } from "@/db/schulzugang";
import { alterInStunden, dringlichkeit, DRINGLICHKEIT_LABEL } from "@/domain/moderation";
import { verlangeAnmeldung } from "../sitzung";
import Pruefung from "./pruefung";

export const metadata: Metadata = { title: "Schulzugänge", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function Schulzugangsseite() {
  await verlangeAnmeldung();
  const anfragen = await offeneAnfragen();
  const jetzt = new Date();

  return (
    <section className="abschnitt">
      <h1>Schulzugänge</h1>
      <p className="hinweis">
        Anfragen, bei denen sich der Zugang nicht automatisch belegen ließ. Das betrifft vor allem
        Schulen ohne hinterlegte Adresse und solche an gemeinsamen Landesdomänen - unter{" "}
        <code>schule.nrw.de</code> liegen über fünftausend Schulen, eine Adresse dort sagt nichts
        darüber aus, für welche davon jemand spricht.
      </p>
      <p className="hinweis">
        <strong>Vor der Freigabe prüfen:</strong> Ruf die Schule unter der Nummer aus dem
        Schulverzeichnis an - nicht unter einer, die in der Anfrage steht.
      </p>

      {anfragen.length === 0 ? (
        <div className="leerzustand">
          <h2>Keine offenen Anfragen</h2>
          <p>Es liegt nichts zur Prüfung vor.</p>
        </div>
      ) : (
        anfragen.map((a) => {
          const stufe = dringlichkeit(a.erstellt_am, jetzt);
          return (
            <div key={a.id} className="karte">
              <span className="beschriftung">
                <span className={`plakette ${stufe}`}>{DRINGLICHKEIT_LABEL[stufe]}</span>{" "}
                {ZEIT.format(a.erstellt_am)} ({Math.floor(alterInStunden(a.erstellt_am, jetzt))} h)
              </span>

              <dl className="angaben">
                <dt>Schule</dt>
                <dd>
                  <a href={`/schule/${a.schule_slug}`}>{a.schule_name}</a>
                  {a.schule_ort ? <span className="gedaempft"> · {a.schule_ort}</span> : null}
                </dd>
                <dt>Angegebene Adresse</dt>
                <dd>{a.kontakt_verkuerzt ?? <span className="gedaempft">keine</span>}</dd>
              </dl>

              {a.anfrage_notiz ? (
                <blockquote className="freitext">
                  <p>{a.anfrage_notiz}</p>
                </blockquote>
              ) : null}

              <Pruefung anfrageId={a.id} />
            </div>
          );
        })
      )}
    </section>
  );
}
