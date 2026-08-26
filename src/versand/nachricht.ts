/**
 * Versand der Bestätigungsnachricht.
 *
 * Entscheidung E6: die **Telefonnummer ist der primäre Weg**, in der Kette
 * WhatsApp → SMS. E-Mail dient als Rückfall, wenn keine Nummer vorliegt.
 *
 * Der Rückfall von WhatsApp auf SMS ist keine Kür: WhatsApp setzt ein Konto zur
 * Nummer voraus. Ohne SMS bliebe jede Person ohne WhatsApp ausgesperrt — und
 * ohne E-Mail zusätzlich jedes Grundschulkind ohne eigene Nummer.
 */

import type { Kontaktart } from "../domain/kontakt";
import { ANMELDELINK_STUNDEN } from "../domain/kontozugang";

export interface Nachricht {
  readonly empfaenger: string;
  readonly betreff: string;
  readonly text: string;
}

export type Zustellergebnis =
  | { readonly ok: true; readonly weg: Kontaktart }
  | { readonly ok: false; readonly grund: string };

export interface Versandweg {
  readonly art: Kontaktart;
  /** Kann dieser Weg den Empfänger überhaupt erreichen? */
  zustaendig(empfaenger: string, gewuenscht: Kontaktart): boolean;
  sende(nachricht: Nachricht): Promise<Zustellergebnis>;
}

/** Grenze einer einzelnen SMS. Darüber wird geteilt und doppelt berechnet. */
export const SMS_GRENZE = 160;

/**
 * Baut die Bestätigungsnachricht.
 *
 * Der Kurztext bleibt bewusst unter der SMS-Grenze; ein Test wacht darüber.
 * Bei 6.000 Bestätigungen im Monat ist die zweite Nachricht kein Rundungsfehler.
 */
export function baueBestaetigung(basisUrl: string, token: string, art: Kontaktart): Nachricht {
  const link = `${basisUrl}/bestaetigen?token=${token}`;
  if (art === "email") {
    return {
      empfaenger: "",
      betreff: "Bestätige deine Bewertung bei SCHULINDEX",
      text:
        `Hallo,\n\n` +
        `bitte bestätige deine Bewertung über diesen Link:\n${link}\n\n` +
        `Der Link ist 24 Stunden gültig. Wenn du keine Bewertung abgegeben hast, ` +
        `kannst du diese Nachricht ignorieren.\n\n` +
        `— SCHULINDEX`,
    };
  }
  return {
    empfaenger: "",
    betreff: "",
    text: `SCHULINDEX: Bitte bestätige deine Bewertung: ${link} (24 Std. gültig)`,
  };
}

/**
 * Anmeldelink für den Kontobereich.
 *
 * Kürzere Frist als die Bestätigung und ein deutlicher Warnsatz: Wer diese
 * Nachricht bekommt, ohne sie angefordert zu haben, hat es mit jemandem zu tun,
 * der seine Nummer kennt und sich als er ausgeben will.
 */
export function baueAnmeldelink(basisUrl: string, token: string, art: Kontaktart): Nachricht {
  const link = `${basisUrl}/konto/eintreten?token=${token}`;
  if (art === "email") {
    return {
      empfaenger: "",
      betreff: "Dein Anmeldelink für SCHULINDEX",
      text:
        `Hallo,\n\n` +
        `hier ist dein Anmeldelink zu deinen Bewertungen:\n${link}\n\n` +
        `Der Link ist ${ANMELDELINK_STUNDEN} Stunden gültig und lässt sich nur einmal benutzen.\n\n` +
        `Hast du ihn nicht angefordert, ignorier diese Nachricht — dann versucht jemand, ` +
        `sich Zugang zu deinen Bewertungen zu verschaffen. Gib den Link niemandem weiter.\n\n` +
        `— SCHULINDEX`,
    };
  }
  return {
    empfaenger: "",
    betreff: "",
    text:
      `SCHULINDEX: dein Anmeldelink: ${link} (${ANMELDELINK_STUNDEN} Std. gültig). ` +
      `Nicht angefordert? Dann ignorieren und niemandem weitergeben.`,
  };
}

/**
 * Arbeitet die Wege der Reihe nach ab und nimmt den ersten, der zustellt.
 *
 * Ein fehlgeschlagener Weg beendet den Versuch nicht — genau dafür ist die
 * Kette da. Erst wenn alle scheitern, scheitert der Versand.
 */
export async function sende(
  wege: readonly Versandweg[],
  empfaenger: string,
  gewuenscht: Kontaktart,
  nachricht: Nachricht,
): Promise<Zustellergebnis> {
  const gruende: string[] = [];

  for (const weg of wege) {
    if (!weg.zustaendig(empfaenger, gewuenscht)) continue;
    const ergebnis = await weg.sende({ ...nachricht, empfaenger });
    if (ergebnis.ok) return ergebnis;
    gruende.push(`${weg.art}: ${ergebnis.grund}`);
  }

  return {
    ok: false,
    grund: gruende.length === 0 ? "kein passender Versandweg" : gruende.join("; "),
  };
}

/**
 * Die Reihenfolge der Wege für den Betrieb.
 *
 * WhatsApp und SMS gelten beide für Telefonnummern — deshalb greift der
 * Rückfall automatisch, wenn WhatsApp die Nummer nicht erreicht.
 */
export function istTelefonweg(art: Kontaktart): boolean {
  return art === "whatsapp" || art === "sms";
}

/** Zuständigkeitsregel, die sich alle Telefonwege teilen. */
export function telefonZustaendig(empfaenger: string, gewuenscht: Kontaktart): boolean {
  return istTelefonweg(gewuenscht) && empfaenger.startsWith("+");
}
