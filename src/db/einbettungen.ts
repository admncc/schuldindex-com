/**
 * Hinterlegte Fremdskripte lesen und setzen.
 *
 * **Warum hier ein Zwischenspeicher steht**, obwohl die Einstellungen bewusst
 * keinen haben: Diese Werte werden nicht bei der Abgabe einer Bewertung
 * gelesen, sondern beim Aufbau *jeder* Seite, und eine Stellschraube der
 * Betrugserkennung muss sofort greifen, ein Einwilligungsbanner nicht. Zehn
 * Sekunden sind der Kompromiss: kurz genug, dass „Speichern, neu laden,
 * nachsehen“ funktioniert, lang genug, dass eine Seite nicht eine Abfrage mehr
 * kostet als nötig.
 *
 * Und: Der Lesepfad **wirft nicht**. Beim Bauen des Pakets (`next build`)
 * laeuft das Wurzellayout ohne Datenbank; eine Ausnahme von hier wuerde den
 * Bau abbrechen. Ohne Datenbank ist nichts eingebettet - das ist die richtige
 * Annahme, denn es ist die, bei der nichts an Dritte geht.
 */

import { sql } from "./verbindung";
import { PLAETZE, type Platz } from "../domain/einbettung";

export interface Einbettung {
  readonly platz: Platz;
  readonly inhalt: string;
  readonly aktiv: boolean;
  readonly geaendertAm: Date | null;
  readonly geaendertVon: string | null;
}

export type Einbettungen = Readonly<Partial<Record<Platz, Einbettung>>>;

const FRISCHE_MS = 10_000;
let speicher: { stand: number; werte: Einbettungen } | null = null;

interface Zeile {
  platz: string;
  inhalt: string;
  aktiv: boolean;
  geaendert_am: Date;
  moderator: string | null;
}

async function frischLesen(): Promise<Einbettungen> {
  const zeilen = await sql<Zeile[]>`
    select e.platz, e.inhalt, e.aktiv, e.geaendert_am, m.name as moderator
    from einbettungen e left join moderatoren m on m.id = e.geaendert_von
  `;
  const werte: Partial<Record<Platz, Einbettung>> = {};
  for (const z of zeilen) {
    // Ein Platz, den der Code nicht kennt, wird uebergangen statt ausgeliefert:
    // Nach dem Entfernen eines Platzes soll sein Inhalt nicht weiterlaufen.
    if (!PLAETZE.includes(z.platz as Platz)) continue;
    werte[z.platz as Platz] = {
      platz: z.platz as Platz,
      inhalt: z.inhalt,
      aktiv: z.aktiv,
      geaendertAm: z.geaendert_am,
      geaendertVon: z.moderator,
    };
  }
  return werte;
}

/** Fuer die Anzeige im Panel - immer frisch, nie aus dem Zwischenspeicher. */
export async function holeEinbettungen(): Promise<Einbettungen> {
  const werte = await frischLesen();
  speicher = { stand: Date.now(), werte };
  return werte;
}

/** Fuer die Auslieferung - mit Zwischenspeicher, und ohne zu werfen. */
export async function holeEinbettungenFuerSeite(): Promise<Einbettungen> {
  if (speicher !== null && Date.now() - speicher.stand < FRISCHE_MS) return speicher.werte;
  try {
    const werte = await frischLesen();
    speicher = { stand: Date.now(), werte };
    return werte;
  } catch {
    // Beim Bauen ohne Datenbank, und wenn die Datenbank kurz weg ist: lieber
    // keine Einbettung als eine Seite, die nicht ausgeliefert wird.
    return speicher?.werte ?? {};
  }
}

export async function setzeEinbettung(
  platz: Platz,
  inhalt: string,
  aktiv: boolean,
  moderatorId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    const [vorher] = await tx<{ inhalt: string; aktiv: boolean }[]>`
      select inhalt, aktiv from einbettungen where platz = ${platz} for update
    `;
    if (vorher?.inhalt === inhalt && vorher?.aktiv === aktiv) return;

    if (inhalt.trim() === "") {
      await tx`delete from einbettungen where platz = ${platz}`;
    } else {
      await tx`
        insert into einbettungen (platz, inhalt, aktiv, geaendert_von, geaendert_am)
        values (${platz}, ${inhalt}, ${aktiv}, ${moderatorId}, now())
        on conflict (platz) do update set
          inhalt = excluded.inhalt,
          aktiv = excluded.aktiv,
          geaendert_von = excluded.geaendert_von,
          geaendert_am = now()
      `;
    }

    await tx`
      insert into einbettungsverlauf (platz, alter_inhalt, neuer_inhalt, alt_aktiv, neu_aktiv, moderator_id)
      values (${platz}, ${vorher?.inhalt ?? null}, ${inhalt}, ${vorher?.aktiv ?? null}, ${aktiv}, ${moderatorId})
    `;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('einbettung_geaendert', ${moderatorId}, '', ${
        inhalt.trim() === "" ? `Einbettung entfernt: ${platz}` : `Einbettung gesetzt: ${platz} (${aktiv ? "aktiv" : "aus"})`
      })
    `;
  });
  // Der Zwischenspeicher wird nicht abgewartet, sondern verworfen: Wer gerade
  // gespeichert hat, laedt gleich neu und soll das Ergebnis sehen.
  speicher = null;
}

export interface Verlaufszeile {
  id: string;
  platz: string;
  alter_inhalt: string | null;
  neuer_inhalt: string;
  alt_aktiv: boolean | null;
  neu_aktiv: boolean;
  geaendert_am: Date;
  moderator_name: string | null;
}

export async function einbettungsverlauf(grenze = 20): Promise<Verlaufszeile[]> {
  return sql<Verlaufszeile[]>`
    select v.id, v.platz, v.alter_inhalt, v.neuer_inhalt, v.alt_aktiv, v.neu_aktiv,
           v.geaendert_am, m.name as moderator_name
    from einbettungsverlauf v
    left join moderatoren m on m.id = v.moderator_id
    order by v.geaendert_am desc
    limit ${grenze}
  `;
}
