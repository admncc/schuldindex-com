import type { Metadata } from "next";
import { alleBewertungen, bewertungszahlen } from "@/db/moderation";
import { istBundesland, BUNDESLAND_LABEL, BUNDESLAENDER } from "@/domain/bundesland";
import { ROLLE_LABEL, type Rolle } from "@/domain/bewertungseingabe";
import { ZUSTAND_LABEL, type Zustand } from "@/domain/bewertungsstatus";
import { RISIKO_LABEL, risikoklasse, risikostufe } from "@/domain/risiko";
import { holeEinstellungen } from "@/db/einstellungen";
import { zahl } from "@/domain/einstellungen";
import { verlangeAnmeldung } from "../sitzung";

export const metadata: Metadata = { title: "Bewertungen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const ZEIT_LANG = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeStyle: "medium" });
const PRO_SEITE = 100;

/**
 * Was ein Zustand bedeutet - als Erklärung beim Darüberfahren.
 *
 * **Ein Hinweis, der die Zelle wiederholt, ist Lärm.** „Veröffentlicht" sagt
 * das Wort schon; was es *nach sich zieht*, sagt es nicht. Deshalb steht hier
 * jeweils die Folge, nicht die Benennung.
 */
const ZUSTAND_ERKLAERUNG: Readonly<Record<Zustand, string>> = {
  wartet_auf_verifizierung:
    "Die Person hat den Code aus der Nachricht noch nicht eingegeben. Bis dahin ist nichts zu entscheiden - weder freigeben noch ablehnen.",
  in_pruefung_geo:
    "Angehalten wegen des Ortes: zu weit entfernt oder nicht lokalisierbar. Liegt in der Warteschlange und wartet auf eine Entscheidung.",
  in_pruefung_betrug:
    "Angehalten wegen auffälliger Signale. Liegt in der Warteschlange und wartet auf eine Entscheidung.",
  freigegeben: "Zählt in die Wertung der Schule und erscheint auf dem Schulprofil.",
  abgelehnt: "Zählt nirgends mit. Aus diesem Zustand führt kein Weg zurück - eine erneute Abgabe legt eine neue Bewertung an.",
};

/** „vor 3 Stunden" - die Zahl, die man beim Lesen eigentlich rechnet. */
function vergangen(von: Date, bis: Date): string {
  const minuten = Math.round((bis.getTime() - von.getTime()) / 60_000);
  if (minuten < 1) return "gerade eben";
  if (minuten < 60) return `vor ${minuten} Minuten`;
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return `vor ${stunden} Stunde${stunden === 1 ? "" : "n"}`;
  const tage = Math.round(stunden / 24);
  return `vor ${tage} Tag${tage === 1 ? "" : "en"}`;
}

/**
 * Was die Zahl in der Risikospalte bedeutet - samt Folge.
 *
 * Die Frage, die diese Spalte aufwirft, ist nicht „welche Zahl steht da", sondern
 * „ab wann passiert etwas". Beides steht hier, und zwar mit der *aktuell
 * eingestellten* Schwelle: eine 4 heisst bei Schwelle 3 etwas anderes als bei 6.
 */
function risikoerklaerung(punkte: number | null, schwelle: number): string {
  if (punkte === null) return "Keine Signale aufgezeichnet - diese Bewertung ist aus der Zeit vor der Messung. Das ist nicht dasselbe wie „unauffällig\u201c.";
  const stufe = risikostufe(punkte, schwelle);
  const kopf = `${punkte} Signalpunkt${punkte === 1 ? "" : "e"} · ${RISIKO_LABEL[stufe]} · Halteschwelle ${schwelle}`;
  if (stufe === "hoch") {
    return `${kopf}\nMindestens die doppelte Schwelle: mehrere schwere Signale zugleich. Angehalten - und der Fall, den man zuerst ansehen will.\nAuch das ist kein Beweis; die Begründung muss aus dem Vorgang kommen, nicht aus der Farbe.`;
  }
  if (stufe === "auffaellig") {
    return `${kopf}\nAb der Schwelle wird angehalten: die Bewertung zählt erst nach einer Entscheidung im Vorgang.\nKein Beweis - nur der Grund, hinzusehen.`;
  }
  return `${kopf}\nUnter der Schwelle: läuft durch, zählt in die Wertung der Schule. Punkte unterhalb der Schwelle sind Hinweise, keine Beanstandung.`;
}

/** Die einzelnen Signale mit Gewicht - in der Zelle steht nur, was hineinpasst. */
function befunderklaerung(signale: { art: string; gewicht?: number; erlaeuterung?: string }[] | null): string {
  if (signale === null) return "Nicht gemessen.";
  if (signale.length === 0) return "Kein Signal hat angeschlagen.";
  const zeilen = signale.map((s) => {
    const g = typeof s.gewicht === "number" ? ` (${s.gewicht} P.)` : "";
    return `· ${s.erlaeuterung ?? s.art}${g} [${s.art}]`;
  });
  return `${signale.length} Signal${signale.length === 1 ? "" : "e"}:\n${zeilen.join("\n")}`;
}

/**
 * Tempo: die gemessene Dauer, der mittlere Klickabstand und beides gegen die
 * eingestellten Grenzen. Ohne die Grenze daneben ist „906 ms" keine Information.
 */
function tempoerklaerung(
  z: { dauer_sekunden: number | null; median_ms: number | null },
  tempogrenze: number,
  klickgrenze: number,
): string {
  const teile: string[] = [];
  if (z.dauer_sekunden === null) {
    teile.push("Dauer nicht gespeichert - Abgabe aus der Zeit vor der Messung (vor dem 08.11.2026).");
  } else {
    teile.push(`Vom Öffnen bis zum Absenden: ${z.dauer_sekunden} s (serverseitig gemessen).`);
    teile.push(`Grenze: unter ${tempogrenze} s je Frage gilt als zu schnell.`);
  }
  if (z.median_ms === null) {
    teile.push("Kein Klickmuster übermittelt.");
  } else {
    const knapp = z.median_ms < klickgrenze;
    teile.push(
      `Mittlerer Abstand zwischen zwei Antworten: ${z.median_ms} ms - Grenze ${klickgrenze} ms, also ${
        knapp ? "darunter: schlägt an" : "darüber: unauffällig"
      }.`,
    );
  }
  return teile.join("\n");
}

/** Was „bestätigt" für die Verwertbarkeit heisst. */
function kontakterklaerung(art: string | null, bestaetigt: boolean): string {
  if (art === null) return "Kein Kontaktweg hinterlegt.";
  const weg =
    art === "email" ? "E-Mail-Adresse" : art === "sms" ? "Mobilnummer" : art === "whatsapp" ? "WhatsApp-Nummer" : art;
  return bestaetigt
    ? `Bestätigt über ${weg}: Der Code aus der Nachricht wurde eingegeben, der Kontaktweg existiert also wirklich. Die ${weg} selbst liegt nur verschlüsselt - einsehbar ist sie nirgends in der Moderation.`
    : `${weg} hinterlegt, aber nicht bestätigt: Der Code wurde noch nicht eingegeben. Solange zählt die Bewertung nicht, und es ist auch nichts zu entscheiden.`;
}

const ZUSTAENDE: readonly Zustand[] = [
  "wartet_auf_verifizierung",
  "in_pruefung_geo",
  "in_pruefung_betrug",
  "freigegeben",
  "abgelehnt",
];

/**
 * Alle Bewertungen, zeitlich.
 *
 * **Warum es diese Seite neben der Warteschlange gibt.** Die Warteschlange
 * beantwortet „was muss ich jetzt entscheiden" und zeigt deshalb nur, was
 * angehalten wurde - älteste zuerst. Was *sonst* passiert, sah man bisher
 * nirgends: ob überhaupt Bewertungen ankommen, wie viele an der Bestätigung
 * hängen, ob eine Welle auf eine Schule läuft. Das sind andere Fragen als
 * „welcher Fall ist dran", und sie brauchen eine andere Ansicht.
 *
 * Kurzform heisst: eine Zeile je Bewertung, alles Wichtige ohne Klick - und
 * **kein Freitext**. Wer hier mitliest, soll den Betrieb überblicken, nicht
 * nebenbei die Texte Minderjähriger durchsehen; dafür gibt es den Vorgang,
 * und der steht im Protokoll.
 */
export default async function Bewertungsseite({
  searchParams,
}: {
  searchParams: Promise<{ zustand?: string; bundesland?: string; suche?: string; seite?: string }>;
}) {
  await verlangeAnmeldung();
  const p = await searchParams;

  const zustand = ZUSTAENDE.includes(p.zustand as Zustand) ? (p.zustand as Zustand) : undefined;
  const roh = p.bundesland ?? "";
  const bundesland = istBundesland(roh) ? roh : undefined;
  const suche = (p.suche ?? "").trim() || undefined;
  const seite = Math.max(Number(p.seite ?? "1") || 1, 1);

  const filter = { zustand, bundesland, suche };
  const einstellungen = await holeEinstellungen();
  const schwelle = zahl(einstellungen, "halteschwelle");
  const klickgrenze = zahl(einstellungen, "klick_mindestabstand_ms");
  const tempogrenze = zahl(einstellungen, "tempo_sekunden_je_frage");
  const jetzt = new Date();

  const [zeilen, zahlen] = await Promise.all([
    alleBewertungen({ status: zustand, bundesland, suche, seite, proSeite: PRO_SEITE }),
    bewertungszahlen({ bundesland, suche }),
  ]);

  const getroffen = zustand === undefined ? zahlen.gesamt : (zahlen.jeZustand[zustand] ?? 0);
  const seiten = Math.max(Math.ceil(getroffen / PRO_SEITE), 1);

  function adresse(aenderung: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    const zusammen = { ...filter, seite, ...aenderung };
    for (const [k, v] of Object.entries(zusammen)) {
      if (v !== undefined && v !== "" && !(k === "seite" && v === 1)) q.set(k, String(v));
    }
    const s = q.toString();
    return s === "" ? "/moderation/bewertungen" : `/moderation/bewertungen?${s}`;
  }

  return (
    <section className="abschnitt">
      <h1>Bewertungen</h1>
      <p className="hinweis">
        Alle Bewertungen, die neueste zuerst - auch die bereits entschiedenen. Freitexte stehen
        hier nicht: Wer sie liest, tut das im Vorgang, und das steht im Protokoll.
      </p>

      <form className="suchfilter" method="get">
        <label className="feld">
          <span>Schule</span>
          <input type="search" name="suche" defaultValue={suche ?? ""} placeholder="Name oder Ort" />
        </label>
        <label className="feld">
          <span>Zustand</span>
          <select name="zustand" defaultValue={zustand ?? ""}>
            <option value="">alle ({zahlen.gesamt})</option>
            {ZUSTAENDE.map((z) => (
              <option key={z} value={z}>
                {ZUSTAND_LABEL[z]} ({zahlen.jeZustand[z] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          <span>Bundesland</span>
          <select name="bundesland" defaultValue={bundesland ?? ""}>
            <option value="">alle</option>
            {BUNDESLAENDER.map((b) => (
              <option key={b} value={b}>{BUNDESLAND_LABEL[b]}</option>
            ))}
          </select>
        </label>
        <button className="knopf zweitrangig">Filtern</button>
      </form>

      <p className="bestandshinweis">
        {getroffen === 0
          ? "Keine Bewertung passt zu diesem Filter."
          : `${getroffen} Bewertung${getroffen === 1 ? "" : "en"}${
              seiten > 1 ? ` · Seite ${seite} von ${seiten}` : ""
            }`}
      </p>

      {zeilen.length === 0 ? null : (
        <table className="tabelle bewertungsliste">
          <thead>
            <tr>
              <th scope="col">Abgegeben</th>
              <th scope="col">Schule</th>
              <th scope="col">Rolle</th>
              <th scope="col">Wertung</th>
              <th scope="col">Zustand</th>
              <th scope="col">Tempo</th>
              <th scope="col">Risiko</th>
              <th scope="col">Befund</th>
              <th scope="col">Kontakt</th>
              <th scope="col"><span className="versteckt">Vorgang</span></th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const punkte = z.signalpunkte ?? 0;
              return (
                <tr key={z.id} className={z.ist_demo ? "demozeile" : undefined}>
                  <td
                    data-spalte="Abgegeben"
                    title={`${ZEIT_LANG.format(z.erstellt_am)} · ${vergangen(z.erstellt_am, jetzt)}${
                      z.version > 1
                        ? `\nZuletzt geändert: ${ZEIT_LANG.format(z.aktualisiert_am)} (Fassung ${z.version})`
                        : ""
                    }`}
                  >
                    {ZEIT.format(z.erstellt_am)}
                    {z.version > 1 ? (
                      <span className="gedaempft"> · geändert {ZEIT.format(z.aktualisiert_am)}</span>
                    ) : null}
                  </td>
                  <td
                    data-spalte="Schule"
                    title={`${z.schule_name}\n${z.schule_ort ?? "Ort unbekannt"} · ${
                      BUNDESLAND_LABEL[z.bundesland]
                    }`}
                  >
                    <a href={`/schule/${z.schule_slug}`}>{z.schule_name}</a>
                    {z.schule_ort ? <span className="gedaempft"> · {z.schule_ort}</span> : null}
                  </td>
                  <td
                    data-spalte="Rolle"
                    title={
                      z.klassenstufe !== null
                        ? `${z.klassenstufe}. Klasse`
                        : z.abgangsjahr !== null
                          ? `Abgangsjahr ${z.abgangsjahr}`
                          : "Keine Jahrgangsangabe"
                    }
                  >
                    {ROLLE_LABEL[z.rolle as Rolle] ?? z.rolle}
                  </td>
                  <td
                    data-spalte="Wertung"
                    title={
                      (z.gesamtscore === null
                        ? "Noch keine Gesamtwertung"
                        : `Gesamtwertung ${Number(z.gesamtscore).toFixed(1)} von 10`) +
                      (z.hat_freitext
                        ? "\nEnthält Freitexte - lesbar nur im Vorgang, und das steht im Protokoll."
                        : "\nOhne Freitext")
                    }
                  >
                    {z.gesamtscore === null ? "–" : Number(z.gesamtscore).toFixed(1)}
                    {z.hat_freitext ? <span className="gedaempft"> ·&nbsp;T</span> : null}
                  </td>
                  <td data-spalte="Zustand" title={ZUSTAND_ERKLAERUNG[z.status]}>
                    {ZUSTAND_LABEL[z.status]}
                  </td>
                  {/* **Tempo gehört in die Übersicht**, weil sich an ihm die
                      Schwellen beurteilen lassen - und weil die gemessene Dauer
                      bis zum 08.11.2026 gar nicht gespeichert wurde, war die
                      Frage „hätte das Signal angeschlagen" nachträglich nicht
                      zu beantworten. */}
                  <td data-spalte="Tempo" title={tempoerklaerung(z, tempogrenze, klickgrenze)}>
                    {z.dauer_sekunden === null ? (
                      <span className="gedaempft">–</span>
                    ) : (
                      <>{z.dauer_sekunden} s</>
                    )}
                    {z.median_ms === null ? null : (
                      <span className="gedaempft"> · ⌀{z.median_ms} ms</span>
                    )}
                  </td>
                  <td data-spalte="Risiko" title={risikoerklaerung(z.signalpunkte, schwelle)}>
                    {punkte === 0 ? (
                      "–"
                    ) : (
                      <>
                        {/* Ein Punkt in Ampelfarbe: Eine 5 und eine 3 sehen als
                            blosse Ziffern gleich aus, und diese Spalte wird
                            überflogen, nicht gelesen.

                            Die Grenzen kommen aus `risikostufe` und hängen
                            damit an der eingestellten Halteschwelle. Vorher
                            standen hier feste 3 und 6; das stimmte nur so
                            lange, wie die Schwelle auf 3 stand - danach war
                            eine gelbe Zeile angehalten oder eine grüne nicht. */}
                        <span className={`punkt ${risikoklasse(risikostufe(punkte, schwelle))}`} />{" "}
                        {punkte}
                      </>
                    )}
                  </td>
                  <td
                    data-spalte="Befund"
                    className="befundspalte"
                    title={befunderklaerung(z.signale)}
                  >
                    {(z.signale ?? []).length === 0 ? (
                      <span className="gedaempft">ohne Befund</span>
                    ) : (
                      (z.signale ?? []).map((s) => s.erlaeuterung ?? s.art).join("; ")
                    )}
                  </td>
                  <td data-spalte="Kontakt" title={kontakterklaerung(z.kontaktart, z.konto_bestaetigt)}>
                    {z.kontaktart ?? "–"}
                    {z.konto_bestaetigt ? null : <span className="gedaempft"> · unbestätigt</span>}
                  </td>
                  <td>
                    <a className="knopf zweitrangig klein" href={`/moderation/${z.id}`}>Vorgang</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {seiten > 1 ? (
        <nav className="blaettern" aria-label="Seiten">
          {seite > 1 ? <a className="knopf zweitrangig" href={adresse({ seite: seite - 1 })}>Neuere</a> : null}
          <span className="gedaempft">Seite {seite} von {seiten}</span>
          {seite < seiten ? <a className="knopf zweitrangig" href={adresse({ seite: seite + 1 })}>Ältere</a> : null}
        </nav>
      ) : null}
    </section>
  );
}
