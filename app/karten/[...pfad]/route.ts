import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { bereichAusKopf, kartenverzeichnis } from "@/kartendaten";
import type { ReadableOptions } from "node:stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liefert die Kartendaten aus - das Vektorkachel-Archiv und die Schriftbilder.
 *
 * **Warum aus dem eigenen Haus.** Eine Karte von Mapbox, MapTiler oder
 * openstreetmap.org lädt beim Betrachter Bilder von einem fremden Server und
 * schickt dabei dessen IP-Adresse dorthin. Für ein Portal, dessen Nutzerkreis
 * überwiegend minderjährig ist, ist das dieselbe Frage wie bei den
 * Google-Schriften, die aus genau diesem Grund geflogen sind (LG München I,
 * 3 O 17493/20). Und es hat einen zweiten, ganz praktischen Preis: Ein fremder
 * Kartendienst ist nichts, was nach § 25 Abs. 2 Nr. 2 TDDDG „erforderlich“
 * wäre - das Portal bräuchte ein Einwilligungsbanner, und zwar auf einer
 * Seite, deren Versprechen „anonym“ lautet.
 *
 * Der Ausweg sind Vektorkacheln: Ein Deutschlandauszug ist wenige Gigabyte
 * gross - Rasterkacheln wären mehrere hundert - und liegt als eine einzige
 * Datei auf der Platte. Der Browser holt daraus über `Range` genau die
 * Bereiche, die er für den sichtbaren Ausschnitt braucht.
 *
 * **`Range` ist deshalb kein Beiwerk, sondern die Betriebsart dieser Route.**
 * Ohne sie lüde jeder Kartenaufruf ein Archiv von mehreren Gigabyte.
 */

/** Nur diese beiden Arten - das Verzeichnis ist kein allgemeiner Dateiserver. */
const TYPEN: Record<string, string> = {
  ".pmtiles": "application/octet-stream",
  ".pbf": "application/x-protobuf",
  ".json": "application/json; charset=utf-8",
};

function endung(name: string): string | null {
  const punkt = name.lastIndexOf(".");
  return punkt === -1 ? null : name.slice(punkt).toLowerCase();
}

export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ pfad: string[] }> },
): Promise<Response> {
  const { pfad } = await params;

  // **Der Fehler, gegen den das steht.** Ein Pfad aus der Adresse, ungeprüft an
  // `join` gegeben, liest mit `../../../etc/passwd` jede Datei des Servers.
  // Deshalb wird nach dem Zusammensetzen geprüft, ob das Ergebnis noch im
  // Verzeichnis liegt - und nicht vorher, ob der Pfad verdächtig aussieht.
  const wurzel = kartenverzeichnis();
  const ziel = resolve(join(wurzel, ...pfad));
  if (ziel !== wurzel && !ziel.startsWith(wurzel + sep)) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const art = TYPEN[endung(basename(ziel)) ?? ""];
  if (art === undefined) return new Response("Nicht gefunden", { status: 404 });

  let groesse: number;
  try {
    const lage = await stat(ziel);
    if (!lage.isFile()) return new Response("Nicht gefunden", { status: 404 });
    groesse = lage.size;
  } catch {
    // Fehlende Kartendaten sind kein Serverfehler, sondern ein
    // Einrichtungszustand: Die Kartenseite erkennt das und zeigt ihre alte,
    // hintergrundlose Darstellung.
    return new Response("Kartendaten nicht eingerichtet", { status: 404 });
  }

  const kopf = new Headers({
    "content-type": art,
    // Die Daten ändern sich nur, wenn jemand ein neues Archiv einspielt - und
    // dann unter neuem Namen. Ein Jahr ist hier keine Übertreibung.
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    "x-robots-tag": "noindex",
  });

  const bereich = bereichAusKopf(anfrage.headers.get("range"), groesse);

  if (bereich.art === "ganz") {
    kopf.set("content-length", String(groesse));
    return new Response(strom(ziel), { status: 200, headers: kopf });
  }

  if (bereich.art === "ungueltig") {
    kopf.set("content-range", `bytes */${groesse}`);
    return new Response("Ungültiger Bereich", { status: 416, headers: kopf });
  }

  const { von, bis } = bereich;
  kopf.set("content-range", `bytes ${von}-${bis}/${groesse}`);
  kopf.set("content-length", String(bis - von + 1));
  return new Response(strom(ziel, { start: von, end: bis }), { status: 206, headers: kopf });
}

function strom(datei: string, bereich?: ReadableOptions & { start: number; end: number }): ReadableStream {
  const lesen = bereich === undefined ? createReadStream(datei) : createReadStream(datei, bereich);
  return new ReadableStream({
    start(steuerung) {
      lesen.on("data", (stueck) => steuerung.enqueue(stueck));
      lesen.on("end", () => steuerung.close());
      lesen.on("error", (f) => steuerung.error(f));
    },
    cancel() {
      lesen.destroy();
    },
  });
}
