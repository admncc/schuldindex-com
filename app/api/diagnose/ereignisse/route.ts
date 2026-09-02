import { auskunft, einlass } from "../zugang";
import { leseEreignisse, raeumeAuf } from "@/db/ereignisse";
import { istEreignisart, PROTOKOLL_STUNDEN } from "@/domain/diagnose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Das Ereignisprotokoll.
 *
 *   curl -H "Authorization: Bearer sdx_…" \
 *        "https://schulindex.com/api/diagnose/ereignisse?art=fehler&grenze=50"
 *
 * Geblättert wird über `vor=<id>`: Die Ausgabe ist absteigend nach Kennung
 * sortiert, und die kleinste zurückgegebene Kennung ist der nächste Anker.
 * Kein Zeitstempel als Anker, weil zwei Ereignisse in derselben Millisekunde
 * entstehen können und ein Blättern über die Zeit sie dann verschluckt.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const tuer = await einlass(anfrage);
  if (!tuer.ok) return tuer.antwort;
  await raeumeAuf();

  const p = new URL(anfrage.url).searchParams;
  const art = p.get("art");
  const grenze = Number(p.get("grenze") ?? "100");

  const zeilen = await leseEreignisse({
    art: art !== null && istEreignisart(art) ? art : undefined,
    bereich: p.get("bereich") ?? undefined,
    suche: p.get("suche") ?? undefined,
    grenze: Number.isFinite(grenze) ? grenze : 100,
    vorId: /^\d+$/.test(p.get("vor") ?? "") ? (p.get("vor") ?? undefined) : undefined,
  });

  const letzte = zeilen.at(-1);

  return auskunft({
    zeitraumStunden: PROTOKOLL_STUNDEN,
    anzahl: zeilen.length,
    weiterVor: zeilen.length > 0 && letzte !== undefined ? letzte.id : null,
    ereignisse: zeilen,
  });
}
