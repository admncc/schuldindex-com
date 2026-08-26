/**
 * Nimmt eine Bewertung entgegen.
 *
 * Führt zusammen, was einzeln schon steht: Eingabeprüfung, Konto, Geo-Prüfung,
 * Betrugssignale, Bewertung samt Version, Bestätigungsnachricht.
 *
 * Die Abhängigkeiten werden hereingereicht statt importiert. Das ist hier kein
 * Selbstzweck: der Ablauf lässt sich damit vollständig prüfen, ohne eine
 * Datenbank, einen Geocoder oder einen Nachrichtendienst zu betreiben — und
 * genau dieser Ablauf entscheidet, ob eine Bewertung veröffentlicht wird.
 */

import { bewerte } from "../domain/scoring";
import { pruefeEingabe, type Bewertungseingabe } from "../domain/bewertungseingabe";
import { pruefeEinreichung, type Punkt } from "../domain/geopruefung";
import { pruefe as pruefeBetrug, type Pruefkontext } from "../domain/betrugspruefung";
import { erzeugeToken, type Token } from "../domain/verifizierung";
import { kontaktHash, normalisiereKontakt, verschleiere, verschluessele } from "../domain/kontakt";
import type { KategorieId } from "../domain/fragebogen";

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
  holeZaehler(kontoId: string, schuleId: string): Promise<
    Pick<Pruefkontext, "abgabenLetzteZehnMinuten" | "schulenLetzte24Stunden" | "bewertungenDieserSchuleLetzteStunde">
  >;
  ortungDesAbsenders(): Promise<Punkt | null>;
  pruefeFreitext(texte: readonly string[]): Promise<boolean>;
  speichere(daten: Gespeicherte): Promise<{ bewertungId: string }>;
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

  const geo = pruefeEinreichung({
    absender: await umgebung.ortungDesAbsenders(),
    schule: schule.punkt,
  });

  const freitexte = Object.values(eingabe.freitexte).filter((t): t is string => !!t && t.trim() !== "");
  const zaehler = await umgebung.holeZaehler(konto.id, schule.id);

  const betrug = pruefeBetrug({
    geo,
    antworten: eingabe.antworten,
    freitextAuffaellig: freitexte.length > 0 && (await umgebung.pruefeFreitext(freitexte)),
    kontoPerEmail: art === "email",
    ...zaehler,
  });

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
  const { bewertungId } = await umgebung.speichere({
    schuleId: schule.id,
    kontoId: konto.id,
    eingabe,
    status,
    geoEntfernungKm: geo.entfernungKm,
    geoUnbekannt: geo.unbekannt,
    scores: bewerte(eingabe.antworten),
    token,
  });

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
