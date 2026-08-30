import { getTranslations } from "next-intl/server";
import { Markenzeichen } from "./marke";

/** Kopf- und Fußzeile des öffentlichen Portals. */
export default async function OeffentlichesLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  return (
    <>
      <header className="kopf">
        <div className="huelle kopf-inhalt">
          <a className="marke" href="/">
            <Markenzeichen />
            <span>{t("allgemein.portalname")}</span>
          </a>
          <nav>
            <a href="/schulen">{t("navigation.suche")}</a>
            <a href="/ranglisten">{t("navigation.ranglisten")}</a>
            <a href="/karte">{t("navigation.karte")}</a>
            <a href="/ueber">{t("navigation.ueber")}</a>
            <a href="/konto">{t("navigation.konto")}</a>
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
            <li><a href="/verlosung">{t("fusszeile.verlosung")}</a></li>
            <li><a href="/schulsupport">{t("fusszeile.schulen")}</a></li>
          </ul>
          <p className="fussmarke">
            <Markenzeichen groesse={18} />
            {t("allgemein.beschreibung")}
          </p>
        </div>
      </footer>
    </>
  );
}
