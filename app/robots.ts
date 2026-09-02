import type { MetadataRoute } from "next";
import { darfIndexiert } from "./indexierung";

/**
 * Crawler, die Inhalte für das Training oder die Anreicherung von KI-Modellen
 * einsammeln.
 *
 * Hier liegen Texte, die Schülerinnen und Schüler über ihre eigene Schule
 * geschrieben haben - unter der Zusage, dass sie anonym bleiben. Sie in
 * Modelle einzuspeisen ist etwas anderes als sie auffindbar zu machen, und die
 * zweite Zusage deckt die erste nicht ab. Ein `Disallow` ist zugleich die
 * maschinenlesbare Form des Nutzungsvorbehalts nach Art. 4 Abs. 3 der
 * Richtlinie (EU) 2019/790.
 *
 * Suchmaschinen stehen bewusst nicht auf dieser Liste: Gefunden zu werden ist
 * der Zweck des Portals.
 */
const KI_SAMMLER = [
  "AI2Bot",
  "Amazonbot",
  "anthropic-ai",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "cohere-ai",
  "Diffbot",
  "FacebookBot",
  "Google-Extended",
  "GPTBot",
  "ImagesiftBot",
  "meta-externalagent",
  "Omgilibot",
  "PerplexityBot",
  "Timpibot",
  "YouBot",
];

// Ohne diese Zeile backt Next die Datei in den Build ein - die Freigabe wäre
// dann keine Angabe in der `.env`, sondern eine im Build, und ein Umlegen auf
// dem Server bliebe wirkungslos, bis jemand neu baut.
export const dynamic = "force-dynamic";

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
export default function robots(): MetadataRoute.Robots {
  if (!darfIndexiert()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/moderation", "/moderation/", "/bestaetigen"] },
      { userAgent: KI_SAMMLER, disallow: "/" },
    ],
  };
}
