/**
 * Anbindung an die Claude API.
 *
 * Die einzige Datei im Projekt, die das Anthropic-SDK kennt. Alles, was
 * entschieden wird — was gefragt wird, was mit der Antwort geschieht — steht in
 * `vorlage.ts`, `pruefung.ts` und `zusammenfassung.ts` und ist ohne Netz
 * geprüft.
 *
 * Structured Outputs statt Freitext: die Antwort kommt gegen ein Schema
 * validiert zurück. Damit entfällt der ganze Zweig, in dem man Modellausgaben
 * mit regulären Ausdrücken zerlegt und sich fragt, ob das Feld nun fehlt oder
 * nur anders heißt.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Modell } from "./zusammenfassung";

/** Vorgabe aus Abschnitt 10.2 des Entwicklungsplans. */
export const MODELL = "claude-opus-5";

const Zusammenfassung = z.object({
  /** Zwei bis vier Sätze auf Deutsch. Die Länge prüft `pruefung.ts` nach. */
  text: z.string(),
  positive_themen: z.array(z.string()),
  kritische_themen: z.array(z.string()),
  /**
   * Selbstauskunft. Sie ersetzt die Nachprüfung nicht — aber wenn das Modell
   * selbst einen Personenbezug meldet, ist die Sache erledigt.
   */
  enthaelt_personenbezug: z.boolean(),
  ausreichend_datenbasis: z.boolean(),
});

export interface Optionen {
  readonly apiSchluessel?: string | undefined;
  readonly modell?: string | undefined;
  /**
   * Verarbeitungsregion. Muss in der Datenschutzerklärung ausgewiesen werden
   * und gehört in den Auftragsverarbeitungsvertrag (Abschnitt 10.2).
   */
  readonly region?: string | undefined;
}

export function claudeModell(optionen: Optionen = {}): Modell {
  const schluessel = optionen.apiSchluessel ?? process.env["ANTHROPIC_API_KEY"];
  if (!schluessel) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");

  const client = new Anthropic({ apiKey: schluessel });
  const bezeichnung = optionen.modell ?? MODELL;

  return {
    bezeichnung,

    async fasseZusammen(systemanweisung, block) {
      const antwort = await client.messages.parse({
        model: bezeichnung,
        max_tokens: 4000,
        // Wenig Streuung: zwei Läufe über dieselben Texte sollen nicht zwei
        // verschieden gefärbte Aussagen über dieselbe Schule ergeben.
        temperature: 0.2,
        system: systemanweisung,
        messages: [{ role: "user", content: block }],
        output_config: { format: zodOutputFormat(Zusammenfassung) },
        ...(optionen.region === undefined ? {} : { inference_geo: optionen.region }),
      });

      // `parsed_output` ist null, wenn die Validierung fehlschlägt. Diese Prüfung
      // ist nicht optional — ohne sie stünde später `undefined` im Schulprofil.
      return antwort.parsed_output ?? null;
    },
  };
}
