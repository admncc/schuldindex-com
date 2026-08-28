/**
 * Der Anmeldevorgang der Moderation.
 *
 * Wie beim Abgabedienst steht hier kein SQL: die Datenbank kommt als
 * `Zugang` herein. Das ist an dieser Stelle mehr als Stilfrage - die
 * Reihenfolge der Prüfungen und das, was bei jedem Fehlschlag protokolliert
 * wird, sind die eigentliche Sicherheitsleistung, und beides lässt sich so
 * ohne laufende Datenbank vollständig prüfen.
 */

import {
  ANMELDUNG_FEHLGESCHLAGEN,
  erzeugeSitzung,
  pruefeSperre,
  sperrhinweis,
  stimmtPasswort,
  type Sitzungstoken,
} from "../domain/anmeldung";
import { pruefeCode } from "../domain/totp";

export interface Moderatorkonto {
  readonly id: string;
  readonly kennung: string;
  readonly name: string;
  readonly passwortAbdruck: string;
  readonly totpGeheimnis: string | null;
  readonly totpLetzterSchritt: number | null;
  readonly rolle: "moderation" | "leitung";
  readonly aktiv: boolean;
  readonly fehlversuche: number;
  readonly letzterFehlversuchAm: Date | null;
}

export interface Zugang {
  findeModerator(kennung: string): Promise<Moderatorkonto | null>;
  merkeFehlversuch(id: string, jetzt: Date): Promise<void>;
  /**
   * Setzt die Fehlversuche zurück und hält den verbrauchten TOTP-Schritt fest.
   *
   * `null` heißt: Es wurde kein Code verbraucht, der gespeicherte Schritt bleibt
   * unangetastet. Das ist der Fall bei abgeschaltetem zweitem Faktor - ihn dabei
   * zu überschreiben hieße, einen alten Code nach dem Wiedereinschalten erneut
   * gültig zu machen.
   */
  merkeAnmeldung(id: string, schritt: number | null, jetzt: Date): Promise<void>;
  legeSitzungAn(id: string, hash: string, gueltigBis: Date): Promise<void>;
  protokolliere(eintrag: {
    aktion: "anmeldung" | "anmeldung_fehlgeschlagen";
    moderatorId: string | null;
    kennungVersuch: string;
    begruendung: string;
  }): Promise<void>;
}

export interface Anmeldedaten {
  readonly kennung: string;
  readonly passwort: string;
  readonly code: string;
}

export type Anmeldeergebnis =
  | { readonly ok: true; readonly moderator: Moderatorkonto; readonly sitzung: Sitzungstoken }
  | { readonly ok: false; readonly meldung: string };

export interface Anmeldeoptionen {
  /**
   * Ob der zweite Faktor verlangt wird.
   *
   * Abschaltbar im Panel selbst (`/moderation/einstellungen`, Einstellung
   * `zweiter_faktor`; Stand 27.08.2026 aus, auf Entscheidung des Auftraggebers
   * für den Testbetrieb). Was dann bleibt, ist ein Kennwort vor einem Panel, das
   * Klartextkontakte entschlüsselt, Bewertungen freigibt und die
   * Betrugsschwellen verstellt. Für den Echtbetrieb ist das zu wenig; deshalb
   * ist der Schalter kein stiller, sondern einer, der in der Oberfläche sichtbar
   * bleibt (`app/moderation/layout.tsx`) und im Verlauf steht.
   *
   * Der Vorgabewert *dieser Funktion* bleibt „an“: Wer sie ohne Angabe aufruft,
   * bekommt die sichere Fassung. Was gilt, entscheidet die Aufrufstelle mit dem
   * Wert aus den Einstellungen.
   */
  readonly zweiterFaktorPflicht?: boolean;
  /** Gültigkeitsdauer der Sitzung in Stunden; ohne Angabe die Vorgabe des Domänenmoduls. */
  readonly sitzungsstunden?: number;
}

