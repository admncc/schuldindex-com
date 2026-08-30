import type { Metadata } from "next";
import { gewinner, letzteZiehungen, teilnahmen } from "@/db/verlosung";
import { empfehlungszahlen } from "@/db/empfehlungen";
import {
  GEWINNE,
  PARTNER,
  VERLOSUNGSARTEN,
  VERLOSUNG_LABEL,
  baueLose,
  letzterMonat,
  monatsname,
  monatszeitraum,
  type Verlosungsart,
} from "@/domain/verlosung";
import { verlangeAnmeldung } from "../sitzung";
import Ziehungsfeld from "./ziehung";
import Gewinnerkontakt from "./kontakt";
import { benachrichtigungVermerken } from "./aktionen";

export const metadata: Metadata = { title: "Verlosung", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
const ZAHL = new Intl.NumberFormat("de-DE");

/**
 * Der Verlosungsbereich.
 *
 * Drei Ziehungen je Monat, jede mit eigener Teilnehmerschaft:
 *
 *  - **normal** unter allen, die bewertet und teilgenommen haben; wer einmal
 *    gewonnen hat, ist hier heraus.
 *  - **super** unter denen, die im Monat mindestens eine Person geworben haben,
 *    deren Bewertung veröffentlicht wurde.
 *  - **mega** unter denen, die über hundert solcher Personen geworben haben.
 *
 * Die Zahlen der Teilnehmenden stehen **vor** dem Ziehen da: Eine Ziehung, bei
 * der man erst hinterher sieht, wie viele Lose im Topf waren, ist keine, die
 * sich erklären lässt.
 */
export default async function Verlosungsseite() {
  const moderatorin = await verlangeAnmeldung();
  const vormonat = letzterMonat();
  const zeitraum = monatszeitraum(vormonat.jahr, vormonat.monat);

  const [ziehungen, empfehlungen, ...offene] = await Promise.all([
    letzteZiehungen(30),
    empfehlungszahlen(zeitraum),
    ...VERLOSUNGSARTEN.map((art) => teilnahmen(vormonat.jahr, vormonat.monat, art)),
  ]);

  const lose = new Map<Verlosungsart, ReturnType<typeof baueLose>>(
    VERLOSUNGSARTEN.map((art, i) => [art, baueLose(offene[i] ?? [])]),
  );

  const gewinnerliste = new Map(
    await Promise.all(ziehungen.map(async (z) => [z.id, await gewinner(z.id)] as const)),
  );

  return (
    <section className="abschnitt">
      <h1>Verlosung</h1>
      <p className="hinweis">
        Ein Los je Konto und Monat - nicht je Bewertung. Gezogen wird erst nach Ablauf des Monats,
        und jede Ziehung lässt sich aus Zufallswert und Losliste nachrechnen. Ausgespielt werden
        Gutscheine von {PARTNER}.
      </p>

      <div className="kennzahlen">
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(empfehlungen.werber)}</span>
          <span className="beschriftung">Konten mit Empfehlung</span>
        </div>
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(empfehlungen.gesamt)}</span>
          <span className="beschriftung">geworbene Bewertungen</span>
        </div>
        <div className="kennzahl">
          <span className="zahl">{ZAHL.format(empfehlungen.zaehlend)}</span>
          <span className="beschriftung">davon veröffentlicht</span>
        </div>
      </div>

      <h2>Zu ziehen: {monatsname(vormonat.jahr, vormonat.monat)}</h2>
      {VERLOSUNGSARTEN.map((art) => {
        const schonGezogen = ziehungen.some(
          (z) => z.jahr === vormonat.jahr && z.monat === vormonat.monat && z.art === art,
        );
        const dieseLose = lose.get(art) ?? [];
        const gewinn = GEWINNE[art];
        const zuVergeben = Math.min(gewinn.anzahl, dieseLose.length);

        return (
          <div key={art} className="karte">
            <span className="beschriftung">
              {VERLOSUNG_LABEL[art]} · {gewinn.anzahl} × {gewinn.wertEuro} Euro
              {gewinn.mindestEmpfehlungen > 0
                ? ` · ab ${gewinn.mindestEmpfehlungen} geworbenen ${
                    gewinn.mindestEmpfehlungen === 1 ? "Person" : "Personen"
                  }`
                : ""}
            </span>
            <p>
              {dieseLose.length === 0
                ? "Für diesen Monat liegen keine Teilnahmen vor."
                : `${ZAHL.format(dieseLose.length)} ${
                    dieseLose.length === 1 ? "teilnehmendes Konto" : "teilnehmende Konten"
                  } - ${ZAHL.format(zuVergeben)} ${
                    zuVergeben === 1 ? "Gewinn" : "Gewinne"
                  } zu vergeben.`}
            </p>
            {schonGezogen ? (
              <p className="gedaempft">Für diesen Monat wurde bereits gezogen.</p>
            ) : moderatorin.rolle === "leitung" ? (
              <Ziehungsfeld
                jahr={vormonat.jahr}
                monat={vormonat.monat}
                art={art}
                anzahl={zuVergeben}
              />
            ) : (
              <p className="gedaempft">Eine Ziehung löst die Leitung aus.</p>
            )}
          </div>
        );
      })}

      <h2>Bisherige Ziehungen</h2>
      {ziehungen.length === 0 ? (
        <p className="gedaempft">Noch nichts gezogen.</p>
      ) : (
        ziehungen.map((z) => {
          const gezogene = gewinnerliste.get(z.id) ?? [];
          return (
            <div key={z.id} className="karte">
              <span className="beschriftung">
                {VERLOSUNG_LABEL[z.art]} · {monatsname(z.jahr, z.monat)} ·{" "}
                {ZAHL.format(z.lose_gesamt)} Lose · gezogen am {ZEIT.format(z.gezogen_am)}
              </span>

              {/* „Gezogen“ kommt aus den Gewinnen, nicht aus der Altspalte:
                  Die wird beim Löschen eines Kontos geleert. */}
              {/* Drei Faelle, nicht zwei. Der dritte kam erst mit dem Loeschrecht
                  dazu: gezogen wurde, aber die Gewinnzeile traegt keine Kennung
                  mehr, weil das Konto geloescht ist (`on delete set null`) -
                  oder die Ziehung stammt von vor Migration 0025 und ihr
                  Altgewinner war schon weg, als 0027 nachtrug. „0 × 50 Euro"
                  behauptete dann, es sei nichts gewonnen worden. */}
              {gezogene.length === 0 && z.lose_gesamt === 0 ? (
                <p className="gedaempft">Keine Teilnahmen - es wurde nicht gezogen.</p>
              ) : gezogene.length === 0 ? (
                <dl className="angaben">
                  <dt>Gewinne</dt>
                  <dd>
                    Gezogen aus {ZAHL.format(z.lose_gesamt)} Losen. Zu wem sie gingen, ist nicht
                    mehr hinterlegt - die Konten sind gelöscht.
                  </dd>
                  <dt>Zufallswert</dt>
                  <dd>
                    <code className="zufallswert">{z.zufallswert}</code>
                  </dd>
                </dl>
              ) : (
                <>
                  <dl className="angaben">
                    <dt>Gewinne</dt>
                    <dd>
                      {ZAHL.format(gezogene.length)} × {GEWINNE[z.art].wertEuro} Euro
                    </dd>
                    <dt>Zufallswert</dt>
                    <dd>
                      <code className="zufallswert">{z.zufallswert}</code>
                    </dd>
                  </dl>

                  {/* Die Gewinner einzeln: Bei 50 Gutscheinen ist die
                      Benachrichtigung Handarbeit, und sie muss sich Zeile für
                      Zeile abhaken lassen. */}
                  <ol className="gewinnerliste">
                    {gezogene.map((g) => (
                      <li key={g.id}>
                        <span className="platz">{g.platz}</span>
                        {moderatorin.rolle === "leitung" ? (
                          <Gewinnerkontakt gewinnId={g.id} />
                        ) : (
                          <span className="gedaempft">Kontakt sieht die Leitung.</span>
                        )}
                        {g.benachrichtigtAm ? (
                          <span className="gedaempft">
                            benachrichtigt {ZEIT.format(g.benachrichtigtAm)}
                          </span>
                        ) : (
                          <form action={benachrichtigungVermerken}>
                            <input type="hidden" name="gewinn" value={g.id} />
                            <button className="knopf zweitrangig klein">Erledigt</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          );
        })
      )}

      <p className="fussnote">
        Die Benachrichtigung geht bis auf Weiteres von Hand hinaus - der Versandweg braucht
        Zugangsdaten. Der Vermerk hier hält fest, dass sie erledigt ist.
      </p>
    </section>
  );
}
