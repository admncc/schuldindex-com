/**
 * Anmeldung an der Moderationsoberfläche: Kennwort, Sitzung, Sperre.
 *
 * Die Moderation ist die einzige Stelle im Portal, an der ein Mensch
 * Bewertungen freigeben, ablehnen und Kontaktdaten einsehen kann. Ein
 * übernommenes Moderationskonto wiegt daher schwerer als jedes andere Konto -
 * deshalb Kennwort **und** zweiter Faktor (`totp.ts`), und deshalb die drei
 * Maßnahmen hier: langsames Hashen, kurze Sitzungen, Sperre nach Fehlversuchen.
 */

import { createHmac, randomBytes, scrypt as scryptRueckruf, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptRueckruf) as (
  passwort: string | Buffer,
  salz: string | Buffer,
  laenge: number,
  optionen: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt-Parameter.
 *
 * N=2^15 braucht auf heutiger Serverhardware rund 100 ms und 32 MB. Das ist für
 * eine Anmeldung, die ein Mensch zweimal am Tag macht, nicht spürbar - für
 * jemanden, der eine gestohlene Kennworttabelle durchrechnet, dagegen sehr.
 */
const N = 32768;
const R = 8;
const P = 1;
const LAENGE = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Kürzer als das nimmt die Oberfläche nicht an. */
export const PASSWORT_MINDESTLAENGE = 12;

/**
 * Bewertet ein Kennwort - Länge vor Zeichenklassen.
 *
 * Erzwungene Sonderzeichen erzeugen bekanntlich `Passwort1!` und sonst nichts.
 * Die Länge ist das, was zählt; dazu eine kleine Sperrliste der Wörter, die im
 * deutschen Umfeld tatsächlich vorkommen.
 */
const NAHELIEGEND = [
  "passwort", "password", "schulindex", "moderation", "geheim", "qwertz", "123456", "admin",
];

export function pruefePasswort(klartext: string): readonly string[] {
  const maengel: string[] = [];
  if (klartext.length < PASSWORT_MINDESTLAENGE) {
    maengel.push(`Das Kennwort muss mindestens ${PASSWORT_MINDESTLAENGE} Zeichen lang sein.`);
  }
  const klein = klartext.toLowerCase();
  if (NAHELIEGEND.some((w) => klein.includes(w))) {
    maengel.push("Das Kennwort enthält ein zu naheliegendes Wort.");
  }
  if (/^(.)\1*$/.test(klartext)) {
    maengel.push("Das Kennwort besteht nur aus einem einzigen Zeichen.");
  }
  return maengel;
}

/** Ergibt `scrypt$N$r$p$salz$abdruck`, alles Base64. */
export async function hashePasswort(klartext: string): Promise<string> {
  const salz = randomBytes(16);
  const abdruck = await scrypt(klartext.normalize("NFKC"), salz, LAENGE, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salz.toString("base64"), abdruck.toString("base64")].join("$");
}

/**
 * Vergleicht ein Kennwort mit dem gespeicherten Abdruck.
 *
 * Die Parameter kommen aus dem gespeicherten Wert, nicht aus den Konstanten
 * oben - sonst wären alle bestehenden Kennwörter ungültig, sobald wir N erhöhen.
 */
export async function stimmtPasswort(klartext: string, gespeichert: string): Promise<boolean> {
  const teile = gespeichert.split("$");
  if (teile.length !== 6 || teile[0] !== "scrypt") return false;
  const [, n, r, p, salz, abdruck] = teile as [string, string, string, string, string, string];

  const erwartet = Buffer.from(abdruck, "base64");
  const berechnet = await scrypt(klartext.normalize("NFKC"), Buffer.from(salz, "base64"), erwartet.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return erwartet.length === berechnet.length && timingSafeEqual(erwartet, berechnet);
}

/**
 * Gültigkeitsdauer einer Sitzung.
 *
 * Zwölf Stunden: lang genug für einen Arbeitstag, kurz genug, dass ein
 * vergessener Rechner über Nacht abgemeldet wird.
 */
export const SITZUNG_STUNDEN = 12;

export interface Sitzungstoken {
  /** Geht in das Cookie und steht nie in der Datenbank. */
  readonly klartext: string;
  readonly hash: string;
  readonly gueltigBis: Date;
}

function sitzungsSchluessel(): Buffer {
  const wert = process.env["SITZUNG_HMAC_SCHLUESSEL"];
  if (!wert) throw new Error("SITZUNG_HMAC_SCHLUESSEL ist nicht gesetzt.");
  const roh = Buffer.from(wert, "base64");
  if (roh.length !== 32) throw new Error(`SITZUNG_HMAC_SCHLUESSEL muss 32 Byte lang sein, ist ${roh.length}.`);
  return roh;
}

export function hasheSitzung(klartext: string): string {
  return createHmac("sha256", sitzungsSchluessel()).update(klartext).digest("base64url");
}

export function erzeugeSitzung(jetzt = new Date()): Sitzungstoken {
  const klartext = randomBytes(32).toString("base64url");
  return {
    klartext,
    hash: hasheSitzung(klartext),
    gueltigBis: new Date(jetzt.getTime() + SITZUNG_STUNDEN * 3600_000),
  };
}

/** Name des Cookies. `__Host-` bindet es an genau diesen Ursprung ohne Subdomains. */
const COOKIE_BASIS = "schulindex_moderation";

/**
 * Name des Sitzungscookies - mit `__Host-`-Präfix, wo es zulässig ist.
 *
 * Das Präfix bindet das Cookie an genau diesen Ursprung: keine Subdomain kann
 * es setzen oder überschreiben. Der Preis ist eine harte Bedingung - ohne das
 * Attribut `Secure` ist ein `__Host-`-Cookie ungültig.
 *
 * Über http (Entwicklung) lässt sich `Secure` nicht setzen. Chromium nimmt das
 * Cookie über localhost zwar entgegen, schickt es aber nicht mehr bei jedem
 * Request mit: die Seiten waren angemeldet, die Server Actions nicht - und die
 * Oberfläche warf mitten in der Arbeit auf die Anmeldeseite zurück. Deshalb
 * trägt das Cookie das Präfix genau dann, wenn es auch `Secure` bekommt.
 */
export function sitzungscookie(sicher = process.env["NODE_ENV"] === "production"): string {
  return sicher ? `__Host-${COOKIE_BASIS}` : COOKIE_BASIS;
}

/**
 * Beide möglichen Namen, Präfixfassung zuerst.
 *
 * Gelesen wird nach dieser Liste, damit eine Umstellung von http auf https
 * nicht alle laufenden Sitzungen abwirft.
 */
export const SITZUNGSCOOKIE_NAMEN: readonly string[] = [`__Host-${COOKIE_BASIS}`, COOKIE_BASIS];

/** Nach so vielen Fehlversuchen ist Schluss. */
export const SPERRE_NACH = 5;

/** So lange. Danach beginnt die Zählung von vorn. */
export const SPERRDAUER_MINUTEN = 15;

export interface Sperrzustand {
  readonly fehlversuche: number;
  readonly letzterFehlversuchAm: Date | null;
}

export interface Sperre {
  readonly gesperrt: boolean;
  readonly freiAb: Date | null;
}

/**
 * Ist das Konto gerade gesperrt?
 *
 * Die Sperre läuft von selbst ab. Eine Sperre, die ein Mensch aufheben muss,
 * wäre bei fünf Moderatoren ein Ärgernis - und für jemanden, der Konten
 * lahmlegen will, ein Werkzeug.
 */
export function pruefeSperre(zustand: Sperrzustand, jetzt = new Date()): Sperre {
  if (zustand.fehlversuche < SPERRE_NACH || zustand.letzterFehlversuchAm === null) {
    return { gesperrt: false, freiAb: null };
  }
  const freiAb = new Date(zustand.letzterFehlversuchAm.getTime() + SPERRDAUER_MINUTEN * 60_000);
  return freiAb.getTime() > jetzt.getTime() ? { gesperrt: true, freiAb } : { gesperrt: false, freiAb: null };
}

/**
 * Was bei fehlgeschlagener Anmeldung angezeigt wird.
 *
 * Ein einziger Text für „Konto gibt es nicht“, „Kennwort falsch“ und „Code
 * falsch“. Alles andere verrät, welche Kennungen existieren und ob ein Kennwort
 * bereits stimmte - die zweite Auskunft ist die wertvollere.
 */
export const ANMELDUNG_FEHLGESCHLAGEN = "Kennung, Kennwort oder Code stimmen nicht.";

export function sperrhinweis(freiAb: Date): string {
  const uhrzeit = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(freiAb);
  return `Zu viele Fehlversuche. Nächster Versuch ab ${uhrzeit} Uhr.`;
}
