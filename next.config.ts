import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Deutsch ist die einzige aktive Sprache. Das Gerüst steht trotzdem, damit die
// für Phase 7 vorgesehene Mehrsprachigkeit ohne Umbau nachrüstbar bleibt
// (Entwicklungsplan, Abschnitt 3.2).
const mitIntl = createNextIntlPlugin("./src/i18n.ts");

const konfiguration: NextConfig = {
  typedRoutes: true,
};

export default mitIntl(konfiguration);
