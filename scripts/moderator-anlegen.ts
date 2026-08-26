/**
 * Legt ein Moderationskonto an oder setzt sein Kennwort zurück.
 *
 * Aufruf:
 *   npx tsx scripts/moderator-anlegen.ts <kennung> "<Name>" [--leitung]
 *
 * Das Kennwort wird erzeugt und **einmal** ausgegeben, zusammen mit der URL für
 * die Authenticator-App. Beides steht nirgends sonst: das Kennwort nur als
 * scrypt-Abdruck, das TOTP-Geheimnis muss die Datenbank kennen, um Codes prüfen
 * zu können. Wer die Ausgabe verliert, lässt das Konto neu einrichten.
 */

import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { hashePasswort } from "../src/domain/anmeldung";
import { erzeugeGeheimnis, otpauthUrl } from "../src/domain/totp";

const [kennung, name, ...rest] = process.argv.slice(2);

if (!kennung || !name) {
  console.error('Aufruf: npx tsx scripts/moderator-anlegen.ts <kennung> "<Name>" [--leitung]');
  process.exit(1);
}

const rolle = rest.includes("--leitung") ? "leitung" : "moderation";

/**
 * Ein zufälliges Kennwort statt eines selbstgewählten.
 *
 * Vier Wörter aus einer kleinen Liste plus vier Ziffern: gut abtippbar, gut
 * diktierbar, und niemand kommt in Versuchung, das Kennwort aus dem Privatleben
 * wiederzuverwenden. Beim ersten Anmelden lässt es sich ändern.
 */
const WOERTER = [
  "Anker", "Birke", "Delta", "Eiche", "Fjord", "Garten", "Hafen", "Insel",
  "Kiesel", "Lampe", "Mosaik", "Norden", "Olive", "Pappel", "Quelle", "Rinde",
  "Salbei", "Turm", "Ufer", "Vogel", "Wolke", "Zeder",
];

function erzeugeKennwort(): string {
  const zufall = randomBytes(5);
  const woerter = Array.from({ length: 4 }, (_, i) => WOERTER[zufall[i]! % WOERTER.length]);
  return `${woerter.join("-")}-${String(zufall[4]! % 100).padStart(2, "0")}${String(zufall[0]! % 100).padStart(2, "0")}`;
}

const sql = postgres(process.env["DATABASE_URL"] ?? "", { onnotice: () => {} });

try {
  const kennwort = erzeugeKennwort();
  const abdruck = await hashePasswort(kennwort);
  const geheimnis = erzeugeGeheimnis();

  const [zeile] = await sql<{ id: string; angelegt: boolean }[]>`
    insert into moderatoren (kennung, name, passwort_abdruck, totp_geheimnis, rolle)
    values (${kennung}, ${name}, ${abdruck}, ${geheimnis}, ${rolle}::moderatorrolle)
    on conflict (lower(kennung)) do update set
      name = excluded.name,
      passwort_abdruck = excluded.passwort_abdruck,
      totp_geheimnis = excluded.totp_geheimnis,
      totp_letzter_schritt = null,
      rolle = excluded.rolle,
      aktiv = true,
      fehlversuche = 0,
      letzter_fehlversuch_am = null
    returning id, (xmax = 0) as angelegt
  `;

  // Ein zurückgesetztes Kennwort muss die laufenden Sitzungen beenden — sonst
  // arbeitet jemand mit dem alten Zugang weiter, gerade wenn der Grund für das
  // Zurücksetzen ein Verdacht war.
  const beendet = await sql`
    update moderator_sitzungen set beendet_am = now()
    where moderator_id = ${zeile!.id} and beendet_am is null
  `;

  console.log(zeile!.angelegt ? "Konto angelegt." : "Kennwort und zweiter Faktor zurückgesetzt.");
  console.log(`  Kennung:  ${kennung}`);
  console.log(`  Rolle:    ${rolle}`);
  console.log(`  Kennwort: ${kennwort}`);
  console.log(`  App-URL:  ${otpauthUrl(kennung, geheimnis)}`);
  if (beendet.count > 0) console.log(`  ${beendet.count} laufende Sitzung(en) beendet.`);
  console.log("\nDiese Ausgabe erscheint genau einmal. Übergib sie persönlich, nicht per E-Mail.");
} finally {
  await sql.end();
}
