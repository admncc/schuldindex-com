import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  bundeslandFacetten,
  istEingegrenzt,
  ortFacetten,
  schulzahlJeBundesland,
  sucheSchulen,
  type Trefferfilter,
} from "@/db/schulen";
import { BUNDESLAENDER, BUNDESLAND_LABEL, istBundesland, type Bundesland } from "@/domain/bundesland";
import { SCHULART_LABEL, schulartAnzeige, type Schulart } from "@/import/schulart";
import { scorestufe } from "@/domain/scoring";
import { Suchfeld } from "../suchfeld";

export const metadata: Metadata = {
  title: "Schulen finden",
  description:
    "Schulen in Deutschland suchen - nach Namen, Ort, Postleitzahl, Bundesland und Schulart.",
};

const ZAHL = new Intl.NumberFormat("de-DE");
const WERT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** So viele Treffer liefert eine Seite. Alles Weitere gehört eingegrenzt. */
const GRENZE = 40;

interface Suchparameter {
  q?: string;
  bundesland?: string;
  schulart?: string;
  ort?: string;
  bewertet?: string;
}

function istSchulart(wert: string): wert is Schulart {
  return wert in SCHULART_LABEL;
}

/**
 * Baut eine Adresse mit geänderten Parametern.
 *
 * Jeder Filter ist ein Link, kein Formularfeld - deshalb muss jeder Link alle
 * anderen Filter unverändert weitertragen. Leere Werte fallen heraus, damit
 * `/schulen` sauber bleibt und nicht `?q=&ort=` heißt.
 */
function mitParametern(aktuell: Suchparameter, aenderung: Partial<Suchparameter>): string {
  const zusammen = { ...aktuell, ...aenderung };
  const suche = new URLSearchParams();
  for (const [name, wert] of Object.entries(zusammen)) {
    if (typeof wert === "string" && wert.trim() !== "") suche.set(name, wert.trim());
  }
  const text = suche.toString();
  return text === "" ? "/schulen" : `/schulen?${text}`;
}

