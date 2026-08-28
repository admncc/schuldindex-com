/**
 * Misst die Schulart-Normalisierung am echten Datenbestand.
 *
 *   npx vitest run scripts/analyse-schularten.test.ts
 *
 * Erwartet den Rohbestand als JSON unter SCHULEN_JSON. Ohne die Datei wird
 * übersprungen - der Bestand liegt bewusst nicht im Repository (rund 12 MB).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHULART_LABEL, ordneSchulartZu, type Schulart } from "../src/import/schulart";
import { bundeslandAusId, BUNDESLAND_LABEL } from "../src/domain/bundesland";
import { baueAnfragen } from "../src/import/geokodierung";
import { vergebeSlugs } from "../src/import/slug";

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
  address?: string | null;
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
    // im Namen - sie heißen schlicht „Kahlhorst-Schule“ oder
    // „Wolfgang-Ratke-Schule“. Das lässt sich nur mit einer zweiten Quelle
    // lösen, überwiegend für Schleswig-Holstein und Baden-Württemberg.
    expect(quote).toBeGreaterThan(96);

    // Beidseitige Schranke gegen zu weit gefasste Ausschlussregeln. Eine Regel
    // auf „Beratungszentrum“ hatte hier einmal 685 reale Förderschulen
    // verworfen, weil Baden-Württemberg sie „Sonderpädagogisches Bildungs- und
    // Beratungszentrum“ nennt. Genau das soll hier auffallen.
    expect(zaehler.keineSchule).toBeGreaterThan(400);
    expect(zaehler.keineSchule).toBeLessThan(900);
  });

  it("lässt keine Schule ohne Art zurück", () => {
    for (const s of ladeSchulen()) {
      const z = ordneSchulartZu(s.school_type, s.name);
      if (z.istSchule) expect(z.arten.length).toBeGreaterThan(0);
    }
  });

  it("kann für fast alle Schulen ohne Koordinaten eine Anfrage bilden", () => {
    const stufen = { adresse: 0, plz: 0, ort: 0, keine: 0 };
    const proLand = new Map<string, number>();

    for (const s of ladeSchulen()) {
      const z = ordneSchulartZu(s.school_type, s.name);
      if (!z.istSchule) continue;
      if (s.latitude != null && s.longitude != null) continue;

      const bundesland = bundeslandAusId(s.id);
      if (bundesland === null) continue;
      proLand.set(bundesland, (proLand.get(bundesland) ?? 0) + 1);

      const beste = baueAnfragen({
        name: s.name,
        strasse: s.address ?? null,
        plz: s.zip ?? null,
        ort: s.city ?? null,
        bundesland,
      })[0];
      stufen[beste?.genauigkeit ?? "keine"]++;
    }

    const gesamt = stufen.adresse + stufen.plz + stufen.ort + stufen.keine;
    console.log(`\n  Schulen ohne Koordinaten   ${gesamt}`);
    console.log(`    Adresse vorhanden        ${stufen.adresse}  → Karte und Geo-Prüfung`);
    console.log(`    nur PLZ                  ${stufen.plz}  → Geo-Prüfung ausreichend`);
    console.log(`    nur Ort                  ${stufen.ort}  → grob, aber verwendbar`);
    console.log(`    keine Angabe             ${stufen.keine}  → nicht geokodierbar`);
    console.log("\n  je Bundesland:");
    for (const [bl, n] of [...proLand].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${BUNDESLAND_LABEL[bl as keyof typeof BUNDESLAND_LABEL].padEnd(24)} ${String(n).padStart(5)}`);
    }

    // Nur ein verschwindender Rest darf ohne jede Ortsangabe dastehen.
    expect(stufen.keine / gesamt).toBeLessThan(0.02);
  });

  it("vergibt für jede Schule einen eindeutigen, stabilen Slug", () => {
    const schulen = ladeSchulen().filter((s) => ordneSchulartZu(s.school_type, s.name).istSchule);

    const vergib = (liste: Rohschule[]) =>
      vergebeSlugs(liste.map((s) => ({ name: s.name, ort: s.city ?? null, plz: s.zip ?? null, quellId: s.id })));

    const zuordnung = vergib(schulen);
    const slugs = schulen.map((s) => zuordnung.get(s.id)!);
    expect(new Set(slugs).size).toBe(slugs.length);

    const laengen = slugs.map((s) => s.length).sort((a, b) => a - b);
    const kurz = slugs.filter((s) => !s.includes("-") || s.split("-").length <= 3).length;
    console.log(`\n  Slugs vergeben             ${slugs.length}, alle eindeutig`);
    console.log(`    Median-Länge             ${laengen[Math.floor(laengen.length / 2)]} Zeichen`);
    console.log(`    längster                 ${laengen.at(-1)} Zeichen`);
    console.log(`    kurz und lesbar          ${kurz} (${((kurz / slugs.length) * 100).toFixed(0)} %)`);

    // Stabilität: dieselbe Menge in umgekehrter Reihenfolge muss dieselben
    // Slugs ergeben, sonst brechen beim nächsten Import alle geteilten Links.
    const nachId = vergib([...schulen].reverse());
    const abweichungen = schulen.filter((s, i) => nachId.get(s.id) !== slugs[i]).length;
    console.log(`    Abweichung bei umgekehrter Reihenfolge  ${abweichungen}`);
    expect(abweichungen / slugs.length).toBeLessThan(0.01);
  });
});