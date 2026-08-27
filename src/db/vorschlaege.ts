/**
 * Vorschläge für die Autovervollständigung.
 *
 * Die Abfrage selbst steht in `schulsuche.ts` und ist dort gegen die echten
 * Daten geprüft; hier wird sie nur an die Verbindung gehängt und auf das
 * eingedampft, was über die Leitung gehen soll.
 *
 * Bewusst wenige Felder: Die Antwort geht bei jedem Tastendruck raus. Alles,
 * was nicht in der Liste erscheint, hat darin nichts zu suchen — Koordinaten
 * etwa gehören zur Umkreissuche, nicht in ein Vorschlagsfeld.
 */

import { sql } from "./verbindung";
import { autovervollstaendige, type SqlAusfuehrer } from "./schulsuche";
import type { Bundesland } from "../domain/bundesland";

const ausfuehrer = (<T>(text: string, werte: readonly unknown[]) =>
  sql.unsafe(text, werte as never[]) as unknown as Promise<T[]>) as SqlAusfuehrer;

export interface Vorschlag {
  readonly slug: string;
  readonly name: string;
  readonly ort: string | null;
  readonly plz: string | null;
  readonly bundesland: Bundesland;
  readonly schulart: string | null;
}

/**
 * Höchstens acht Vorschläge.
 *
 * Mehr liest niemand, und auf einem Telefon verdeckt eine längere Liste die
 * halbe Seite. Wer mehr sehen will, drückt Enter und bekommt die Ergebnisseite.
 */
export const HOECHSTZAHL = 8;

export async function vorschlaege(eingabe: string): Promise<Vorschlag[]> {
  const treffer = await autovervollstaendige(ausfuehrer, eingabe, {}, HOECHSTZAHL);
  return treffer.map((t) => ({
    slug: t.slug,
    name: t.name,
    ort: t.ort,
    plz: t.plz,
    bundesland: t.bundesland,
    schulart: t.schulartOriginal,
  }));
}