/**
 * Meldet an - oder eben nicht.
 *
 * Drei Festlegungen, die den Ablauf bestimmen:
 *
 *  - **Ein einziger Fehlertext.** „Kennung unbekannt“ und „Code falsch“ zu
 *    unterscheiden hieße, jemandem zu bestätigen, dass das Kennwort saß und nur
 *    noch der zweite Faktor fehlt. Genau das ist die Auskunft, die zählt.
 *  - **Kennwort wird auch bei unbekannter Kennung gerechnet.** Sonst antwortet
 *    das System auf existierende Kennungen hundert Millisekunden langsamer, und
 *    die Liste der Moderatoren ist mit einer Stoppuhr auslesbar.
 *  - **Der Fehlversuch zählt vor der Antwort.** Auch bei richtigem Kennwort und
 *    falschem Code - sonst ließe sich der sechsstellige Code mit bekanntem
 *    Kennwort ungebremst durchprobieren.
 */
export async function melde(
  zugang: Zugang,
  daten: Anmeldedaten,
  jetzt = new Date(),
  optionen: Anmeldeoptionen = {},
): Promise<Anmeldeergebnis> {
  const zweiterFaktorPflicht = optionen.zweiterFaktorPflicht ?? true;
  const kennung = daten.kennung.trim();
  const konto = await zugang.findeModerator(kennung);

  if (konto === null) {
    // Gegen die Zeitmessung: dieselbe Arbeit wie bei einem echten Konto.
    await stimmtPasswort(daten.passwort, BLINDABDRUCK);
    await zugang.protokolliere({
      aktion: "anmeldung_fehlgeschlagen",
      moderatorId: null,
      kennungVersuch: kennung,
      begruendung: "Kennung unbekannt",
    });
    return { ok: false, meldung: ANMELDUNG_FEHLGESCHLAGEN };
  }

  const sperre = pruefeSperre(
    { fehlversuche: konto.fehlversuche, letzterFehlversuchAm: konto.letzterFehlversuchAm },
    jetzt,
  );
  if (sperre.gesperrt && sperre.freiAb !== null) {
    await zugang.protokolliere({
      aktion: "anmeldung_fehlgeschlagen",
      moderatorId: konto.id,
      kennungVersuch: kennung,
      begruendung: "Konto gesperrt",
    });
    return { ok: false, meldung: sperrhinweis(sperre.freiAb) };
  }

  const passwortStimmt = await stimmtPasswort(daten.passwort, konto.passwortAbdruck);

  // Auch ein stillgelegtes Konto und eines ohne zweiten Faktor durchlaufen die
  // Kennwortprüfung - und scheitern danach mit demselben Text wie alle anderen.
  const codeErgebnis = !zweiterFaktorPflicht
    ? ({ ok: true, schritt: null } as const)
    : konto.totpGeheimnis === null
      ? ({ ok: false } as const)
      : pruefeCode(konto.totpGeheimnis, daten.code, jetzt, konto.totpLetzterSchritt);

  if (!passwortStimmt || !codeErgebnis.ok || !konto.aktiv) {
    await zugang.merkeFehlversuch(konto.id, jetzt);
    await zugang.protokolliere({
      aktion: "anmeldung_fehlgeschlagen",
      moderatorId: konto.id,
      kennungVersuch: kennung,
      begruendung: !konto.aktiv
        ? "Konto stillgelegt"
        : !passwortStimmt
          ? "Kennwort falsch"
          : konto.totpGeheimnis === null
            ? "Kein zweiter Faktor eingerichtet"
            : "Code falsch",
    });
    return { ok: false, meldung: ANMELDUNG_FEHLGESCHLAGEN };
  }

  const sitzung = erzeugeSitzung(jetzt, optionen.sitzungsstunden);
  await zugang.merkeAnmeldung(konto.id, codeErgebnis.schritt ?? null, jetzt);
  await zugang.legeSitzungAn(konto.id, sitzung.hash, sitzung.gueltigBis);
  await zugang.protokolliere({
    aktion: "anmeldung",
    moderatorId: konto.id,
    kennungVersuch: kennung,
    // Im Protokoll steht, ob der zweite Faktor an war. Sonst ließe sich später
    // nicht mehr feststellen, wie eine Anmeldung zustande kam.
    begruendung: zweiterFaktorPflicht ? "" : "ohne zweiten Faktor",
  });

  return { ok: true, moderator: konto, sitzung };
}

/**
 * Ein gültiger scrypt-Abdruck, zu dem kein Kennwort gehört.
 *
 * Er dient nur dazu, bei unbekannter Kennung dieselbe Rechenzeit zu verbrauchen
 * wie bei einer bekannten. Der Salzwert ist fest - er schützt nichts, weil es
 * nichts zu schützen gibt.
 */
const BLINDABDRUCK =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
