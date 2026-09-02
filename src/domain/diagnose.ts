/**
 * Begriffe und Bereinigung für die Diagnose - **ohne Node-Bausteine.**
 *
 * Die Trennung von `diagnosetoken.ts` ist keine Ordnungsliebe: Diese Datei
 * hängt am Ereignisprotokoll und darüber an `instrumentation.ts`, und die
 * übersetzt Next auch für die Edge-Laufzeit, in der es `node:crypto` nicht
 * gibt. Ein `import` von dort liess den ganzen Build scheitern.
 */

/**
 * Wie lange das Ereignisprotokoll aufgehoben wird.
 *
 * 72 Stunden sind lang genug, um einem Fehler vom Wochenende am Montag noch
 * nachzugehen, und kurz genug, dass sich daraus kein Bewegungsbild ergibt.
 *
 * **Das ist die einzige automatische Löschung im Portal**, und der Unterschied
 * zur Regel „keine automatische Löschung“ ist wesentlich: Dort geht es um die
 * Angaben der Menschen - eine Bewertung verschwindet nur auf ausdrücklichen
 * Klick. Hier geht es um Betriebsspuren über sie, und für die ist eine kurze
 * Frist nicht Datenverlust, sondern Datenschutz.
 */
export const PROTOKOLL_STUNDEN = 72;

/** Zur Auswahl im Panel. Länger als drei Tage gibt es bewusst nicht. */
export const ZUGANG_STUNDEN = [1, 8, 24, 72] as const;
export type Zugangsdauer = (typeof ZUGANG_STUNDEN)[number];

export function istZugangsdauer(wert: number): wert is Zugangsdauer {
  return (ZUGANG_STUNDEN as readonly number[]).includes(wert);
}

export type Ereignisart = "fehler" | "warnung" | "info" | "zugriff";

export const EREIGNISARTEN: readonly Ereignisart[] = ["fehler", "warnung", "info", "zugriff"];

export function istEreignisart(wert: string): wert is Ereignisart {
  return (EREIGNISARTEN as readonly string[]).includes(wert);
}

/**
 * Das Kennwort für den Diagnosezugang.
 *
 * Der Vorsatz `sdx_` hat einen Zweck über die Wiedererkennung hinaus: Er macht
 * das Kennwort für `saeubere` erkennbar. Landet es versehentlich in einer
 * Fehlermeldung - etwa weil ein Client die ganze Adresse mitloggt -, wird es
 * beim Schreiben unkenntlich gemacht, statt im Protokoll zu stehen, das genau
 * dieses Kennwort öffnet.
 */
export const TOKEN_VORSATZ = "sdx_";

// Eine Adresse mit @ - großzügig gefasst, lieber ein Wort zu viel unkenntlich
// als eine Adresse zu wenig.
const EMAIL = /[^\s<>"']+@[^\s<>"']+\.[a-z]{2,}/gi;
// Sieben und mehr Ziffern am Stück, auch durch Leerzeichen, Schrägstrich,
// Bindestrich oder Klammern getrennt: eine Telefonnummer in jeder Schreibweise.
const TELEFON = /\+?\d[\d\s/()-]{5,}\d/g;
// Der eigene Diagnoseschlüssel - am Vorsatz erkennbar und immer verdächtig.
const EIGENER_SCHLUESSEL = new RegExp(`${TOKEN_VORSATZ}[A-Za-z0-9_-]+`, "g");

// Alles andere, was nach einem Kennwort aussieht: lange Zeichenketten aus dem
// Base64url-Vorrat. **Länge allein genügt nicht.** Die erste Fassung nahm jede
// Folge ab 32 Zeichen - und machte damit aus einer Meldung mit einem langen
// Bezeichner ein `<token>`, also aus einer lesbaren Zeile eine unlesbare. Ein
// zufälliges Kennwort enthält mit an Sicherheit grenzender Wahrscheinlichkeit
// Ziffern, Gross- und Kleinbuchstaben; ein Wort aus einer Meldung nicht.
const LANGES_WORT = /\b[A-Za-z0-9_-]{32,}\b/g;

function siehtNachSchluesselAus(wort: string): boolean {
  return /[a-z]/.test(wort) && /[A-Z]/.test(wort) && /\d/.test(wort);
}

/**
 * Schlüsselwörter, deren Inhalt nie ins Protokoll gehört - unabhängig davon,
 * wie er aussieht.
 *
 * Die Prüfung läuft über den Namen, nicht über den Wert: Ein Freitext aus einer
 * Bewertung ist an nichts zu erkennen, was ein Muster fassen könnte, und genau
 * er ist das Empfindlichste, was hier liegt.
 */
const VERBOTENE_SCHLUESSEL = [
  "kontakt",
  "email",
  "e-mail",
  "mail",
  "telefon",
  "nummer",
  "token",
  "passwort",
  "kennwort",
  "geheimnis",
  "schluessel",
  "chiffre",
  "hash",
  "freitext",
  "antworten",
  "begruendung",
  "ip",
  "cookie",
  "authorization",
];

function verboten(schluessel: string): boolean {
  const k = schluessel.toLowerCase();
  return VERBOTENE_SCHLUESSEL.some((v) => k === v || k.includes(v));
}

/**
 * Macht Kontakte, Nummern und Kennwörter in einem Text unkenntlich.
 *
 * **Der Fehler, gegen den das steht.** Ein Protokoll ist die bequemste Art,
 * eine Zusage zu brechen: Niemand beschließt, Kontaktdaten zu speichern - sie
 * stehen irgendwann in einer Fehlermeldung, weil eine Bibliothek den
 * Datensatz mitgibt, der den Fehler ausgelöst hat. Hier liegen die Angaben
 * Minderjähriger unter der Zusage der Anonymität; ein Protokoll, das sie
 * nebenbei mitschreibt, ist schlimmer als gar keines.
 */
export function saeubere(text: string): string {
  return text
    .replace(EMAIL, "<kontakt>")
    .replace(EIGENER_SCHLUESSEL, "<token>")
    .replace(LANGES_WORT, (w) => (siehtNachSchluesselAus(w) ? "<token>" : w))
    .replace(TELEFON, "<nummer>")
    .slice(0, 4000);
}

/**
 * Dasselbe für die Einzelheiten - über die Namen **und** über die Werte.
 *
 * Verschachtelung wird bis zu einer Tiefe von fünf verfolgt; darunter wird
 * abgeschnitten. Ein Fehlerobjekt kann sich selbst enthalten, und ein
 * Protokollschreiber, der daran hängen bleibt, nimmt den Server mit.
 */
export function saeubereWert(wert: unknown, tiefe = 0): unknown {
  if (tiefe > 5) return "<zu tief>";
  if (typeof wert === "string") return saeubere(wert);
  if (typeof wert === "number" || typeof wert === "boolean" || wert === null) return wert;
  if (wert === undefined) return null;
  if (Array.isArray(wert)) return wert.slice(0, 50).map((w) => saeubereWert(w, tiefe + 1));
  if (wert instanceof Date) return wert.toISOString();
  if (typeof wert === "object") {
    const raus: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(wert as Record<string, unknown>).slice(0, 50)) {
      raus[k] = verboten(k) ? "<entfernt>" : saeubereWert(v, tiefe + 1);
    }
    return raus;
  }
  return "<unbekannt>";
}
