/**
 * Empfehlungen in der Datenbank.
 *
 * Der Code hängt am Konto und wird beim ersten Bedarf erzeugt - nicht schon
 * beim Anlegen: Wer bewertet und nie bestätigt, braucht keinen Link, und ein
 * Code, der nie ausgegeben wurde, ist nur eine Zeile mehr im Index.
 */

import { sql } from "./verbindung";
import { istEmpfehlungscode } from "../domain/empfehlung";
import { erzeugeEmpfehlungscode } from "../domain/empfehlungscode";
import { istKennung } from "../domain/kennung";
import type { Zeitraum } from "../domain/verlosung";

/**
 * Der Code des Kontos - vorhandener oder neu erzeugter.
 *
 * Die Schleife fängt den seltenen Fall ab, dass zwei Konten denselben Code
 * ziehen. Bei 50 Bit ist das kaum zu erwarten, aber ein eindeutiger Index, der
 * einmal im Jahr eine Bestätigungsseite scheitern lässt, wäre teurer als drei
 * Zeilen Code.
 */
export async function empfehlungscodeFuer(kontoId: string): Promise<string | null> {
  if (!istKennung(kontoId)) return null;

  const [vorhanden] = await sql<{ empfehlungscode: string | null }[]>`
    select empfehlungscode from konten where id = ${kontoId}
  `;
  if (vorhanden === undefined) return null;
  if (vorhanden.empfehlungscode !== null) return vorhanden.empfehlungscode;

  for (let versuch = 0; versuch < 5; versuch++) {
    const code = erzeugeEmpfehlungscode();
    const zeilen = await sql<{ empfehlungscode: string }[]>`
      update konten set empfehlungscode = ${code}
      where id = ${kontoId} and empfehlungscode is null
        and not exists (select 1 from konten k where k.empfehlungscode = ${code})
      returning empfehlungscode
    `;
    if (zeilen[0] !== undefined) return zeilen[0].empfehlungscode;

    // Ein anderer Aufruf war schneller - dann steht der Code jetzt da.
    const [nachher] = await sql<{ empfehlungscode: string | null }[]>`
      select empfehlungscode from konten where id = ${kontoId}
    `;
    if (nachher?.empfehlungscode) return nachher.empfehlungscode;
  }
  return null;
}

/** Das werbende Konto zu einem Code. */
export async function kontoZuCode(code: string): Promise<string | null> {
  if (!istEmpfehlungscode(code)) return null;
  const [zeile] = await sql<{ id: string }[]>`
    select id from konten where empfehlungscode = ${code}
  `;
  return zeile?.id ?? null;
}

/**
 * Hält fest, dass ein Konto über eine Empfehlung entstanden ist.
 *
 * Läuft still ins Leere, wenn die Beziehung schon besteht, wenn jemand sich
 * selbst wirbt oder wenn der Code nicht zuzuordnen ist. Eine Fehlermeldung
 * hätte an dieser Stelle keinen Empfänger: Die Person hat gerade bewertet, und
 * die Bewertung ist wichtiger als die Empfehlung.
 */
export async function merkeEmpfehlung(
  werberKontoId: string,
  geworbenesKontoId: string,
  bewertungId: string,
): Promise<boolean> {
  if (!istKennung(werberKontoId) || !istKennung(geworbenesKontoId)) return false;
  if (werberKontoId === geworbenesKontoId) return false;

  const zeilen = await sql<{ id: string }[]>`
    insert into empfehlungen (werber_konto_id, geworbenes_konto_id, bewertung_id)
    values (${werberKontoId}, ${geworbenesKontoId}, ${bewertungId})
    on conflict (geworbenes_konto_id) do nothing
    returning id
  `;
  return zeilen.length > 0;
}

export interface Empfehlungsstand {
  /** Wie viele geworbene Personen bewertet haben - unabhängig vom Zustand. */
  readonly geworben: number;
  /** Davon mit veröffentlichter Bewertung - nur die zählen für die Superverlosung. */
  readonly zaehlend: number;
}

/** Der Stand eines Kontos im laufenden Monat. */
export async function empfehlungsstand(
  kontoId: string,
  zeitraum: Zeitraum,
): Promise<Empfehlungsstand> {
  if (!istKennung(kontoId)) return { geworben: 0, zaehlend: 0 };

  const [zeile] = await sql<{ geworben: number; zaehlend: number }[]>`
    select count(*)::int as geworben,
           count(*) filter (where b.status = 'freigegeben')::int as zaehlend
    from empfehlungen e
    left join bewertungen b on b.id = e.bewertung_id
    where e.werber_konto_id = ${kontoId}
      and e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}
  `;
  return { geworben: zeile?.geworben ?? 0, zaehlend: zeile?.zaehlend ?? 0 };
}

/** Wie viele Empfehlungen es insgesamt gab - für die Übersicht im Panel. */
export async function empfehlungszahlen(zeitraum: Zeitraum): Promise<{
  gesamt: number;
  zaehlend: number;
  werber: number;
}> {
  const [zeile] = await sql<{ gesamt: number; zaehlend: number; werber: number }[]>`
    select count(*)::int as gesamt,
           count(*) filter (where b.status = 'freigegeben')::int as zaehlend,
           count(distinct e.werber_konto_id)::int as werber
    from empfehlungen e
    left join bewertungen b on b.id = e.bewertung_id
    where e.erstellt_am >= ${zeitraum.von} and e.erstellt_am < ${zeitraum.bis}
  `;
  return zeile ?? { gesamt: 0, zaehlend: 0, werber: 0 };
}
