import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KONTOCOOKIE_NAMEN } from "@/domain/kontozugang";
import { holeKontositzung, type AngemeldetesKonto } from "@/db/konto";

/** Wie in der Moderation: die Prüfung braucht die Datenbank, nicht nur das Cookie. */
export async function holeAngemeldetesKonto(): Promise<AngemeldetesKonto | null> {
  const laden = await cookies();
  const wert = KONTOCOOKIE_NAMEN.map((n) => laden.get(n)?.value).find((v) => v !== undefined);
  if (!wert) return null;
  return holeKontositzung(wert);
}

export async function verlangeKonto(): Promise<AngemeldetesKonto> {
  const konto = await holeAngemeldetesKonto();
  if (konto === null) redirect("/konto/anmelden");
  return konto;
}
