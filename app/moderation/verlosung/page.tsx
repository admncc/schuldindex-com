import type { Metadata } from "next";
import { letzteZiehungen, teilnahmen } from "@/db/verlosung";
import { baueLose, letzterMonat, monatsname } from "@/domain/verlosung";
import { verlangeAnmeldung } from "../sitzung";
import Ziehungsfeld from "./ziehung";
import Gewinnerkontakt from "./kontakt";
import { benachrichtigungVermerken } from "./aktionen";

export const metadata: Metadata = { title: "Verlosung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export default async function Verlosungsseite() {
  const moderatorin = await verlangeAnmeldung();
  const vormonat = letzterMonat();

  const [ziehungen, offen] = await Promise.all([
    letzteZiehungen(),
    teilnahmen(vormonat.jahr, vormonat.monat),
  ]);

  const schonGezogen = ziehungen.some((z) => z.jahr === vormonat.jahr && z.monat === vormonat.monat);
  const lose = baueLose(offen);

  return (
    <section className="abschnitt">
      <h1>Verlosung</h1>
      <p className="hinweis">
        Ein Los je Konto und Monat - nicht je Bewertung. Gezogen wird erst nach Ablauf des
        Monats, und jede Ziehung lässt sich aus Zufallswert und Losliste nachrechnen.
      </p>

      <div className="karte">
        <span className="beschriftung">Nächste Ziehung: {monatsname(vormonat.jahr, vormonat.monat)}</span>
        <p>
          {lose.length === 0
            ? "Für diesen Monat liegen keine Teilnahmen vor."
            : `${lose.length.toLocaleString("de-DE")} teilnehmende Konten aus ${offen.length.toLocaleString("de-DE")} Bewertungen.`}
        </p>
        {schonGezogen ? (
          <p className="gedaempft">Für diesen Monat wurde bereits gezogen.</p>
        ) : moderatorin.rolle === "leitung" ? (
          <Ziehungsfeld jahr={vormonat.jahr} monat={vormonat.monat} />
        ) : (
          <p className="gedaempft">Eine Ziehung löst die Leitung aus.</p>
        )}
      </div>

      <h2>Bisherige Ziehungen</h2>
      {ziehungen.length === 0 ? (
        <p className="gedaempft">Noch nichts gezogen.</p>
      ) : (
        ziehungen.map((z) => (
          <div key={z.id} className="karte">
            <span className="beschriftung">
              {monatsname(z.jahr, z.monat)} · {z.lose_gesamt.toLocaleString("de-DE")} Lose ·
              gezogen am {ZEIT.format(z.gezogen_am)}
            </span>

            {z.gewinner_konto_id === null ? (
              <p className="gedaempft">Keine Teilnahmen - es wurde nicht gezogen.</p>
            ) : (
              <>
                <dl className="angaben">
                  <dt>Gezogenes Los</dt>
                  <dd>
                    {z.gewinner_index! + 1} von {z.lose_gesamt}
                  </dd>
                  <dt>Zufallswert</dt>
                  <dd>
                    <code className="zufallswert">{z.zufallswert}</code>
                  </dd>
                  <dt>Benachrichtigt</dt>
                  <dd>
                    {z.benachrichtigt_am ? (
                      ZEIT.format(z.benachrichtigt_am)
                    ) : (
                      <form action={benachrichtigungVermerken} className="loeschfrage">
                        <input type="hidden" name="ziehung" value={z.id} />
                        <span className="gedaempft">noch nicht</span>
                        <button className="knopf zweitrangig klein">Als benachrichtigt vermerken</button>
                      </form>
                    )}
                  </dd>
                </dl>

                {moderatorin.rolle === "leitung" ? <Gewinnerkontakt ziehungId={z.id} /> : null}
              </>
            )}
          </div>
        ))
      )}

      <p className="fussnote">
        Die Benachrichtigung geht bis auf Weiteres von Hand hinaus - der Versandweg braucht
        Zugangsdaten. Der Vermerk hier hält fest, dass sie erledigt ist.
      </p>
    </section>
  );
}
