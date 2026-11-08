import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Deutsch ist die einzige aktive Sprache. Das Gerüst steht trotzdem, damit die
// für Phase 7 vorgesehene Mehrsprachigkeit ohne Umbau nachrüstbar bleibt
// (Entwicklungsplan, Abschnitt 3.2).
const mitIntl = createNextIntlPlugin("./src/i18n.ts");

/**
 * Schutzköpfe für jede Antwort.
 *
 * **Nachgesehen, nicht angenommen:** `curl -I https://schulindex.com/` lieferte
 * keinen einzigen davon. Sie stehen hier und nicht in der Caddy-Konfiguration,
 * weil sie dann mit der Anwendung ausgeliefert und mitversioniert werden - eine
 * Einstellung auf dem Server überlebt kein neues Aufsetzen und steht in keinem
 * Verlauf.
 */
const SCHUTZKOEPFE = [
  {
    /**
     * **Gegen Clickjacking, und das ist hier kein Lehrbuchrisiko.** Ohne diesen
     * Kopf lässt sich jede Seite in einen fremden Rahmen setzen. Gefährlich ist
     * das bei der Moderation: Dort liegt „Freigeben" hinter einem Klick, und
     * ein unsichtbarer Rahmen über einem harmlos aussehenden Knopf genügt, um
     * eine angemeldete Moderatorin diesen Klick machen zu lassen.
     *
     * `frame-ancestors` ist die heutige Fassung, `X-Frame-Options` die, die
     * ältere Browser verstehen. Beide, weil beide billig sind.
     */
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Verhindert, dass der Browser den Inhaltstyp errät. Betrifft hier vor
    // allem die Kartendateien: eine `.pmtiles`, die als HTML gedeutet wird,
    // wäre eine Seite auf unserer eigenen Herkunft.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    /**
     * Innerhalb des Portals bleibt die volle Adresse erhalten, nach draussen
     * geht nur die Herkunft. Die Middleware setzt auf Adressen mit einem
     * Geheimnis `no-referrer` und überschreibt diesen Wert dort
     * (`domain/geheimeadresse.ts`).
     */
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Kein Zugriff auf Kamera, Mikrofon oder Bezahlschnittstellen. Der
    // Standort bleibt erlaubt: „Schulen in meiner Nähe" fragt danach, und
    // gerechnet wird damit im Browser (`karte/kartenflaeche.tsx`).
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    /**
     * Ohne HSTS ist der **erste** Aufruf angreifbar: Wer `schulindex.com` in
     * die Leiste tippt, geht über http, und erst die Umleitung macht daraus
     * https - genau diese Umleitung lässt sich in einem fremden Netz abfangen.
     *
     * Ohne `includeSubDomains` und ohne `preload`: Beides gilt für die ganze
     * Domain und liesse sich nicht kurzfristig zurücknehmen, wenn eine
     * Unterdomain einmal ohne TLS ausgeliefert werden muss.
     */
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  },
];

const konfiguration: NextConfig = {
  typedRoutes: true,

  // Verrät sonst in jeder Antwort das Gerüst samt Hauptfassung.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:pfad*", headers: SCHUTZKOEPFE }];
  },

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
