/**
 * Anmeldung am eigenen Konto - der Ablauf, ohne Datenbank.
 *
 * Der Kern ist eine einzige Eigenschaft, und sie ist leicht zu verlieren: **die
 * Antwort muss gleich aussehen, ob es das Konto gibt oder nicht.** Sonst wird
 * aus dem Anmeldeformular ein Auskunftsdienst darüber, welche Handynummer schon
 * einmal eine Schule bewertet hat. Deshalb liegt der Ablauf hier und nicht in
 * der Seite: so lässt er sich genau darauf prüfen.
 */

import {
  erzeugeAnmeldelink,
  LINKS_JE_STUNDE,
  LINK_ANGEFORDERT,
  type Zugangstoken,
} from "../domain/kontozugang";
import { kontaktHash, normalisiereKontakt, type Kontaktart } from "../domain/kontakt";

export interface Kontoumgebung {
  /** `null`, wenn es zu diesem Hash kein Konto gibt. */
  findeKonto(kontaktHash: string): Promise<{ id: string; verifiziertAm: Date | null } | null>;
  /** Wie viele Anmeldelinks dieses Konto in der letzten Stunde angefordert hat. */
  zaehleLinks(kontoId: string): Promise<number>;
  speichereAnmeldelink(kontoId: string, token: Zugangstoken): Promise<void>;
  sendeAnmeldelink(kontoId: string, klartext: string): Promise<boolean>;
  /**
   * Dasselbe für ein noch unbestätigtes Konto - Bestätigungslink statt
   * Anmeldelink. Siehe die Begründung in `fordereAnmeldelinkAn`.
   */
  speichereBestaetigungslink(kontoId: string, token: Zugangstoken): Promise<void>;
  sendeBestaetigungslink(kontoId: string, klartext: string): Promise<boolean>;
}

export interface Anforderung {
  readonly kontakt: string;
  readonly art: Kontaktart;
}

export interface Anforderungsergebnis {
  /** Immer derselbe Text - siehe oben. */
  readonly meldung: string;
  /**
   * Nur für Protokoll und Tests. Gehört **nicht** in die Antwort an den
   * Browser: „gab es das Konto?" ist genau die Auskunft, die hier nicht
   * herausdringen darf.
   */
  readonly intern:
    | "verschickt"
    | "bestaetigung_verschickt"
    | "kein_konto"
    | "begrenzt"
    | "versand_fehlgeschlagen";
}

export async function fordereAnmeldelinkAn(
  u: Kontoumgebung,
  a: Anforderung,
): Promise<Anforderungsergebnis> {
  const normal = normalisiereKontakt(a.kontakt, a.art);
  if (normal === "" || normal === "+") return { meldung: LINK_ANGEFORDERT, intern: "kein_konto" };

  const konto = await u.findeKonto(kontaktHash(a.kontakt, a.art));
  if (konto === null) return { meldung: LINK_ANGEFORDERT, intern: "kein_konto" };

  // Dieselbe Meldung wie in allen anderen Fällen: Ein eigener Text für die
  // erreichte Grenze verriete, dass es das Konto gibt (siehe `LINKS_JE_STUNDE`
  // in `domain/kontozugang.ts`).
  if ((await u.zaehleLinks(konto.id)) >= LINKS_JE_STUNDE) {
    return { meldung: LINK_ANGEFORDERT, intern: "begrenzt" };
  }

  const token = erzeugeAnmeldelink();

  /**
   * Ein unbestätigtes Konto bekommt einen **Bestätigungslink**, keinen
   * Anmeldelink.
   *
   * Vorher endete es hier: kein Anmeldelink, weil die Anmeldung sonst die
   * Bestätigung überspränge - das stimmt weiterhin. Nur war damit gar kein
   * Weg mehr da. Wer bewertet hatte und die Nachricht nie bekam (verlorene
   * SMS, Tippfehler in der Nummer, abgelaufene 24 Stunden), stand vor einer
   * geschlossenen Tür: nicht anmelden, nicht erneut bewerten - die Sperre
   * gegen Mehrfachabgaben greift -, und nichts nachfordern. Die Bewertung lag
   * unbestätigt und für Menschen unsichtbar in der Datenbank, für immer.
   *
   * Der Bestätigungslink ist keine Hintertür: Er tut genau das, wofür er
   * gedacht ist, und wer ihn anfordert, muss den Kontakt kennen - dieselbe
   * Bedingung wie beim ersten Mal. Die Antwort nach aussen bleibt dieselbe.
   */
  if (konto.verifiziertAm === null) {
    await u.speichereBestaetigungslink(konto.id, token);
    const zugestellt = await u.sendeBestaetigungslink(konto.id, token.klartext);
    return {
      meldung: LINK_ANGEFORDERT,
      intern: zugestellt ? "bestaetigung_verschickt" : "versand_fehlgeschlagen",
    };
  }

  await u.speichereAnmeldelink(konto.id, token);
  const versandt = await u.sendeAnmeldelink(konto.id, token.klartext);

  return {
    meldung: LINK_ANGEFORDERT,
    intern: versandt ? "verschickt" : "versand_fehlgeschlagen",
  };
}
