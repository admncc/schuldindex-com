import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Deutsch ist die einzige aktive Sprache. Das Gerüst steht trotzdem, damit die
// für Phase 7 vorgesehene Mehrsprachigkeit ohne Umbau nachrüstbar bleibt
// (Entwicklungsplan, Abschnitt 3.2).
const mitIntl = createNextIntlPlugin("./src/i18n.ts");

const konfiguration: NextConfig = {
  typedRoutes: true,

  /**
   * `instrumentation.ts` schreibt Serverfehler ins Ereignisprotokoll und
   * braucht dafür die Datenbank. Next übersetzt diese Datei aber auch für die
   * Edge-Laufzeit - dort läuft die Middleware -, und der Postgres-Treiber
   * greift auf `perf_hooks` und `stream` zu, die es dort nicht gibt. Der Build
   * scheiterte daran, obwohl der Zweig nie ausgeführt wird: Er steht hinter
   * `process.env.NEXT_RUNTIME !== "nodejs"`.
   *
   * `externals` löst genau das: nicht mitbündeln, erst zur Laufzeit auflösen.
   * Da der Zweig in der Edge-Laufzeit nie erreicht wird, kommt es dort nie zu
   * einer Auflösung.
   */
  webpack(konfiguration, { nextRuntime }) {
    if (nextRuntime === "edge") {
      konfiguration.externals = [...(konfiguration.externals ?? []), "postgres"];
    }
    return konfiguration;
  },
};

export default mitIntl(konfiguration);
