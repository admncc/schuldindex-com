import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { holeSchulsitzung, type AngemeldeteSchule } from "@/db/schulzugang";

/**
 * Eigener Cookiename, eigene Sitzungstabelle.
 *
 * Ein gemeinsames Cookie mit dem Kontobereich wäre bequemer und falsch: hier
 * sieht jemand die Werte einer Schule, dort die eigenen Bewertungen. Zwei
 * Zugänge, die nichts miteinander zu tun haben, teilen sich kein Geheimnis.
 */
const BASIS = "schulindex_schule";
export const SCHULCOOKIE_NAMEN: readonly string[] = [`__Host-${BASIS}`, BASIS];

export function schulcookie(sicher = process.env["NODE_ENV"] === "production"): string {
  return sicher ? `__Host-${BASIS}` : BASIS;
}

export async function holeAngemeldeteSchule(): Promise<AngemeldeteSchule | null> {
  const laden = await cookies();
  const wert = SCHULCOOKIE_NAMEN.map((n) => laden.get(n)?.value).find((v) => v !== undefined);
  if (!wert) return null;
  return holeSchulsitzung(wert);
}

export async function verlangeSchule(): Promise<AngemeldeteSchule> {
  const schule = await holeAngemeldeteSchule();
  if (schule === null) redirect("/schulsupport/anfordern");
  return schule;
}
