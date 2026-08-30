/**
 * Speichern und Abrufen der Meldungen nach Art. 16 DSA.
 */

import { sql } from "./verbindung";
import { deuteAdresse, type Meldegrund } from "../domain/meldung";
import { kontaktHash, verschluessele, entschluesseleWennMoeglich } from "../domain/kontakt";
import type { Meldestatus } from "../domain/meldungsstatus";

export interface NeueMeldung {
  readonly url: string;
  readonly grund: Meldegrund;
  readonly erlaeuterung: string;
  readonly name: string;
  readonly kontakt: string;
}

/**
 * Nimmt eine Meldung entgegen.
 *
 * Die Kontaktadresse wird verschlüsselt abgelegt - wie jeder andere Kontakt im
 * System. Wer eine Bewertung meldet, ist häufig die betroffene Lehrkraft; eine
 * Klartextliste solcher Adressen neben den Bewertungen wäre genau die
 * Verknüpfung, die dieses Portal nicht anlegen will.
 */
export async function nimmMeldungAn(m: NeueMeldung): Promise<{ id: string; eingegangenAm: Date }> {
  const ziel = deuteAdresse(m.url);

  const schuleId =
    ziel.art === "schule"
      ? ((
          await sql<{ id: string }[]>`select id from schulen where slug = ${ziel.wert!}`
        )[0]?.id ?? null)
      : null;

  const bewertungId =
    ziel.art === "bewertung"
      ? ((
          await sql<{ id: string }[]>`select id from bewertungen where id = ${ziel.wert!}`
        )[0]?.id ?? null)
      : null;

  const kontakt = m.kontakt.trim();
  // Auch der Name wird verschlüsselt abgelegt. Im Klartext entstünde neben den
  // Bewertungen genau die Liste, die die Verschlüsselung des Kontakts
  // verhindern soll: wer wen gemeldet hat.
  const name = m.name.trim();
  const [zeile] = await sql<{ id: string; eingegangen_am: Date }[]>`
    insert into meldungen (
      url, schule_id, bewertung_id, grund, erlaeuterung,
      melder_name_chiffre, melder_chiffre, melder_hash, gutglauben_am
    ) values (
      ${m.url.trim()}, ${schuleId}, ${bewertungId}, ${m.grund}::meldegrund, ${m.erlaeuterung.trim()},
      ${name === "" ? null : verschluessele(name)},
      ${kontakt === "" ? null : verschluessele(kontakt)},
      ${kontakt === "" ? null : kontaktHash(kontakt, "email")},
      now()
    )
    returning id, eingegangen_am
  `;
  return { id: zeile!.id, eingegangenAm: zeile!.eingegangen_am };
}

export interface Meldungsuebersicht {
  id: string;
  url: string;
  grund: Meldegrund;
  erlaeuterung: string;
  /** Entschlüsselt, sobald die Moderation die Liste ansieht - so wie der Kontakt auch. */
  melder_name: string | null;
  status: Meldestatus;
  eingegangen_am: Date;
  schule_name: string | null;
  schule_slug: string | null;
  bewertung_id: string | null;
  /** Wie viele Meldungen dieselbe Adresse schon geschickt hat - Art. 23 DSA. */
  vom_selben_melder: number;
}

/** Die offenen Meldungen für die Moderation, älteste zuerst. */
export async function offeneMeldungen(grenze = 50): Promise<Meldungsuebersicht[]> {
  const zeilen = await sql<(Omit<Meldungsuebersicht, "melder_name"> & { melder_name_chiffre: Buffer | null })[]>`
    select m.id, m.url, m.grund::text as grund, m.erlaeuterung, m.melder_name_chiffre,
           m.status::text as status, m.eingegangen_am,
           s.name as schule_name, s.slug as schule_slug, m.bewertung_id,
           (
             select count(*)::int from meldungen a
             where m.melder_hash is not null and a.melder_hash = m.melder_hash
           ) as vom_selben_melder
    from meldungen m
    left join schulen s on s.id = m.schule_id
    where m.status in ('eingegangen', 'in_bearbeitung')
    order by m.eingegangen_am asc
    limit ${grenze}
  `;

  return zeilen.map(({ melder_name_chiffre, ...rest }) => ({
    ...rest,
    // Unlesbar nach einem Schlüsselwechsel: dann bleibt das Feld leer, statt
    // die ganze Liste scheitern zu lassen.
    melder_name:
      melder_name_chiffre === null ? null : entschluesseleWennMoeglich(melder_name_chiffre),
  }));
}

/** Entscheidet über eine Meldung und hält die Begründung fest (Art. 16 Abs. 5). */
export async function entscheideMeldung(
  id: string,
  moderatorId: string,
  status: Extract<Meldestatus, "erledigt" | "abgelehnt">,
  entscheidung: string,
): Promise<boolean> {
  const ergebnis = await sql`
    update meldungen
    set status = ${status}::meldestatus, entscheidung = ${entscheidung},
        moderator_id = ${moderatorId}, entschieden_am = now()
    where id = ${id} and status in ('eingegangen', 'in_bearbeitung')
  `;
  return ergebnis.count > 0;
}

/**
 * Die Adresse der meldenden Person im Klartext.
 *
 * Gebraucht für die Mitteilung der Entscheidung. Getrennte Funktion, damit der
 * Klartext nicht beiläufig in jeder Übersicht mitläuft.
 */
export async function melderadresse(id: string): Promise<string | null> {
  const [zeile] = await sql<{ melder_chiffre: Uint8Array | null }[]>`
    select melder_chiffre from meldungen where id = ${id}
  `;
  if (!zeile?.melder_chiffre) return null;
  return entschluesseleWennMoeglich(Buffer.from(zeile.melder_chiffre));
}
