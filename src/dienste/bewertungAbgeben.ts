/**
 * Nimmt eine Bewertung entgegen.
 *
 * Führt zusammen, was einzeln schon steht: Eingabeprüfung, Konto, Geo-Prüfung,
 * Betrugssignale, Bewertung samt Version, Bestätigungsnachricht.
 *
 * Die Abhängigkeiten werden hereingereicht statt importiert. Das ist hier kein
 * Selbstzweck: der Ablauf lässt sich damit vollständig prüfen, ohne eine
 * Datenbank, einen Geocoder oder einen Nachrichtendienst zu betreiben - und
 * genau dieser Ablauf entscheidet, ob eine Bewertung veröffentlicht wird.
 */

import { bewerte } from "../domain/scoring";
import { pruefeEingabe, type Bewertungseingabe } from "../domain/bewertungseingabe";
import { pruefeEinreichung, type Punkt } from "../domain/geopruefung";
import { pruefe as pruefeBetrug, type Pruefergebnis, type Pruefkontext } from "../domain/betrugspruefung";
import { erzeugeToken, type Token } from "../domain/verifizierung";
import { kontaktHash, normalisiereKontakt, verschleiere, verschluessele } from "../domain/kontakt";
import type { KategorieId } from "../domain/fragebogen";
import { erlaubteKontaktarten, zahl, type Einstellungen } from "../domain/einstellungen";
import { bereinige, type Klickauswertung } from "../domain/klickmuster";
import { geraetehash } from "../domain/geraetehash";

export interface Schulbezug {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly punkt: Punkt | null;
}

export interface Konto {
  readonly id: string;
  readonly verifiziertAm: Date | null;
}

/** Alles, was der Dienst von außen braucht. */
export interface Umgebung {
  holeSchule(slug: string): Promise<Schulbezug | null>;
  findeKonto(kontaktHash: string): Promise<Konto | null>;
  legeKontoAn(daten: { kontaktHash: string; chiffre: Buffer; art: string }): Promise<Konto>;
  hatBereitsBewertet(schuleId: string, kontoId: string): Promise<boolean>;
  /** Zählwerte für die Betrugsprüfung. */
  holeZaehler(kontoId: string, schuleId: string, geraetHash: string | null): Promise<
    Pick<
      Pruefkontext,
      | "abgabenLetzteZehnMinuten"
      | "schulenLetzte24Stunden"
      | "bewertungenDieserSchuleLetzteStunde"
      | "abgabenVonDiesemGeraet"
    >
  >;
  ortungDesAbsenders(): Promise<Punkt | null>;
  pruefeFreitext(texte: readonly string[]): Promise<boolean>;
  /**
   * Die geltenden Grenzwerte. Kommen aus der Datenbank, damit eine Änderung im
   * Panel sofort wirkt und nicht erst nach dem nächsten Neustart.
   */
  holeEinstellungen(): Promise<Einstellungen>;
  /** Bisheriger Stand der Schule - Grundlage des Abweichungssignals. */
  holeSchulmittel(schuleId: string): Promise<{ mittel: number | null; anzahl: number }>;
  speichere(daten: Gespeicherte): Promise<{ bewertungId: string }>;
  /**
   * Hält fest, dass dieses Konto über einen Empfehlungslink entstanden ist.
   *
   * Läuft still ins Leere, wenn der Code zu nichts gehört: Die Bewertung ist
   * abgegeben, und daran soll eine unbekannte Empfehlung nichts ändern.
   */
  merkeEmpfehlung(code: string, kontoId: string, bewertungId: string): Promise<void>;
  sendeBestaetigung(empfaenger: string, art: string, token: Token): Promise<boolean>;
}

