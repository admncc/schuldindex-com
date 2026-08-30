import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EMPFEHLUNGSCOOKIE } from "@/domain/empfehlung";
import { GERAETECOOKIE } from "@/domain/geraetekennung";
import { Kennungsspiegel } from "../(oeffentlich)/kennung";
import { Markenzeichen } from "../(oeffentlich)/marke";

export const metadata: Metadata = {
  // Landeplätze werden verlinkt, nicht gefunden: Sie tragen dieselben Inhalte
  // wie das Portal, nur zugespitzt. Im Index wären sie Doppelungen.
  robots: { index: false, follow: true },
};

/**
 * Rahmen der Landeplätze.
 *
 * Ohne Kopfnavigation: Ein Landeplatz hat genau einen Weg nach vorn, und jeder
 * zusätzliche Link führt davon weg. Die Marke bleibt - wer aus einer Story
 * kommt, muss sehen, wo er gelandet ist. Die Pflichtlinks stehen unten, weil
 * eine Seite, die über soziale Netze beworben wird, ohne Impressum nicht
 * ausgeliefert werden darf.
 */
export default async function Kampagnenlayout({ children }: { children: React.ReactNode }) {
  const speicher = await cookies();

  return (
    <main className="landeplatz">
      <Kennungsspiegel
        geraet={speicher.get(GERAETECOOKIE)?.value ?? null}
        refcode={speicher.get(`${EMPFEHLUNGSCOOKIE}_spiegel`)?.value ?? null}
      />

      <header className="lp-kopf">
        <a className="marke" href="/">
          <Markenzeichen />
          <span>SCHULINDEX</span>
        </a>
      </header>

      {children}

      <footer className="lp-fuss">
        <ul>
          <li><a href="/verlosung">Teilnahmebedingungen</a></li>
          <li><a href="/datenschutz">Datenschutz</a></li>
          <li><a href="/impressum">Impressum</a></li>
          <li><a href="/">Zum Portal</a></li>
        </ul>
      </footer>
    </main>
  );
}