export default async function Suchseite({
  searchParams,
}: {
  searchParams: Promise<Suchparameter>;
}) {
  const t = await getTranslations();
  const p = await searchParams;

  const eingabe = (p.q ?? "").trim();
  const bundesland: Bundesland | undefined =
    p.bundesland !== undefined && istBundesland(p.bundesland) ? p.bundesland : undefined;
  const schulart: Schulart | undefined =
    p.schulart !== undefined && istSchulart(p.schulart) ? p.schulart : undefined;
  const ort = (p.ort ?? "").trim();
  const nurBewertet = p.bewertet === "1";

  const filter: Trefferfilter = {
    ...(bundesland ? { bundesland } : {}),
    ...(schulart ? { schulart } : {}),
    ...(ort !== "" ? { ort } : {}),
    ...(nurBewertet ? { nurBewertet: true } : {}),
  };

  // Die bereinigten Werte, nicht die rohen: Ein erfundenes Bundesland im Link
  // darf nicht in den nächsten Link weiterwandern.
  const stand: Suchparameter = {
    ...(eingabe !== "" ? { q: eingabe } : {}),
    ...(bundesland ? { bundesland } : {}),
    ...(schulart ? { schulart } : {}),
    ...(ort !== "" ? { ort } : {}),
    ...(nurBewertet ? { bewertet: "1" } : {}),
  };

  const gesucht = eingabe.length >= 2 || istEingegrenzt(filter);
  const [treffer, laender, orte] = gesucht
    ? await Promise.all([
        sucheSchulen(eingabe, filter, GRENZE),
        bundeslandFacetten(eingabe, filter),
        ortFacetten(eingabe, filter, 8),
      ])
    : [[], [], []];
  // Ohne Suche stehen die Bundesländer als Einstieg da - mit ihrer Größe, damit
  // die Kacheln nicht nur Namen sind.
  const bestand = gesucht ? [] : await schulzahlJeBundesland();

  const gesamt = treffer[0]?.gesamt ?? 0;
  // Das gewählte Bundesland steht schon als Marke oben - in der Leiste zum
  // Wechseln hat es nichts verloren.
  const andereLaender = laender.filter((f) => f.wert !== bundesland);
  const aktiveFilter = [
    bundesland ? { text: BUNDESLAND_LABEL[bundesland], weg: { bundesland: "" } } : null,
    schulart ? { text: SCHULART_LABEL[schulart], weg: { schulart: "" } } : null,
    ort !== "" ? { text: ort, weg: { ort: "" } } : null,
    nurBewertet ? { text: t("suche.nurBewertet"), weg: { bewertet: "" } } : null,
  ].filter((f) => f !== null);

  return (
    <>
      <section className="suchbuehne">
        <h1>{t("suche.titel")}</h1>
        <p className="einleitung">{t("suche.untertitel")}</p>

        <Suchfeld
          vorbelegt={eingabe}
          platzhalter={t("startseite.suchfeld")}
          beschriftung={t("startseite.suchfeld")}
          knopftext={t("startseite.suchknopf")}
          mitfuehren={{
            ...(bundesland ? { bundesland } : {}),
            ...(schulart ? { schulart } : {}),
            ...(ort !== "" ? { ort } : {}),
            ...(nurBewertet ? { bewertet: "1" } : {}),
          }}
        />

        {/* Ein gewöhnliches GET-Formular: Die Filter stehen danach in der
            Adresse und lassen sich verschicken und wiederfinden. */}
        <form className="suchfilter" method="get" action="/schulen">
          <input type="hidden" name="q" value={eingabe} />

          <label className="feld klein">
            <span>{t("suche.filterBundesland")}</span>
            <select name="bundesland" defaultValue={bundesland ?? ""}>
              <option value="">{t("suche.alleBundeslaender")}</option>
              {BUNDESLAENDER.map((b) => (
                <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
              ))}
            </select>
          </label>

          <label className="feld klein">
            <span>{t("suche.filterSchulart")}</span>
            <select name="schulart" defaultValue={schulart ?? ""}>
              <option value="">{t("suche.alleSchularten")}</option>
              {Object.entries(SCHULART_LABEL).map(([wert, text]) => (
                <option key={wert} value={wert}>{text}</option>
              ))}
            </select>
          </label>

          <label className="feld klein">
            <span>{t("suche.filterOrt")}</span>
            <input type="text" name="ort" defaultValue={ort} placeholder="z. B. Öhringen" />
          </label>

          <label className="feld klein schalterfeld">
            <input type="checkbox" name="bewertet" value="1" defaultChecked={nurBewertet} />
            <span>{t("suche.nurBewertet")}</span>
          </label>

          <button className="knopf zweitrangig klein">{t("suche.filtern")}</button>
          {aktiveFilter.length > 0 ? (
            <a className="zuruecksetzen" href={mitParametern({}, { q: eingabe })}>
              {t("suche.zuruecksetzen")}
            </a>
          ) : null}
        </form>

        {aktiveFilter.length > 0 ? (
          <ul className="filtermarken">
            {aktiveFilter.map((f) => (
              <li key={f.text}>
                <a href={mitParametern(stand, f.weg)}>
                  {f.text}
                  <span aria-hidden="true">×</span>
                  <span className="versteckt">entfernen</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="abschnitt">
        {!gesucht ? (
          // Ohne Eingabe keine leere Seite: Die sechzehn Bundesländer sind der
          // Einstieg für alle, die noch nicht wissen, wonach sie suchen.
          <>
            <p className="hinweis">{t("suche.starthinweis")}</p>
            <ul className="landkacheln">
              {BUNDESLAENDER.map((b) => {
                const zahl = bestand.find((f) => f.wert === b)?.anzahl ?? 0;
                return (
                  <li key={b}>
                    <a href={mitParametern({}, { bundesland: b })}>
                      <strong>{BUNDESLAND_LABEL[b]}</strong>
                      <span>{ZAHL.format(zahl)} Schulen</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        ) : treffer.length === 0 ? (
          <div className="leerzustand">
            <h3>{t("suche.keineTreffer")}</h3>
            <p>{t("suche.keineTrefferHinweis")}</p>
          </div>
        ) : (
          <>
            <p className="trefferzahl">
              <strong>{t("suche.treffer", { anzahl: gesamt })}</strong>
              {gesamt > treffer.length ? ` · ${t("suche.angezeigt", { anzahl: treffer.length })}` : ""}
            </p>

            {/* Zwei Vorschlagsleisten zum Weiterklicken: Wer 900 Treffer hat,
                will nicht scrollen, sondern eingrenzen. */}
            {andereLaender.length > 0 ? (
              <div className="facette">
                <span className="beschriftung">{t("suche.bundeslaender")}</span>
                <ul>
                  {andereLaender.slice(0, 8).map((f) => (
                    <li key={f.wert}>
                      <a href={mitParametern(stand, { bundesland: f.wert })}>
                        {BUNDESLAND_LABEL[f.wert]} <span>{ZAHL.format(f.anzahl)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {orte.length > 1 && ort === "" ? (
              <div className="facette">
                <span className="beschriftung">{t("suche.orte")}</span>
                <ul>
                  {orte.map((f) => (
                    <li key={f.wert}>
                      <a href={mitParametern(stand, { ort: f.wert })}>
                        {f.wert} <span>{ZAHL.format(f.anzahl)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ul className="trefferkarten">
              {treffer.map((s) => {
                const art = schulartAnzeige(s.schulart_original, s.schularten);
                const wert = s.gesamtscore === null ? null : Number(s.gesamtscore);
                return (
                  <li key={s.slug}>
                    <a href={`/schule/${s.slug}`}>
                      <span className="kopfzeile">
                        <span className="titel">{s.name}</span>
                        {wert !== null ? (
                          <span className={`punktzahl ${scorestufe(wert)}`}>{WERT.format(wert)}</span>
                        ) : (
                          <span className="ohnewertung">{t("suche.ohneWertung")}</span>
                        )}
                      </span>
                      <span className="anschrift">
                        {[s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                      <span className="marken">
                        <span className="marke-flach">{BUNDESLAND_LABEL[s.bundesland]}</span>
                        {art ? <span className="marke-flach">{art}</span> : null}
                        {s.anzahl > 0 ? (
                          <span className="marke-flach">
                            {t("suche.bewertungen", { anzahl: s.anzahl })}
                          </span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
