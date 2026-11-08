"use client";

/**
 * „Cookie-Einstellungen" in der Fußzeile.
 *
 * Eine Einwilligung, die man nicht zurücknehmen kann, ist keine (Art. 7 Abs. 3
 * DSGVO: „so einfach wie die Erteilung"). Das Banner selbst zeigt sich nach der
 * Entscheidung nicht mehr - ohne diesen Link wäre der Widerruf nur noch über
 * das Löschen von Cookies im Browser möglich, und das ist kein Weg, den man
 * einem Dreizehnjährigen als „einfach" verkaufen kann.
 *
 * Der Aufruf geht über die Schnittstelle, die das Banner selbst mitbringt:
 * `__tcfapi('displayConsentUi')` ist der Weg, den die Anbieter nach dem
 * IAB-Rahmenwerk (TCF v2) anbieten - InMobi CMP gehört dazu. Vorhanden ist sie
 * erst, wenn das Banner geladen hat; deshalb der zweite Weg.
 *
 * **Und deshalb führt der Link nie ins Leere:** Lässt sich das Banner nicht
 * öffnen - Skript blockiert, Anbieter offline, Einstellung anders benannt -,
 * landet man auf dem Abschnitt der Datenschutzerklärung, der den Widerruf
 * beschreibt. Ein Knopf, der nichts tut, wäre schlimmer als kein Knopf: Er
 * sieht aus wie ein erfüllter Anspruch.
 */

interface Tcf {
  __tcfapi?: (befehl: string, fassung: number, rueckruf: (...a: unknown[]) => void) => void;
  __cmp?: (befehl: string, daten?: unknown, rueckruf?: (...a: unknown[]) => void) => void;
}

export function Cookieschalter() {
  return (
    <a
      href="/datenschutz#einwilligung"
      onClick={(e) => {
        const w = window as unknown as Tcf;
        try {
          if (typeof w.__tcfapi === "function") {
            w.__tcfapi("displayConsentUi", 2, () => {});
            e.preventDefault();
            return;
          }
          if (typeof w.__cmp === "function") {
            w.__cmp("displayConsentUi");
            e.preventDefault();
            return;
          }
        } catch {
          // Wirft der Anbieter, bleibt der Link ein Link.
        }
      }}
    >
      Cookie-Einstellungen
    </a>
  );
}
