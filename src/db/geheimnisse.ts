/**
 * Hinterlegte Zugangsschlüssel lesen und setzen.
 *
 * Die Regel für die Herkunft steht hier an einer Stelle, damit sie nicht an
 * jeder Aufrufstelle neu erfunden wird: **Umgebung vor Datenbank.** Was im
 * Betrieb gesetzt wurde, soll sich nicht aus einer Oberfläche heraus
 * überschreiben lassen; die Datenbank ist der Weg für alle, die keinen
 * Serverzugang haben.
 */

import { sql } from "./verbindung";
import {
  entschluesseleGeheimnis,
  verschleiereSchluessel,
  verschluesseleGeheimnis,
} from "../domain/geheimnis";

export const ANTHROPIC = "anthropic_api_key";

export interface Geheimnislage {
  readonly ausUmgebung: boolean;
  readonly inDatenbank: boolean;
  readonly hinweis: string | null;
  readonly gesetztAm: Date | null;
  readonly gesetztVon: string | null;
  /** Ob überhaupt ein benutzbarer Schlüssel vorliegt. */
  readonly vorhanden: boolean;
}

export async function lage(name: string, umgebungsvariable: string): Promise<Geheimnislage> {
  const ausUmgebung = (process.env[umgebungsvariable] ?? "").trim() !== "";
  const [zeile] = await sql<{ hinweis: string; gesetzt_am: Date; moderator: string | null }[]>`
    select g.hinweis, g.gesetzt_am, m.name as moderator
    from geheimnisse g left join moderatoren m on m.id = g.gesetzt_von
    where g.name = ${name}
  `;

  return {
    ausUmgebung,
    inDatenbank: zeile !== undefined,
    hinweis: zeile?.hinweis ?? null,
    gesetztAm: zeile?.gesetzt_am ?? null,
    gesetztVon: zeile?.moderator ?? null,
    vorhanden: ausUmgebung || zeile !== undefined,
  };
}

/**
 * Der benutzbare Schlüssel - Umgebung zuerst.
 *
 * Gibt `null` zurück, wenn keiner hinterlegt ist oder der gespeicherte nicht
 * mehr entschlüsselt werden kann (Schlüsselwechsel). Der Aufrufer soll das als
 * „nicht eingerichtet“ behandeln und nicht abstürzen.
 */
export async function holeSchluessel(name: string, umgebungsvariable: string): Promise<string | null> {
  const ausUmgebung = (process.env[umgebungsvariable] ?? "").trim();
  if (ausUmgebung !== "") return ausUmgebung;

  const [zeile] = await sql<{ chiffre: Uint8Array }[]>`
    select chiffre from geheimnisse where name = ${name}
  `;
  if (zeile === undefined) return null;
  return entschluesseleGeheimnis(Buffer.from(zeile.chiffre));
}

export async function setzeSchluessel(
  name: string,
  klartext: string,
  moderatorId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into geheimnisse (name, chiffre, hinweis, gesetzt_von)
      values (${name}, ${verschluesseleGeheimnis(klartext)}, ${verschleiereSchluessel(klartext)}, ${moderatorId})
      on conflict (name) do update set
        chiffre = excluded.chiffre,
        hinweis = excluded.hinweis,
        gesetzt_am = now(),
        gesetzt_von = excluded.gesetzt_von
    `;
    // Im Protokoll steht, dass ein Schlüssel gewechselt wurde - nie der
    // Schlüssel selbst, auch nicht verkürzt.
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('geheimnis_geaendert', ${moderatorId}, '', ${`Zugangsschlüssel gesetzt: ${name}`})
    `;
  });
}

export async function entferneSchluessel(name: string, moderatorId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`delete from geheimnisse where name = ${name}`;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('geheimnis_geaendert', ${moderatorId}, '', ${`Zugangsschlüssel entfernt: ${name}`})
    `;
  });
}
