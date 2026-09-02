import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { basisadresse, darfIndexiert } from "./indexierung";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("allgemein");
  return {
    metadataBase: basisadresse(),
    title: { default: t("portalname"), template: `%s - ${t("portalname")}` },
    description: t("beschreibung"),
    // Zwei Riegel, weil sie verschiedene Fälle abdecken: `robots.txt` hält
    // Suchmaschinen vom Abholen ab, `noindex` hält sie vom Aufnehmen ab.
    // Wer die Adresse schon kennt oder die `robots.txt` ignoriert, wird nur
    // vom zweiten erwischt.
    ...(darfIndexiert() ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * Wurzellayout - nur die Hülle.
 *
 * Kopf- und Fußzeile stehen in der Gruppe `(oeffentlich)`. Die Moderation
 * bekommt sie nicht: eine interne Oberfläche mit „Schule finden“ und
 * „Über uns“ darüber führt in die Irre, und die Fußzeile mit Impressum und
 * Datenschutz gehört zum Portal, nicht zum Arbeitsplatz der Redaktion.
 */
export default async function Wurzellayout({ children }: { children: React.ReactNode }) {
  const nachrichten = await getMessages();

  return (
    // lang="de" ist keine Formalie: Screenreader wählen danach die Aussprache,
    // und Suchmaschinen die Sprachzuordnung.
    <html lang="de">
      <body>
        <NextIntlClientProvider messages={nachrichten}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
