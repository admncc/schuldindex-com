import type { MetadataRoute } from "next";
import { darfIndexiert } from "./indexierung";

/**
 * Die Moderation gehört nicht in einen Suchindex.
 *
 * Sie ist ohnehin durch die Anmeldung geschützt und trägt `noindex`; der
 * Eintrag hier verhindert, dass die Adresse überhaupt in Ergebnislisten
 * auftaucht - auch dann, wenn jemand von außen darauf verlinkt.
 *
 * Vor der Freigabe (`INDEXIERUNG=an`) bleibt das ganze Portal draußen. Die
 * Begründung steht in `indexierung.ts`.
 */
// Ohne diese Zeile backt Next die Datei in den Build ein - die Freigabe wäre
// dann keine Angabe in der `.env`, sondern eine im Build, und ein Umlegen auf
// dem Server bliebe wirkungslos, bis jemand neu baut.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!darfIndexiert()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/moderation", "/moderation/", "/bestaetigen"] },
  };
}
