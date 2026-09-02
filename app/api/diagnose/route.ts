import { auskunft, einlass } from "./zugang";
import { systemzustand } from "@/db/zustand";
import { ereigniszahlen, raeumeAuf } from "@/db/ereignisse";
import { PROTOKOLL_STUNDEN } from "@/domain/diagnose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Der Zustand des Systems.
 *
 *   curl -H "Authorization: Bearer sdx_…" https://schulindex.com/api/diagnose
 *
 * Was hier steht, ist bewusst begrenzt: Summen, Zustände, Vorhandensein. Keine
 * Kontakte, keine Freitexte, keine einzelne Bewertung. Eine
 * Diagnoseschnittstelle ist ein zweiter Weg in ein System - sie darf nichts
 * zeigen, was auf dem ersten Weg hinter einer Anmeldung und einem
 * Protokolleintrag liegt.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const tuer = await einlass(anfrage);
  if (!tuer.ok) return tuer.antwort;

  // Beim Lesen mitgeräumt: Es gibt keinen Zeitplan im Portal, und eine Frist,
  // die von einem Zeitplan abhängt, den niemand eingerichtet hat, ist keine.
  await raeumeAuf();

  return auskunft({
    system: await systemzustand(),
    protokollUebersicht: await ereigniszahlen(),
    wege: {
      "/api/diagnose": "Zustand des Systems (diese Auskunft)",
      "/api/diagnose/ereignisse":
        `Ereignisprotokoll der letzten ${PROTOKOLL_STUNDEN} Stunden. ` +
        "Parameter: art=fehler|warnung|info|zugriff, bereich=…, suche=…, grenze=1-500, vor=<id>",
    },
    hinweis:
      "Diese Schnittstelle ist ausschliesslich lesend. Sie fuehrt keine Befehle aus, " +
      "gibt keine Kontaktdaten heraus und zeigt keine Freitexte aus Bewertungen.",
  });
}
