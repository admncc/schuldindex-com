import type { Metadata } from "next";
import { zaehleSchulen, zaehleVeroeffentlichte } from "@/db/schulen";
import { Landeplatz } from "../landeplatz";

export const metadata: Metadata = {
  title: "Bewerte deine Schule - und gewinn dabei",
  description:
    "Anonym und geprüft: Sag, wie deine Schule wirklich ist. Jeden Monat Gutscheine zu gewinnen.",
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
