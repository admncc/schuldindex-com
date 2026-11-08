import type { Metadata } from "next";
import { einbettungsverlauf, holeEinbettungen } from "@/db/einbettungen";
import { PLATZBESCHREIBUNG, pruefeSchnipsel } from "@/domain/einbettung";
import { verlangeAnmeldung } from "../sitzung";
import Einbettungsblock from "./block";

export const metadata: Metadata = { title: "Einbettungen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Fremde Skripte - Einwilligungsbanner und Reichweitenmessung.
 *
 * Diese Seite gibt es, weil das Banner von einem Anbieter kommt und nicht von
 * uns: Es wird dort zusammengeklickt und als Schnipsel ausgegeben, und es
 * ändert sich, ohne dass sich das Portal ändert. Der Schnipsel in den Code zu
 * schreiben hieße, für jede Änderung an einem Banner eine neue Fassung
 * auszuliefern.
 *
 * Die Warnung oben steht nicht aus Höflichkeit da. Ein Skript, das an jeden
 * Besucher geht, ist der weiteste Zugriff, den dieses Panel vergibt - weiter
 * als die Entschlüsselung eines Kontakts, weil er alle betrifft und nicht
 * einen. Wer ihn vergibt, soll das im selben Blick lesen, in dem er einfügt.
 */
export default async function Einbettungsseite() {
  const moderatorin = await verlangeAnmeldung();
  const [werte, verlauf] = await Promise.all([holeEinbettungen(), einbettungsverlauf()]);

  const alleHosts = [
    ...new Set(
      PLATZBESCHREIBUNG.flatMap((b) => {
        const e = werte[b.platz];
        if (e === undefined) return [];
        const p = pruefeSchnipsel(e.inhalt);
        return p.ok ? [...p.hosts] : [];
      }),
    ),
  ].sort();

  const bannerAus = werte.einwilligung?.aktiv !== true;
  const messungAn = werte.messung?.aktiv === true;

  return (
    <section className="abschnitt">
      <h1>Einbettungen</h1>
      <p className="hinweis">
        Hier kommt das Einwilligungsbanner des Anbieters hinein (InMobi CMP oder ein anderer) und
        danach die Reichweitenmessung. Beides läuft nur auf den öffentlichen Seiten und auf den
        Landeplätzen - nicht in dieser Oberfläche.
      </p>

      <div className="alarm" role="note">
        <strong>Was hier eingetragen wird, läuft im Browser jedes Besuchers.</strong> Geprüft wird
        die Form - nur <code>&lt;script&gt;</code>, nur <code>https</code>, keine
        Ereignisattribute -, nicht das, was das Skript dann tut. Ein Anbieter, dem du die Seite
        öffnest, kann alles lesen und ändern, was auf ihr steht. Trag deshalb nur Schnipsel ein,
        die du beim Anbieter selbst erzeugt hast, und sieh nach dem Speichern auf einer
        öffentlichen Seite nach, ob das Banner erscheint.
      </div>

      {messungAn && bannerAus ? (
        <p className="fehler" role="alert">
          Die Reichweitenmessung ist eingetragen, das Einwilligungsbanner aber nicht aktiv. Sie
          wird deshalb <strong>nicht</strong> ausgeliefert: Messen ohne vorherige Einwilligung
          wäre nach § 25 TDDDG rechtswidrig, und ein stiller Verstoß wäre schlimmer als ein
          abgeschaltetes Feld.
        </p>
      ) : null}

      {alleHosts.length > 0 ? (
        <p className="bestandshinweis">
          Zurzeit eingebunden: <strong>{alleHosts.join(", ")}</strong>. Diese Hosts müssen in der{" "}
          <a href="/datenschutz#einwilligung">Datenschutzerklärung</a> stehen - sie nennt sie
          automatisch, der erklärende Text daneben bleibt aber Handarbeit.
        </p>
      ) : (
        <p className="bestandshinweis">
          Nichts eingebettet. Die Seiten laden damit nichts von fremden Servern außer dem
          Zähler von Cloudflare, und die Datenschutzerklärung sagt genau das.
        </p>
      )}

      {PLATZBESCHREIBUNG.map((b) => {
        const e = werte[b.platz];
        const geprueft = e === undefined ? null : pruefeSchnipsel(e.inhalt);
        return (
          <Einbettungsblock
            key={b.platz}
            beschreibung={b}
            inhalt={e?.inhalt ?? ""}
            aktiv={e?.aktiv ?? false}
            hosts={geprueft?.ok ? geprueft.hosts : []}
            stand={
              e?.geaendertAm
                ? `${ZEIT.format(e.geaendertAm)}${e.geaendertVon ? ` von ${e.geaendertVon}` : ""}`
                : null
            }
            darfAendern={moderatorin.rolle === "leitung"}
          />
        );
      })}

      <section className="abschnitt">
        <h2>Verlauf</h2>
        <p className="hinweis">
          Im Wortlaut, ohne Verfallsdatum. Bei einem Skript, das alle Besucher erreicht, ist die
          Frage „was stand da vorher“ die erste, die man nach einem Zwischenfall stellt.
        </p>
        {verlauf.length === 0 ? (
          <p className="bestandshinweis">Noch nichts geändert.</p>
        ) : (
          <ol className="verlaufsliste">
            {verlauf.map((v) => (
              <li key={v.id}>
                <p>
                  <strong>
                    {PLATZBESCHREIBUNG.find((b) => b.platz === v.platz)?.label ?? v.platz}
                  </strong>{" "}
                  · {ZEIT.format(v.geaendert_am)}
                  {v.moderator_name ? ` · ${v.moderator_name}` : ""} ·{" "}
                  {v.neuer_inhalt.trim() === ""
                    ? "entfernt"
                    : v.neu_aktiv
                      ? "aktiv"
                      : "abgeschaltet"}
                </p>
                {v.neuer_inhalt.trim() === "" ? null : (
                  <details>
                    <summary>Wortlaut ansehen</summary>
                    <pre className="schnipsel">{v.neuer_inhalt}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
