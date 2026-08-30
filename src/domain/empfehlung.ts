/**
 * Empfehlungen: der eigene Link und was er auslöst.
 *
 * Nach der Bestätigung bekommt jede bewertende Person einen kurzen Link auf
 * das Portal. Kommt darüber jemand und gibt selbst eine Bewertung ab, die
 * freigegeben wird, ist die werbende Person im selben Monat für die
 * Super-Verlosung dabei.
 *
 * **Warum nicht mehr als das?** Kein Zähler, keine Rangliste, keine Belohnung
 * je geworbener Person. Ein Portal, das für jede weitere Empfehlung mehr
 * ausschüttet, bekommt am Ende die Bewertungen, die es dafür bezahlt hat -
 * und genau dagegen arbeitet der ganze Rest. Eine geworbene Person genügt für
 * die Teilnahme; die zweite bringt nichts obendrauf.
 *
 * **Der Code sagt nichts über die Person.** Er ist Zufall, kein Abdruck des
 * Kontakts: Aus einem Link darf sich nicht zurückrechnen lassen, wer ihn
 * verschickt hat.
 */

/**
 * Zeichenvorrat ohne Verwechslungspaare.
 *
 * Kein I/1/l, kein O/0: Der Link wird abgetippt, vorgelesen und in Stories
 * abfotografiert. Ein Code, den man nicht sicher abschreiben kann, ist ein
 * Code, der nicht ankommt.
 */
export const ZEICHEN = "abcdefghjkmnpqrstuvwxyz23456789";

/** 10 Zeichen aus 31 Möglichkeiten - rund 50 Bit, nicht zu raten. */
export const LAENGE = 10;

/** Sieht das nach einem Code aus? Vor jeder Abfrage, damit nichts durchläuft. */
export function istEmpfehlungscode(wert: unknown): wert is string {
  return typeof wert === "string" && new RegExp(`^[${ZEICHEN}]{${LAENGE}}$`).test(wert);
}

/**
 * Der Parameter, an dem ein Empfehlungslink erkannt wird.
 *
 * `?freund=…` an **jeder** Adresse, nicht nur an einer eigenen Seite: Ein Link
 * aus einer Story landet auf der Startseite, einer aus einer Nachricht
 * vielleicht direkt auf dem Schulprofil, und ein Landeplatz für eine Kampagne
 * hat seine eigene Adresse. Alle drei sollen zählen.
 */
export const EMPFEHLUNGSPARAMETER = "freund";

/**
 * Der Link, den die Person weitergibt.
 *
 * `ziel` ist die Seite, auf der jemand landen soll - die Startseite, ein
 * Landeplatz, ein Schulprofil. Der Code hängt als Parameter daran; die kurze
 * Form `/e/<code>` bleibt daneben bestehen, weil sie sich vorlesen lässt.
 */
export function empfehlungslink(basis: string, code: string, ziel = "/"): string {
  const url = new URL(ziel, basis.endsWith("/") ? basis : `${basis}/`);
  url.searchParams.set(EMPFEHLUNGSPARAMETER, code);
  return url.toString();
}

/** Die kurze Form zum Vorlesen und Abtippen. */
export function kurzerEmpfehlungslink(basis: string, code: string): string {
  return `${basis.replace(/\/$/, "")}/e/${code}`;
}

/**
 * Wie lange ein Klick auf den Link nachwirkt.
 *
 * 30 Tage: lang genug, dass jemand den Link im Bus öffnet und abends in Ruhe
 * bewertet; kurz genug, dass eine Empfehlung nicht ein halbes Jahr später noch
 * einem Monat zugerechnet wird, in dem niemand mehr daran denkt.
 */
export const EMPFEHLUNG_TAGE = 30;

export const EMPFEHLUNGSCOOKIE = "schulindex_empfehlung";

/** Der Text, den die Person zum Teilen bekommt. */
export function teilentext(schulname: string, link: string): string {
  return (
    `Ich habe gerade ${schulname} auf SCHULINDEX bewertet - anonym und geprüft. ` +
    `Mach mit, dann sind wir beide bei der Super-Verlosung dabei: ${link}`
  );
}
