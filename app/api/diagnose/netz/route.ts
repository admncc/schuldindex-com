import { headers } from "next/headers";
import { auskunft, einlass } from "../zugang";
import { absenderadresse, ortungFuerIp, datenbanklage } from "@/geo/mmdb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Was der Server von **dieser** Anfrage als Absender ableitet.
 *
 *   curl -H "Authorization: Bearer sdx_…" https://schulindex.com/api/diagnose/netz
 *
 * **Warum es das braucht.** „Absender nicht lokalisierbar" stand bei jeder
 * Abgabe, und dafür gibt es drei Ursachen, die von außen gleich aussehen: Der
 * Kopf `X-Forwarded-For` kommt nicht an, er kommt in anderer Länge an als
 * `VERTRAUTE_PROXYS` erwartet, oder die Adresse steht nicht in der Datenbank.
 * Raten lässt sich das nicht, und das Portal verrät einem Besucher
 * selbstverständlich nicht, was es über ihn herausgefunden hat. Also hier,
 * hinter dem Diagnosezugang.
 *
 * **Gezeigt wird ausschliesslich die eigene Anfrage.** Es gibt keine Auskunft
 * über fremde Besucher, und nichts davon wird gespeichert - die Adresse lebt
 * bis zum Ende dieser Antwort, wie überall sonst im Portal.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const tuer = await einlass(anfrage);
  if (!tuer.ok) return tuer.antwort;

  /**
   * Eine Adresse zum Nachschlagen, statt der eigenen.
   *
   * **Wofür.** Ob die Datenbank arbeitet, lässt sich an der eigenen Anfrage
   * nicht ablesen: Wer vom Server aus prüft, bekommt eine
   * Rechenzentrumsadresse, und die haben in den City-Datenbanken oft gar
   * keine Koordinaten. Dann steht „nicht gefunden" da und man weiss nicht, ob
   * das an der Adresse liegt oder an der Datei. Mit `?ip=` schlägt man eine
   * bekannte Adresse nach und weiss es.
   *
   * Herausgegeben wird dabei nichts über Besucher - nur, was in der
   * öffentlich erhältlichen MaxMind-Datenbank zu einer frei gewählten Adresse
   * steht. Gespeichert wird weiterhin nichts.
   */
  const gefragt = new URL(anfrage.url).searchParams.get("ip");
  if (gefragt !== null) {
    const sauber = gefragt.trim().slice(0, 45);
    const lage = await datenbanklage();
    const treffer = /^[0-9a-fA-F:.]+$/.test(sauber) ? await ortungFuerIp(sauber) : null;
    return auskunft({
      gefragteAdresse: sauber,
      ortung: treffer,
      datenbank: { vorhanden: lage.vorhanden, art: lage.art, groesseMb: lage.groesseMb, pfad: lage.pfad },
      befund:
        !lage.vorhanden
          ? "Keine Datenbank hinterlegt."
          : treffer === null
            ? "Diese Adresse steht nicht in der hinterlegten Datenbank."
            : "Treffer - die Datenbank arbeitet.",
    });
  }

  const kopf = await headers();
  const roh = kopf.get("x-forwarded-for");
  const kette = (roh ?? "").split(",").map((t) => t.trim()).filter((t) => t !== "");
  const proxys = Number(process.env["VERTRAUTE_PROXYS"] ?? "0");
  const abgeleitet = absenderadresse(kopf);
  const ortung = abgeleitet === null ? null : await ortungFuerIp(abgeleitet);
  const lage = await datenbanklage();

  return auskunft({
    hinweis:
      "Nur die Kopfzeilen dieser Anfrage. Nichts davon wird gespeichert; " +
      "es gibt keine Auskunft ueber fremde Besucher.",
    vertrauteProxys: proxys,
    xForwardedFor: roh,
    kettenlaenge: kette.length,
    // Die Stelle, die `absenderadresse` liest: Laenge minus Proxys. Ist sie
    // negativ, erwartet die Einstellung mehr Proxys, als tatsaechlich
    // angehaengt haben - dann ist der Absender immer unbekannt, bei jeder
    // einzelnen Abgabe.
    geleseneStelle: kette.length - proxys,
    abgeleiteteAdresse: abgeleitet,
    cfConnectingIp: kopf.get("cf-connecting-ip"),
    ortung:
      ortung === null
        ? null
        : { land: ortung.land, ort: ortung.ort, genauigkeitKm: ortung.genauigkeitKm },
    datenbank: { vorhanden: lage.vorhanden, art: lage.art, groesseMb: lage.groesseMb },
    befund:
      proxys <= 0
        ? "VERTRAUTE_PROXYS ist nicht gesetzt - der Kopf wird gar nicht gelesen."
        : kette.length === 0
          ? "Kein X-Forwarded-For angekommen. Steht ueberhaupt ein Proxy davor?"
          : kette.length < proxys
            ? `Nur ${kette.length} Eintrag/Eintraege, aber ${proxys} Proxys erwartet - VERTRAUTE_PROXYS ist zu hoch.`
            : abgeleitet === null
              ? "Stelle gelesen, aber leer - der Kopf hat eine unerwartete Form."
              : ortung === null
                ? "Adresse gelesen, aber nicht in der Datenbank gefunden: ausserhalb des Auszugs, VPN oder Rechenzentrum."
                : "In Ordnung: Adresse gelesen und lokalisiert.",
  });
}
