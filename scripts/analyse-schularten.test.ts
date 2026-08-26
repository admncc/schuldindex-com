/**
 * Misst die Schulart-Normalisierung am echten Datenbestand.
 *
 *   npx vitest run scripts/analyse-schularten.test.ts
 *
 * Erwartet den Rohbestand als JSON unter SCHULEN_JSON. Ohne die Datei wird
 * übersprungen — der Bestand liegt bewusst nicht im Repository (rund 12 MB).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHULART_LABEL, ordneSchulartZu, type Schulart } from "../src/import/schulart.js";

const PFAD = process.env.SCHULEN_JSON ?? "";
const vorhanden = PFAD !== "" && existsSync(PFAD);

interface Rohschule {
  id: string;
  name: string;
  school_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  zip?: string | null;
  city?: string | null;
}

// Erst im Test lesen, nicht beim Einsammeln: `describe.skipIf` überspringt die
// Ausführung, der Rumpf des describe-Blocks läuft trotzdem.
const ladeSchulen = (): Rohschule[] => JSON.parse(readFileSync(PFAD, "utf8"));

describe.skipIf(!vorhanden)("Normalisierung am echten Bestand", () => {

  it("ordnet den ganz überwiegenden Teil einer Schulart zu", () => {
    const schulen = ladeSchulen();
    const zaehler = { schulart: 0, name: 0, unbekannt: 0, keineSchule: 0 };
    const proArt = new Map<Schulart, number>();
    const ohneGeo: string[] = [];

    for (const s of schulen) {
      const z = ordneSchulartZu(s.school_type, s.name);
      if (!z.istSchule) {
        zaehler.keineSchule++;
        continue;
      }
      zaehler[z.quelle]++;
      for (const art of z.arten) proArt.set(art, (proArt.get(art) ?? 0) + 1);
      if (s.latitude == null || s.longitude == null) ohneGeo.push(s.id);
    }

    const schulenGesamt = schulen.length - zaehler.keineSchule;
    const zugeordnet = zaehler.schulart + zaehler.name;
    const quote = (zugeordnet / schulenGesamt) * 100;

    console.log(`\n  Datensätze gesamt        ${schulen.length}`);
    console.log(`  davon keine Schule       ${zaehler.keineSchule}  (Schulamt, Seminar, Hochschule)`);
    console.log(`  Schulen                  ${schulenGesamt}`);
    console.log(`    aus der Schulart       ${zaehler.schulart}`);
    console.log(`    aus dem Namen          ${zaehler.name}`);
    console.log(`    nicht zuzuordnen       ${zaehler.unbekannt}`);
    console.log(`  Zuordnungsquote          ${quote.toFixed(2)} %`);
    console.log(`  ohne Koordinaten         ${ohneGeo.length}  (${((ohneGeo.length / schulenGesamt) * 100).toFixed(1)} %)`);
    console.log("\n  Verteilung:");
    for (const [art, n] of [...proArt].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${SCHULART_LABEL[art].padEnd(24)} ${String(n).padStart(6)}`);
    }

    // 96 % ist keine willkürliche Marke, sondern das, was die Quelle hergibt.
    // Die restlichen rund 1.170 Schulen tragen die Schulart weder im Feld noch
    // im Namen — sie heißen schlicht „Kahlhorst-Schule“ oder
    // „Wolfgang-Ratke-Schule“. Das lässt sich nur mit einer zweiten Quelle
    // lösen, überwiegend für Schleswig-Holstein und Baden-Württemberg.
    expect(quote).toBeGreaterThan(96);

    // Beidseitige Schranke gegen zu weit gefasste Ausschlussregeln. Eine Regel
    // auf „Beratungszentrum“ hatte hier einmal 685 reale Förderschulen
    // verworfen, weil Baden-Württemberg sie „Sonderpädagogisches Bildungs- und
    // Beratungszentrum“ nennt. Genau das soll hier auffallen.
    expect(zaehler.keineSchule).toBeGreaterThan(500);
    expect(zaehler.keineSchule).toBeLessThan(900);
  });

  it("lässt keine Schule ohne Art zurück", () => {
    for (const s of ladeSchulen()) {
      const z = ordneSchulartZu(s.school_type, s.name);
      if (z.istSchule) expect(z.arten.length).toBeGreaterThan(0);
    }
  });
});
