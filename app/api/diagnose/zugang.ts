/**
 * Die Türsteherfunktion der Diagnoseschnittstelle.
 *
 * Steht getrennt, weil sie für jede Route dieselbe sein muss. Eine
 * Schnittstelle, deren Zugangsprüfung an drei Stellen leicht verschieden
 * abgeschrieben ist, hat früher oder später eine Stelle ohne.
 */

import { pruefeToken } from "@/db/diagnosezugang";
import { protokolliere } from "@/db/ereignisse";
import { zaehle } from "@/domain/drosselung";
import { absenderadresse } from "@/geo/mmdb";
import { headers } from "next/headers";

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
 * Höchstzahl der Versuche je Absender und Minute.
 *
 * Grosszügig für den Gebrauch von Hand - ein `curl` in der Schleife bleibt
 * darunter - und eng genug, dass ein Durchprobieren nicht lohnt.
 */
const VERSUCHE_JE_MINUTE = 30;

/**
 * Höchstzahl der protokollierten Fehlversuche über **alle** Absender.
 *
 * Der zweite Riegel, und der wichtigere. Die Drosselung oben zählt je
 * IP-Adresse; wer über viele Adressen verfügt, umgeht sie. Jeder Fehlversuch
 * schrieb bisher eine Zeile ins Ereignisprotokoll - das ist die Protokollierung,
 * die die Schnittstelle überhaupt erst verantwortbar macht, und zugleich ein
 * Weg, sie unbrauchbar zu machen: Wer sie vollschreibt, drückt die echten
 * Einträge aus dem 72-Stunden-Fenster. Ab dieser Zahl wird weiter abgewiesen,
 * aber nicht mehr einzeln protokolliert.
 */
const PROTOKOLLIERTE_FEHLVERSUCHE = 60;

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

  // **Vor der Kennwortprüfung**, nicht danach: Sonst kostet jeder Versuch
  // einen Schreibvorgang in der Datenbank, und das Durchprobieren wäre für
  // den Server teurer als für den, der es betreibt.
  const absender = absenderadresse(await headers());
  if (!zaehle("diagnose", absender, VERSUCHE_JE_MINUTE, 60_000).erlaubt) {
    return {
      ok: false,
      antwort: json({ fehler: "Zu viele Versuche. Bitte warte eine Minute." }, 429),
    };
  }

  if (token === "") {
    return {
      ok: false,
      antwort: json({ fehler: "Kennwort fehlt. Erwartet wird ein Kopf `Authorization: Bearer …`." }, 401),
    };
  }

  const zugang = await pruefeToken(token);
  if (zugang === null) {
    if (zaehle("diagnose-protokoll", "alle", PROTOKOLLIERTE_FEHLVERSUCHE, 600_000).erlaubt) {
      await protokolliere({
        art: "warnung",
        bereich: "diagnose",
        meldung: "Zugriff mit ungültigem oder abgelaufenem Kennwort abgewiesen",
        pfad,
        status: 403,
      });
    }
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
