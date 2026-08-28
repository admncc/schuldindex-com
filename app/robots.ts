import type { MetadataRoute } from "next";

/**
 * Die Moderation gehört nicht in einen Suchindex.
 *
 * Sie ist ohnehin durch die Anmeldung geschützt und trägt `noindex`; der
 * Eintrag hier verhindert, dass die Adresse überhaupt in Ergebnislisten
 * auftaucht - auch dann, wenn jemand von außen darauf verlinkt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/moderation", "/moderation/", "/bestaetigen"] },
  };
}
