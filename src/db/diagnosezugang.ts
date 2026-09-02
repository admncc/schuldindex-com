/**
 * Den Diagnosezugang freischalten, beenden und prüfen.
 *
 * Die Regel, die alles andere trägt: **Es gibt höchstens einen offenen
 * Zugang, und jede Freischaltung erzeugt ein neues Kennwort.** Damit ist
 * „ausschalten“ nicht nur eine Anzeige, sondern eine Tatsache - ein Kennwort,
 * das jemand notiert hat, ist nach dem nächsten Umlegen wertlos, ohne dass
 * irgendwo eine Liste zurückgezogen werden müsste.
 */

import { sql } from "./verbindung";
import { erzeugeDiagnosetoken, hasheToken } from "../domain/diagnosetoken";
import type { Zugangsdauer } from "../domain/diagnose";

export interface Zugangslage {
  readonly offen: boolean;
  readonly gueltigBis: Date | null;
  readonly erstelltAm: Date | null;
  readonly erstelltVon: string | null;
  readonly zugriffe: number;
  readonly letzterZugriffAm: Date | null;
}

const LEER: Zugangslage = {
  offen: false,
  gueltigBis: null,
  erstelltAm: null,
  erstelltVon: null,
  zugriffe: 0,
  letzterZugriffAm: null,
};

export async function lageDiagnosezugang(): Promise<Zugangslage> {
  const [zeile] = await sql<
    {
      gueltig_bis: Date;
      erstellt_am: Date;
      moderator: string | null;
      zugriffe: number;
      letzter_zugriff_am: Date | null;
    }[]
  >`
    select z.gueltig_bis, z.erstellt_am, m.name as moderator, z.zugriffe, z.letzter_zugriff_am
    from diagnosezugang z
    left join moderatoren m on m.id = z.erstellt_von
    where z.beendet_am is null and z.gueltig_bis > now()
    order by z.erstellt_am desc
    limit 1
  `;

  if (zeile === undefined) return LEER;

  return {
    offen: true,
    gueltigBis: zeile.gueltig_bis,
    erstelltAm: zeile.erstellt_am,
    erstelltVon: zeile.moderator,
    zugriffe: zeile.zugriffe,
    letzterZugriffAm: zeile.letzter_zugriff_am,
  };
}

/**
 * Schaltet frei und gibt das Kennwort **einmal** zurück.
 *
 * Gespeichert wird nur der Hash - dieselbe Regel wie bei den
 * Bestätigungstoken und den Moderationssitzungen. Wer die Datenbank liest,
 * soll den Zugang nicht mitbenutzen können; bei einem Portal, dessen
 * Nutzerkreis überwiegend minderjährig ist, ist das keine theoretische Sorge.
 */
export async function schalteFrei(
  moderatorId: string,
  stunden: Zugangsdauer,
): Promise<{ klartext: string; gueltigBis: Date }> {
  const token = erzeugeDiagnosetoken(stunden);

  await sql.begin(async (tx) => {
    // `for update` gegen zwei gleichzeitige Klicks: sonst stünden hinterher
    // zwei offene Zugänge, und „ausschalten“ schlösse nur einen davon.
    await tx`select id from diagnosezugang where beendet_am is null for update`;
    await tx`update diagnosezugang set beendet_am = now() where beendet_am is null`;
    await tx`
      insert into diagnosezugang (token_hash, erstellt_von, gueltig_bis)
      values (${token.hash}, ${moderatorId}, ${token.gueltigBis})
    `;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('diagnose_freigeschaltet', ${moderatorId}, '',
              ${`Diagnosezugang für ${stunden} Stunden freigeschaltet`})
    `;
  });

  return { klartext: token.klartext, gueltigBis: token.gueltigBis };
}

export async function beendeZugang(moderatorId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const weg = await tx`update diagnosezugang set beendet_am = now() where beendet_am is null`;
    if (weg.count === 0) return false;
    await tx`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('diagnose_beendet', ${moderatorId}, '', 'Diagnosezugang beendet')
    `;
    return true;
  });
}

/**
 * Prüft ein vorgelegtes Kennwort.
 *
 * Verglichen wird der Hash in der Datenbank, nicht das Kennwort - deshalb
 * genügt hier ein Gleichheitsvergleich in SQL und kein zeitkonstanter in JS:
 * Der Hash ist ohne den HMAC-Schlüssel nicht rückwärts zu rechnen, und
 * geraten wird nicht an 32 zufälligen Byte.
 *
 * Der Zählerstand wird nebenbei fortgeschrieben. Wer im Panel sieht, dass ein
 * Zugang, den er für ungenutzt hielt, 400 Zugriffe hat, weiss sofort Bescheid.
 */
export async function pruefeToken(klartext: string): Promise<{ id: string } | null> {
  if (klartext.trim() === "") return null;

  const [zeile] = await sql<{ id: string }[]>`
    update diagnosezugang
       set zugriffe = zugriffe + 1, letzter_zugriff_am = now()
     where token_hash = ${hasheToken(klartext.trim())}
       and beendet_am is null
       and gueltig_bis > now()
    returning id::text
  `;

  return zeile ?? null;
}
