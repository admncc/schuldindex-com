/**
 * Erzeugung des Empfehlungscodes.
 *
 * Eigene Datei, weil sie `node:crypto` braucht: `domain/empfehlung.ts` wird
 * auch in der Middleware geladen, und die läuft in einer Umgebung ohne
 * Node-Module.
 */

import { randomBytes } from "node:crypto";
import { LAENGE, ZEICHEN } from "./empfehlung";

export function erzeugeEmpfehlungscode(): string {
  // `randomBytes` statt `Math.random`: Der Code ist die einzige Kennung, mit
  // der eine Empfehlung zugeordnet wird.
  const roh = randomBytes(LAENGE * 2);
  let code = "";
  for (let i = 0; code.length < LAENGE; i++) {
    const wert = roh[i % roh.length]!;
    // Der Rest der Division verzerrt minimal (256 mod 31 = 8); bei einem Code,
    // der nur eindeutig und nicht ratbar sein muss, ist das ohne Belang.
    code += ZEICHEN[wert % ZEICHEN.length];
  }
  return code;
}
