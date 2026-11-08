/**
 * Was beim Bestätigen eines Kontos geschieht - an einer Stelle.
 *
 * **Warum herausgelöst.** Es gibt jetzt zwei Wege, auf denen eine Bestätigung
 * ankommt: den Link aus der E-Mail und den sechsstelligen Code aus der SMS.
 * Beide müssen dasselbe tun, sonst entsteht genau der Unterschied, den
 * niemand bemerkt - etwa dass der eine Weg die Betrugsprüfung anwendet und
 * der andere nicht. Die Logik stand bis hierher in der Seite des Links; die
 * zweite Abschrift hätte früher oder später eine andere Regel enthalten.
 *
 * **Nicht pauschal freigeben** ist dabei der Kern. Bei der Abgabe wartet die
 * erste Bewertung zuerst auf die Bestätigung; ihre Betrugssignale sind
 * gespeichert, aber noch nicht angewandt. Wer hier stumpf auf „freigegeben"
 * setzte, liesse jede Erstabgabe ungeprüft durch - mit einer frischen Adresse
 * also jede.
 */

import type postgres from "postgres";
import { sql } from "./verbindung";
import { ausloeserNachBestaetigung } from "../domain/betrugspruefung";
import { wechsle } from "../domain/bewertungsstatus";
import { aktualisiereAggregate } from "./aggregate";

export interface Bestaetigungsfolge {
  /** Wie viele Bewertungen auf die Bestätigung gewartet haben. */
  readonly gesamt: number;
  /** Wie viele davon sofort veröffentlicht wurden - der Rest geht in die Moderation. */
  readonly veroeffentlicht: number;
}

interface Wartend {
  id: string;
  schule_id: string;
  signalpunkte: number | null;
  signale: { art: string }[];
}

/**
 * Setzt das Konto auf bestätigt und schickt die wartenden Bewertungen weiter.
 *
 * Läuft in der übergebenen Transaktion, damit kein Zwischenzustand entsteht,
 * in dem das Token verbraucht, das Konto aber unbestätigt ist. Der Aufrufer
 * verbraucht das Token in derselben Transaktion.
 */
export async function bestaetigeKonto(
  tx: postgres.TransactionSql,
  kontoId: string,
  halteschwelle: number,
): Promise<Bestaetigungsfolge> {
  await tx`update konten set verifiziert_am = coalesce(verifiziert_am, now()) where id = ${kontoId}`;

  const wartende = await tx<Wartend[]>`
    select id, schule_id, signalpunkte, coalesce(signale, '[]'::jsonb) as signale
    from bewertungen
    where konto_id = ${kontoId} and status = 'wartet_auf_verifizierung'
    for update
  `;

  let veroeffentlicht = 0;
  for (const b of wartende) {
    const uebergang = wechsle(
      "wartet_auf_verifizierung",
      ausloeserNachBestaetigung(b.signalpunkte, b.signale, halteschwelle),
    );
    if (!uebergang.ok) continue;
    if (uebergang.nach === "freigegeben") veroeffentlicht += 1;
    await tx`
      update bewertungen set status = ${uebergang.nach}::bewertungsstatus, aktualisiert_am = now()
      where id = ${b.id}
    `;
  }

  // Ohne diese Zeile bleibt die Bewertung sichtbar freigegeben, das Schulprofil
  // zeigt aber weiter den Stand von vorher.
  await aktualisiereAggregate(wartende.map((z) => z.schule_id), tx);
  return { gesamt: wartende.length, veroeffentlicht };
}

export type Codeergebnis =
  | { readonly ok: true; readonly folge: Bestaetigungsfolge }
  | { readonly ok: false; readonly grund: "unbekannt" | "abgelaufen" | "verbraucht" | "falsch" | "zu_viele" };

/**
 * Prüft einen eingegebenen Code gegen die wartende Bewertung.
 *
 * **Der Zähler wird auch bei einem falschen Code hochgesetzt** - und zwar in
 * derselben Transaktion, in der verglichen wird. Stünde er daneben, liessen
 * sich durch gleichzeitige Anfragen beliebig viele Versuche unterbringen,
 * bevor der erste gezählt ist; bei sechs Ziffern ist das der Unterschied
 * zwischen aussichtslos und machbar.
 */
export async function loeseCodeEin(
  bewertungId: string,
  abdruck: (kontoId: string) => string,
  hoechstversuche: number,
  halteschwelle: number,
): Promise<Codeergebnis> {
  return sql.begin(async (tx) => {
    const [bewertung] = await tx<{ konto_id: string }[]>`
      select konto_id from bewertungen where id = ${bewertungId}
    `;
    if (bewertung === undefined) return { ok: false, grund: "unbekannt" } as const;

    const [token] = await tx<
      { id: string; token_hash: string; gueltig_bis: Date; verbraucht_am: Date | null; versuche: number }[]
    >`
      select id, token_hash, gueltig_bis, verbraucht_am, versuche
      from verifizierungstoken
      where konto_id = ${bewertung.konto_id} and zweck = 'code'
      order by erstellt_am desc
      limit 1
      for update
    `;
    if (token === undefined) return { ok: false, grund: "unbekannt" } as const;
    if (token.verbraucht_am !== null) return { ok: false, grund: "verbraucht" } as const;
    if (token.gueltig_bis.getTime() <= Date.now()) return { ok: false, grund: "abgelaufen" } as const;
    if (token.versuche >= hoechstversuche) return { ok: false, grund: "zu_viele" } as const;

    await tx`update verifizierungstoken set versuche = versuche + 1 where id = ${token.id}`;

    const erwartet = abdruck(bewertung.konto_id);
    // Zeitkonstant im Domänenmodul; hier zählt nur, dass bei Ungleichheit der
    // Zähler trotzdem stehenbleibt - das `update` oben ist schon geschrieben.
    if (erwartet !== token.token_hash) return { ok: false, grund: "falsch" } as const;

    await tx`update verifizierungstoken set verbraucht_am = now() where id = ${token.id}`;
    const folge = await bestaetigeKonto(tx, bewertung.konto_id, halteschwelle);
    return { ok: true, folge } as const;
  });
}
