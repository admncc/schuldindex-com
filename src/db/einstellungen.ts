/**
 * Laden und Speichern der Einstellungen.
 *
 * Gespeichert wird nur, was von der Vorgabe abweicht. Eine leere Tabelle heißt:
 * alles steht auf den Werten aus dem Katalog.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { beschreibung, mitVorgaben, pruefeWert, type Einstellungen } from "../domain/einstellungen";

/**
 * Die geltenden Einstellungen.
 *
 * Wird bei jeder Abgabe gelesen. Das ist eine Abfrage über eine Tabelle mit
 * höchstens einem Dutzend Zeilen — ein Zwischenspeicher wäre schneller und
 * brächte das Problem mit, dass eine Änderung erst nach dem Neustart wirkt.
 * Genau das darf bei einer Stellschraube der Betrugserkennung nicht passieren.
 */
export async function holeEinstellungen(): Promise<Einstellungen> {
  const zeilen = await sql<{ schluessel: string; wert: string }[]>`
    select schluessel, wert from einstellungen
  `;
  return mitVorgaben(Object.fromEntries(zeilen.map((z) => [z.schluessel, Number(z.wert)])));
}

export interface Aenderung {
  readonly schluessel: string;
  readonly wert: number;
}

export interface Speicherergebnis {
  readonly geaendert: readonly { schluessel: string; alt: number | null; neu: number }[];
  readonly fehler: readonly { schluessel: string; meldung: string }[];
}

/**
 * Speichert geänderte Werte.
 *
 * Zwei Dinge, die die erste Fassung falsch machte:
 *
 *  - **Unveränderte Werte werden übergangen.** Das Formular schickt alle Felder;
 *    ohne diesen Vergleich stünden nach jedem Speichern ein Dutzend Einträge im
 *    Verlauf, und der Verlauf wäre nicht mehr lesbar.
 *  - **Ein Wert gleich der Vorgabe löscht die Zeile**, statt die Vorgabe noch
 *    einmal hineinzuschreiben. Sonst füllt sich die Tabelle mit Zeilen, die
 *    nichts aussagen, und „weicht von der Vorgabe ab“ ließe sich nicht mehr an
 *    ihrem Vorhandensein ablesen.
 */
export async function speichereEinstellungen(
  aenderungen: readonly Aenderung[],
  moderatorId: string,
): Promise<Speicherergebnis> {
  const geprueft: Aenderung[] = [];
  const fehler: { schluessel: string; meldung: string }[] = [];

  for (const a of aenderungen) {
    const ergebnis = pruefeWert(a.schluessel, a.wert);
    if (ergebnis.ok) geprueft.push({ schluessel: a.schluessel, wert: ergebnis.wert });
    else fehler.push({ schluessel: a.schluessel, meldung: ergebnis.meldung });
  }

  if (geprueft.length === 0) return { geaendert: [], fehler };

  const geaendert = await sql.begin(async (tx: postgres.TransactionSql) => {
    const vorher = new Map<string, number>(
      (await tx<{ schluessel: string; wert: string }[]>`select schluessel, wert from einstellungen`)
        .map((z) => [z.schluessel, Number(z.wert)]),
    );

    const liste: { schluessel: string; alt: number | null; neu: number }[] = [];
    for (const a of geprueft) {
      const gespeichert = vorher.get(a.schluessel) ?? null;
      const vorgabe = beschreibung(a.schluessel)?.vorgabe ?? null;
      const bisher = gespeichert ?? vorgabe;

      if (bisher === a.wert) continue;

      if (a.wert === vorgabe) {
        await tx`delete from einstellungen where schluessel = ${a.schluessel}`;
      } else {
        await tx`
          insert into einstellungen (schluessel, wert, geaendert_von, geaendert_am)
          values (${a.schluessel}, ${a.wert}, ${moderatorId}, now())
          on conflict (schluessel) do update
            set wert = excluded.wert, geaendert_von = excluded.geaendert_von, geaendert_am = now()
        `;
      }

      await tx`
        insert into einstellungsverlauf (schluessel, alter_wert, neuer_wert, moderator_id)
        values (${a.schluessel}, ${bisher}, ${a.wert}, ${moderatorId})
      `;
      liste.push({ schluessel: a.schluessel, alt: bisher, neu: a.wert });
    }
    return liste;
  });

  return { geaendert, fehler };
}

export interface Verlaufseintrag {
  id: string;
  schluessel: string;
  alter_wert: string | null;
  neuer_wert: string;
  geaendert_am: Date;
  moderator_name: string | null;
}

export async function verlauf(grenze = 30): Promise<Verlaufseintrag[]> {
  return sql<Verlaufseintrag[]>`
    select v.id, v.schluessel, v.alter_wert, v.neuer_wert, v.geaendert_am, m.name as moderator_name
    from einstellungsverlauf v
    left join moderatoren m on m.id = v.moderator_id
    order by v.geaendert_am desc
    limit ${grenze}
  `;
}
