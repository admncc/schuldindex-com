import type { Metadata } from "next";
import { zaehleSchulen, zaehleVeroeffentlichte } from "@/db/schulen";
import { Landeplatz } from "../landeplatz";

const TITEL = "Bewerte deine Schule - und gewinn dabei";
const BESCHREIBUNG =
  "Anonym und geprüft: Sag, wie deine Schule wirklich ist. Jeden Monat Gutscheine zu gewinnen.";

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

/** Der erste Landeplatz. Weitere bekommen eine eigene Adresse und denselben Aufbau. */
export default async function Landeplatz1() {
  const [schulen, bewertungen] = await Promise.all([zaehleSchulen(), zaehleVeroeffentlichte()]);

  return (
    <Landeplatz
      schlagzeile={
        <>
          Wie ist deine Schule <em>wirklich</em>?
        </>
      }
      unterzeile="Sag es anonym - in drei Minuten. Und sei jeden Monat bei der Verlosung dabei."
      schulen={schulen}
      bewertungen={bewertungen}
    />
  );
}