export interface Gespeicherte {
  readonly schuleId: string;
  readonly kontoId: string;
  readonly eingabe: Bewertungseingabe;
  readonly status: "wartet_auf_verifizierung" | "in_pruefung_geo" | "in_pruefung_betrug";
  readonly geoEntfernungKm: number | null;
  readonly geoUnbekannt: boolean;
  readonly scores: ReturnType<typeof bewerte>;
  /** Befund der Betrugsprüfung, wie er zum Zeitpunkt der Abgabe ausfiel. */
  readonly signale: Pruefergebnis["signale"];
  readonly signalpunkte: number;
  /** Kennzahlen des Klickverhaltens; `null`, wenn nichts Auswertbares vorlag. */
  readonly klick: Klickauswertung | null;
  /**
   * Die vollständige Klickfolge in Millisekunden, in Klickreihenfolge.
   *
   * Aufbewahrt für die Kalibrierung der Schwellen und den Vergleich ganzer
   * Verläufe untereinander (Entscheidung vom 27.08.2026). Auch dann gespeichert,
   * wenn die Folge nicht zur vom Server gemessenen Zeit passt - eine erfundene
   * Reihe ist selbst ein Befund. Personenbezogene Verhaltensspur; was daraus
   * folgt, steht in `domain/klickmuster.ts`.
   */
  readonly klickfolge: readonly number[] | null;
  /** Abdruck der Browserkennung, nicht die Kennung selbst. */
  readonly geraetHash: string | null;
  readonly token: Token;
}

export type Abgabeergebnis =
  | {
      readonly ok: true;
      readonly bewertungId: string;
      /** Verschleierter Kontakt für die Bestätigungsseite. */
      readonly kontaktAnzeige: string;
      readonly nachrichtVersandt: boolean;
    }
  | { readonly ok: false; readonly fehler: readonly { feld: string; meldung: string }[] };

