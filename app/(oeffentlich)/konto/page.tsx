import type { Metadata } from "next";
import { ZUSTAND_HINWEIS, ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { ROLLE_LABEL } from "@/domain/bewertungseingabe";
import { KONTO_SITZUNG_TAGE } from "@/domain/kontozugang";
import { eigeneBewertungen } from "@/db/konto";
import { abmelden, ueberallAbmelden } from "./aktionen";
import { verlangeKonto } from "./sitzung";
import Bewertungszeile from "./zeile";
import Kontoloeschung from "./loeschung";
import { empfehlungslink, teilentext } from "@/domain/empfehlung";
import { empfehlungscodeFuer, empfehlungsstand } from "@/db/empfehlungen";
import {
  GEWINNE,
  TEILNAHMEBERECHTIGT,
  VERLOSUNG_LABEL,
  monatszeitraum,
} from "@/domain/verlosung";
import { Teilen } from "../bestaetigen/teilen";

export const metadata: Metadata = {
  title: "Deine Bewertungen",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

export default async function Kontoseite() {
  const konto = await verlangeKonto();
  const jetzt = new Date();
  const zeitraum = monatszeitraum(jetzt.getUTCFullYear(), jetzt.getUTCMonth() + 1);

  const [bewertungen, code, stand] = await Promise.all([
    eigeneBewertungen(konto.id),
    empfehlungscodeFuer(konto.id),
    empfehlungsstand(konto.id, zeitraum),
  ]);

  // Nur wer selbst an der Verlosung teilnimmt, bekommt das Versprechen zu
  // sehen: Schülerrolle und angekreuzte Teilnahme sind Bedingung.
  const nimmtTeil = bewertungen.some(
    (b) => b.verlosung_teilnahme && TEILNAHMEBERECHTIGT.includes(b.rolle),
  );

  const basis = process.env["BASIS_URL"] ?? "";
  const link = code === null ? null : empfehlungslink(basis, code);

  return (
    <>
      <section className="abschnitt">
        <div className="vorgangskopf">
          <div>
            <h1>Deine Bewertungen</h1>
            <p className="gedaempft">
              Angemeldet als <code>{konto.verschleiert}</code>
            </p>
          </div>
          <form action={abmelden}>
            <button className="knopf zweitrangig klein">Abmelden</button>
          </form>
        </div>
      </section>

      {/* Der eigene Link und was er gebracht hat. Gezählt wird nur, was
          veröffentlicht ist - das ist dieselbe Zahl, die auch die Ziehung
          verwendet, und deshalb steht hier keine zweite Wahrheit. */}
      {link !== null && nimmtTeil ? (
        <section className="abschnitt">
          <div className="teilen">
            <h2>Dein Link</h2>
            <p>
              Wenn jemand darüber bewertet und die Bewertung veröffentlicht wird, bist du diesen
              Monat zusätzlich in der {VERLOSUNG_LABEL.super} - {GEWINNE.super.anzahl} Gutscheine
              über je {GEWINNE.super.wertEuro} Euro.
            </p>

            <div className="empfehlungsstand">
              <div className="kennzahl">
                <span className="zahl">{stand.zaehlend}</span>
                <span className="beschriftung">
                  {stand.zaehlend === 1 ? "Freund/in hat bewertet" : "Freunde haben bewertet"}
                </span>
              </div>
              <div className="kennzahl">
                <span className="zahl">{stand.geworben - stand.zaehlend}</span>
                <span className="beschriftung">noch in Prüfung</span>
              </div>
            </div>

            <p className="hinweis">
              {stand.zaehlend >= GEWINNE.mega.mindestEmpfehlungen
                ? `Du bist diesen Monat in allen drei Ziehungen dabei - auch in der ${VERLOSUNG_LABEL.mega}.`
                : stand.zaehlend >= GEWINNE.super.mindestEmpfehlungen
                  ? `Du bist diesen Monat in der ${VERLOSUNG_LABEL.super} dabei. Ab ${GEWINNE.mega.mindestEmpfehlungen} Freundinnen und Freunden kommt die ${VERLOSUNG_LABEL.mega} dazu.`
                  : "Sobald eine einzige Person über deinen Link bewertet, bist du dabei."}
            </p>

            <Teilen link={link} text={teilentext("meine Schule", link)} kompakt />
          </div>
        </section>
      ) : null}

      <section className="abschnitt">
        {bewertungen.length === 0 ? (
          <div className="leerzustand">
            <h2>Noch keine Bewertung</h2>
            <p>Zu diesem Konto liegt keine Bewertung vor.</p>
            <a className="knopf" href="/schulen">Schule suchen</a>
          </div>
        ) : (
          <ul className="eigene">
            {bewertungen.map((b) => {
              const status = b.status as Zustand;
              return (
                <li key={b.id} className="karte">
                  <div className="eigene-kopf">
                    <div>
                      <a href={`/schule/${b.schule_slug}`} className="titel">{b.schule_name}</a>
                      <span className="gedaempft">
                        {b.schule_ort ? ` · ${b.schule_ort}` : ""} · {ROLLE_LABEL[b.rolle as keyof typeof ROLLE_LABEL] ?? b.rolle}
                        {b.klassenstufe ? ` · ${b.klassenstufe}. Klasse` : ""}
                      </span>
                    </div>
                    <span className={`plakette ${status === "freigegeben" ? "gut" : status === "abgelehnt" ? "schlecht" : "mittel"}`}>
                      {ZUSTAND_LABEL[status]}
                    </span>
                  </div>

                  <p className="hinweis">{ZUSTAND_HINWEIS[status]}</p>

                  {/* Der Ablehnungsgrund gehört der bewertenden Person - sie
                      muss wissen, woran es lag, sonst gibt sie dieselbe
                      Bewertung morgen noch einmal ab. */}
                  {status === "abgelehnt" && b.ablehnungsgrund ? (
                    <blockquote className="freitext">
                      <p>{b.ablehnungsgrund}</p>
                    </blockquote>
                  ) : null}

                  <p className="fussnote">
                    Abgegeben am {DATUM.format(b.erstellt_am)}
                    {b.zuletzt_bearbeitet_am
                      ? ` · zuletzt geändert am ${DATUM.format(b.zuletzt_bearbeitet_am)}`
                      : ""}
                    {b.version > 1 ? ` · Fassung ${b.version}` : ""}
                    {b.gesamtscore
                      ? ` · deine Wertung: ${Number(b.gesamtscore).toLocaleString("de-DE", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })} von 10`
                      : ""}
                  </p>

                  <Bewertungszeile bewertungId={b.id} schulname={b.schule_name} status={status} slug={b.schule_slug} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="abschnitt">
        <h2>Konto</h2>
        <div className="karten zwei">
          <div className="karte">
            <span className="beschriftung">Angemeldet bleiben</span>
            <p>
              Diese Anmeldung gilt {KONTO_SITZUNG_TAGE} Tage. Hast du dein Telefon verloren oder
              den Anmeldelink weitergegeben, meld alle Geräte ab - danach kommt nur noch hinein,
              wer einen neuen Link anfordern kann.
            </p>
            <form action={ueberallAbmelden}>
              <button className="knopf zweitrangig">Überall abmelden</button>
            </form>
          </div>

          <div className="karte">
            <span className="beschriftung">Konto löschen</span>
            <p>
              Löscht deinen Kontakt und{" "}
              {bewertungen.length === 0
                ? "das Konto"
                : bewertungen.length === 1
                  ? "deine Bewertung"
                  : `alle ${bewertungen.length} Bewertungen`}{" "}
              unwiderruflich. Die Wertungen der betroffenen Schulen werden sofort neu gerechnet.
            </p>
            <Kontoloeschung anzahl={bewertungen.length} />
          </div>
        </div>
      </section>
    </>
  );
}
