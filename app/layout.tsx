import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("allgemein");
  return {
    title: { default: t("portalname"), template: `%s – ${t("portalname")}` },
    description: t("beschreibung"),
  };
}

export default async function Wurzellayout({ children }: { children: React.ReactNode }) {
  const nachrichten = await getMessages();
  const t = await getTranslations();

  return (
    // lang="de" ist keine Formalie: Screenreader wählen danach die Aussprache,
    // und Suchmaschinen die Sprachzuordnung.
    <html lang="de">
      <body>
        <NextIntlClientProvider messages={nachrichten}>
          <header className="kopf">
            <div className="huelle kopf-inhalt">
              <a className="marke" href="/">{t("allgemein.portalname")}</a>
              <nav>
                <a href="/schulen">{t("navigation.suche")}</a>
                <a href="/ranglisten">{t("navigation.ranglisten")}</a>
                <a href="/karte">{t("navigation.karte")}</a>
                <a href="/ueber">{t("navigation.ueber")}</a>
              </nav>
            </div>
          </header>

          <main className="huelle">{children}</main>

          <footer className="fuss">
            <div className="huelle">
              <ul>
                <li><a href="/impressum">{t("fusszeile.impressum")}</a></li>
                <li><a href="/datenschutz">{t("fusszeile.datenschutz")}</a></li>
                <li><a href="/nutzungsbedingungen">{t("fusszeile.nutzungsbedingungen")}</a></li>
                <li><a href="/inhalt-melden">{t("fusszeile.melden")}</a></li>
              </ul>
              <p>{t("allgemein.beschreibung")}</p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