export async function bewertungAbgeben(
  eingabe: Bewertungseingabe,
  umgebung: Umgebung,
  jetzt = new Date(),
): Promise<Abgabeergebnis> {
  const fehler = pruefeEingabe(eingabe, jetzt);
  if (fehler.length > 0) return { ok: false, fehler };

  const schule = await umgebung.holeSchule(eingabe.schulSlug);
  if (schule === null) {
    return { ok: false, fehler: [{ feld: "schule", meldung: "Diese Schule kennen wir nicht." }] };
  }

  const art = eingabe.kontaktart!;
  // Ein im Panel abgeschalteter Weg wird auch dann nicht angenommen, wenn ihn
  // jemand von Hand mitschickt - das Formular bietet ihn gar nicht erst an.
  if (!erlaubteKontaktarten(await umgebung.holeEinstellungen()).includes(art)) {
    return {
      ok: false,
      fehler: [{ feld: "kontaktart", meldung: "Dieser Weg der Bestätigung steht zurzeit nicht zur Verfügung." }],
    };
  }

  const normal = normalisiereKontakt(eingabe.kontakt, art);
  const hash = kontaktHash(eingabe.kontakt, art);

  const bestehendes = await umgebung.findeKonto(hash);
  const konto =
    bestehendes ?? (await umgebung.legeKontoAn({ kontaktHash: hash, chiffre: verschluessele(normal), art }));

  // Entscheidung E13: eine Bewertung je Schule und Konto. Das ist die
  // Gegenleistung dafür, dass nur einmal je Konto verifiziert wird.
  if (await umgebung.hatBereitsBewertet(schule.id, konto.id)) {
    return {
      ok: false,
      fehler: [
        {
          feld: "schule",
          meldung: `Du hast ${schule.name} bereits bewertet. Du kannst deine Bewertung stattdessen aktualisieren.`,
        },
      ],
    };
  }

  // Die Einstellungen stehen vor der Geoprüfung, weil sie deren Grenzwert
  // liefern. Vorher lief die Prüfung immer gegen die Konstante: Die Leitung
  // konnte im Panel 60 km einstellen, bekam „Gespeichert“ zu sehen, und geprüft
  // wurden weiter 150.
  const einstellungen = await umgebung.holeEinstellungen();

  const geo = pruefeEinreichung(
    {
      absender: await umgebung.ortungDesAbsenders(),
      schule: schule.punkt,
    },
    zahl(einstellungen, "entfernung_km"),
  );

  const freitexte = Object.values(eingabe.freitexte).filter((t): t is string => !!t && t.trim() !== "");
  // Einmal gerechnet statt zweimal: die Abweichungsprüfung braucht den Score
  // schon vor dem Speichern.
  const scores = bewerte(eingabe.antworten);

  // Der Abdruck der Browserkennung - nicht die Kennung selbst
  // (`domain/geraetekennung.ts`).
  const geraetHash = eingabe.geraetekennung ? geraetehash(eingabe.geraetekennung) : null;
  const zaehler = await umgebung.holeZaehler(konto.id, schule.id, geraetHash);
  const schulstand = await umgebung.holeSchulmittel(schule.id);

  const betrug = pruefeBetrug(
    {
      geo,
      antworten: eingabe.antworten,
      freitextAuffaellig: freitexte.length > 0 && (await umgebung.pruefeFreitext(freitexte)),
      kontoPerEmail: art === "email",
      // Vom Server gemessen, nicht vom Browser gemeldet - siehe
      // `domain/formularstempel.ts`. Ohne gültigen Stempel bleibt es leer,
      // und das Tempo-Signal entfällt, statt zu raten.
      dauerSekunden: eingabe.dauerSekunden ?? null,
      stempelFehlt: eingabe.stempelFehlt ?? false,
      // Für die Prüfung zählen nur die Kennzahlen aus `betrug.klick`. Die Folge
      // selbst wird weiter unten eigens gespeichert.
      klickabstaende: eingabe.klickabstaende ?? null,
      eigenerScore: scores.gesamtscore,
      schulmittel: schulstand.mittel,
      schulAnzahl: schulstand.anzahl,
      ...zaehler,
    },
    einstellungen,
  );

  // Reihenfolge: Wer noch nicht verifiziert ist, wartet zuerst darauf. Die
  // Betrugssignale bleiben gespeichert und greifen, sobald bestätigt wurde.
  const status = konto.verifiziertAm === null
    ? "wartet_auf_verifizierung"
    : betrug.halten
      ? betrug.grund === "geo"
        ? "in_pruefung_geo"
        : "in_pruefung_betrug"
      : "wartet_auf_verifizierung";

  const token = erzeugeToken(jetzt);

  // Die Folge geht als eigenes Feld in die Speicherung, nicht im Huckepack der
  // Eingabe: So steht an der Einfügestelle ausdrücklich, was aufbewahrt wird,
  // statt dass es als Nebeneffekt mitläuft.
  const { klickabstaende, ...ohneKlickfolge } = eingabe;
  const folge = klickabstaende ? bereinige(klickabstaende) : [];

  const { bewertungId } = await umgebung.speichere({
    schuleId: schule.id,
    kontoId: konto.id,
    eingabe: ohneKlickfolge,
    status,
    geoEntfernungKm: geo.entfernungKm,
    geoUnbekannt: geo.unbekannt,
    scores,
    signale: betrug.signale,
    signalpunkte: betrug.punkte,
    klick: betrug.klick,
    klickfolge: folge.length > 0 ? folge : null,
    geraetHash,
    token,
  });

  // Die Empfehlung wird erst hier festgehalten, nach der Bewertung: Der Code
  // im Cookie sagt nur, worüber jemand gekommen ist. Ohne abgegebene Bewertung
  // ist das kein Werbeerfolg, sondern ein Klick.
  //
  // Nur beim **ersten** Mal: Ein Konto kann nur einmal geworben worden sein
  // (die Datenbank hält das ebenfalls fest), sonst zählte dieselbe Person mit
  // jeder weiteren Schule erneut.
  if (eingabe.empfehlungscode && bestehendes === null) {
    await umgebung.merkeEmpfehlung(eingabe.empfehlungscode, konto.id, bewertungId);
  }

  const versandt = await umgebung.sendeBestaetigung(normal, art, token);

  return {
    ok: true,
    bewertungId,
    kontaktAnzeige: verschleiere(eingabe.kontakt, art),
    nachrichtVersandt: versandt,
  };
}

/** Freitexte je Kategorie, wie sie gespeichert werden. */
export function freitexteAlsObjekt(
  freitexte: Bewertungseingabe["freitexte"],
): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  for (const [kategorie, text] of Object.entries(freitexte) as [KategorieId, string | undefined][]) {
    if (text && text.trim() !== "") ergebnis[kategorie] = text.trim();
  }
  return ergebnis;
}
