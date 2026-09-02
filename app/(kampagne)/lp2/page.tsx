import type { Metadata } from "next";
import { zaehleSchulen, zaehleVeroeffentlichte } from "@/db/schulen";
import { GEWINNE, PARTNER } from "@/domain/verlosungsgewinne";
import { Preislandeplatz } from "../preislandeplatz";

const ZAHL = new Intl.NumberFormat("de-DE");

const TITEL = `Bis zu ${ZAHL.format(GEWINNE.mega.wertEuro)} € gewinnen - bewerte deine Schule`;
const BESCHREIBUNG =
  `Jeden Monat Gutscheine von ${PARTNER}: ${GEWINNE.normal.anzahl} × ` +
  `${ZAHL.format(GEWINNE.normal.wertEuro)} €, ${GEWINNE.super.anzahl} × ` +
  `${ZAHL.format(GEWINNE.super.wertEuro)} € und einer über ` +
  `${ZAHL.format(GEWINNE.mega.wertEuro)} €. Anonym bewerten, drei Minuten.`;

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHREIBUNG,
  // Ohne diese Angaben erscheint der Link in Stories und Nachrichten als
  // nackte Adresse - bei einer Seite, die genau dort beworben wird, ist das
  // die Hälfte der Wirkung.
  openGraph: {
    title: TITEL,
    description: BESCHREIBUNG,
    type: "website",
    locale: "de_DE",
    siteName: "SCHULINDEX",
  },
  twitter: { card: "summary_large_image", title: TITEL, description: BESCHREIBUNG },
};
export const dynamic = "force-dynamic";

/**
 * Der zweite Landeplatz: derselbe Weg, andere Reihenfolge.
 *
 * `/lp1` beginnt mit der Frage, `/lp2` mit dem Gewinn. Welcher besser trägt,
 * entscheidet sich nicht am Schreibtisch - deshalb stehen beide, mit derselben
 * Suche und denselben Zahlen aus der Datenbank.
 *
 * Im Titel steht „bis zu", weil eine Zeile in einer Trefferliste keinen Platz
 * für drei Betraege hat. Auf der Seite selbst stehen alle drei mit ihren
 * Bedingungen - dort, wo die Entscheidung faellt.
 */
export default async function Landeplatz2() {
  const [schulen, bewertungen] = await Promise.all([zaehleSchulen(), zaehleVeroeffentlichte()]);

  return <Preislandeplatz schulen={schulen} bewertungen={bewertungen} />;
}
