/**
 * Die Türsteherfunktion der Diagnoseschnittstelle.
 *
 * Steht getrennt, weil sie für jede Route dieselbe sein muss. Eine
 * Schnittstelle, deren Zugangsprüfung an drei Stellen leicht verschieden
 * abgeschrieben ist, hat früher oder später eine Stelle ohne.
 */

import { pruefeToken } from "@/db/diagnosezugang";
import { protokolliere } from "@/db/ereignisse";

export type Einlass = { readonly ok: true; readonly zugangId: string } | { readonly ok: false; readonly antwort: Response };

function json(inhalt: unknown, status: number): Response {
  return new Response(JSON.stringify(inhalt, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Eine Diagnoseauskunft gehört in keinen Zwischenspeicher - weder in
      // Cloudflares noch in den des Browsers.
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export function auskunft(inhalt: unknown): Response {
  return json(inhalt, 200);
}

/**
 * Prüft das Kennwort und protokolliert den Zugriff.
 *
 * **Jeder Zugriff wird protokolliert, auch der fehlgeschlagene.** Das ist der
 * eigentliche Gegenwert der Schnittstelle gegenüber einem Serverzugang: Wer
 * sie benutzt hat und wann, steht hinterher da - und wer sie zu benutzen
 * versucht hat, ebenso.
 */
export async function einlass(anfrage: Request): Promise<Einlass> {
  const kopf = anfrage.headers.get("authorization") ?? "";
  const token = kopf.toLowerCase().startsWith("bearer ") ? kopf.slice(7).trim() : "";
  const pfad = new URL(anfrage.url).pathname;

  if (token === "") {
    return {
      ok: false,
      antwort: json({ fehler: "Kennwort fehlt. Erwartet wird ein Kopf `Authorization: Bearer …`." }, 401),
    };
  }

  const zugang = await pruefeToken(token);
  if (zugang === null) {
    await protokolliere({
      art: "warnung",
      bereich: "diagnose",
      meldung: "Zugriff mit ungültigem oder abgelaufenem Kennwort abgewiesen",
      pfad,
      status: 403,
    });
    return { ok: false, antwort: json({ fehler: "Kennwort ungültig, abgelaufen oder beendet." }, 403) };
  }

  await protokolliere({
    art: "zugriff",
    bereich: "diagnose",
    meldung: `Diagnoseabruf ${pfad}`,
    pfad,
    status: 200,
  });

  return { ok: true, zugangId: zugang.id };
}
