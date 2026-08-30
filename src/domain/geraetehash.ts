/**
 * Der Abdruck der Gerätekennung.
 *
 * Eigene Datei, weil sie `node:crypto` braucht: `domain/geraetekennung.ts`
 * wird auch im Browser geladen (der Spiegel in den Local Storage), und ein
 * Modul mit Node-Abhängigkeit lässt sich dort nicht bündeln.
 */

import { createHmac } from "node:crypto";

/**
 * Der Abdruck, der gespeichert wird.
 *
 * Nicht die Kennung selbst: Für die einzige Frage, die sie beantworten soll -
 * „kommen mehrere Bewertungen aus demselben Browser?“ -, genügt der Vergleich
 * zweier Abdrücke. Der eigene Zweck im HMAC trennt sie von den Kontakt- und
 * Tokenabdrücken; derselbe Wert ergibt so an verschiedenen Stellen des Systems
 * verschiedene Abdrücke.
 */
export function geraetehash(kennung: string): string {
  const roh = process.env["KONTAKT_HMAC_SCHLUESSEL"];
  if (!roh) throw new Error("KONTAKT_HMAC_SCHLUESSEL ist nicht gesetzt.");
  return createHmac("sha256", Buffer.from(roh, "base64"))
    .update(`geraet:${kennung}`)
    .digest("base64url");
}
