/**
 * Änderung einer eigenen Bewertung (Entscheidung E2).
 *
 * Der Ablauf, wieder ohne Datenbank. Drei Dinge unterscheiden ihn von der
 * Erstabgabe, und alle drei sind leicht zu übersehen:
 *
 *  1. **Die Bewertung gehört dem Konto aus der Sitzung**, nicht dem, was im
 *     Formular steht. Sonst ließe sich mit einer fremden Kennung jede beliebige
 *     Bewertung überschreiben.
 *  2. **Die Schule ändert sich nicht.** Wer eine andere Schule bewerten will,
 *     gibt eine neue Bewertung ab; sonst wanderte eine Wertung mitsamt ihrer
 *     Geschichte von einer Schule zur nächsten.
 *  3. **Die alte Fassung bleibt.** Veröffentlicht ist die neue, nachvollziehbar
 *     bleiben beide - bei einer späteren Beschwerde ist genau das die Frage.
 */

import { pruefeAenderung, type Bewertungseingabe, type Eingabefehler } from "../domain/bewertungseingabe";
import { bewerte, type Bewertungsergebnis } from "../domain/scoring";
import { wechsle, type Zustand } from "../domain/bewertungsstatus";
import type { Antworten } from "../domain/scoring";
import { freitexteAlsObjekt } from "./bewertungAbgeben";

export interface Bestand {
  readonly id: string;
  readonly kontoId: string;
  readonly schuleId: string;
  readonly schulSlug: string;
  readonly status: Zustand;
  readonly aktuelleVersion: number;
}

export interface Aenderungsumgebung {
  /** `null`, wenn es die Bewertung nicht gibt oder sie einem anderen Konto gehört. */
  holeBewertung(bewertungId: string, kontoId: string): Promise<Bestand | null>;
  pruefeFreitext(texte: readonly string[]): Promise<boolean>;
  speichereFassung(daten: {
    readonly bewertungId: string;
    readonly schuleId: string;
    readonly version: number;
    readonly status: Zustand;
    readonly eingabe: Bewertungseingabe;
    readonly scores: Bewertungsergebnis;
  }): Promise<void>;
}

export type Aenderungsergebnis =
  | { readonly ok: true; readonly status: Zustand; readonly version: number }
  | { readonly ok: false; readonly fehler: readonly Eingabefehler[] };

export async function bewertungAendern(
  bewertungId: string,
  kontoId: string,
  eingabe: Bewertungseingabe,
  umgebung: Aenderungsumgebung,
  jetzt = new Date(),
): Promise<Aenderungsergebnis> {
  const bestand = await umgebung.holeBewertung(bewertungId, kontoId);
  if (bestand === null) {
    // Derselbe Text für „gibt es nicht“ und „gehört jemand anderem“: alles
    // andere verriete, welche Kennungen echt sind.
    return { ok: false, fehler: [{ feld: "", meldung: "Diese Bewertung gibt es nicht." }] };
  }

  const uebergang = wechsle(bestand.status, "bearbeitet");
  if (!uebergang.ok) {
    return { ok: false, fehler: [{ feld: "", meldung: uebergang.fehler.grund }] };
  }

  const fehler = pruefeAenderung(eingabe, jetzt);
  if (fehler.length > 0) return { ok: false, fehler };

  let scores: Bewertungsergebnis;
  try {
    scores = bewerte(eingabe.antworten as Antworten);
  } catch (e) {
    return {
      ok: false,
      fehler: [{ feld: "", meldung: e instanceof Error ? e.message : "Die Bewertung ließ sich nicht rechnen." }],
    };
  }

  const texte = Object.values(eingabe.freitexte).filter((t): t is string => !!t && t.trim() !== "");
  const auffaellig = texte.length > 0 && (await umgebung.pruefeFreitext(texte));

  // Ein auffälliger Freitext hält die geänderte Fassung zurück, auch wenn die
  // vorherige veröffentlicht war. Genau dafür ist die Rückkehr in die Prüfung da.
  const status: Zustand = auffaellig && uebergang.nach === "freigegeben" ? "in_pruefung_betrug" : uebergang.nach;

  const version = bestand.aktuelleVersion + 1;
  await umgebung.speichereFassung({
    bewertungId: bestand.id,
    schuleId: bestand.schuleId,
    version,
    status,
    eingabe,
    scores,
  });

  return { ok: true, status, version };
}

export { freitexteAlsObjekt };
