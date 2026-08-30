/**
 * Der Abdruck der Gerätekennung.
 *
 * Eigene Datei, weil sie `node:crypto` braucht: `domain/geraetekennung.ts`
 * wird auch im Browser geladen (der Spiegel in den Local Storage), und ein
 * Modul mit Node-Abhängigkeit lässt sich dort nicht bündeln.
 */

import { createHmac } from "node:crypto";
import { schluessel } from "./kontakt";

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
  // Über dieselbe Prüfung wie alle anderen Abdrücke: `Buffer.from(…,
  // "base64")` verschluckt ungültige Zeichen stillschweigend, ein vertippter
  // Schlüssel ergäbe hier einen kurzen oder leeren - während der Rest des
  // Systems gar nicht erst startet.
  return createHmac("sha256", schluessel("KONTAKT_HMAC_SCHLUESSEL", 32))
    .update(`geraet:${kennung}`)
    .digest("base64url");
}
