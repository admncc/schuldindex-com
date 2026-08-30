import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { holeAngemeldete } from "../../sitzung";
import { datenbankpfad, vergissLeser } from "@/geo/mmdb";
import { findeInTar, istGzip, istMmdb } from "@/geo/tar";
import { sql } from "@/db/verbindung";

/**
 * Nimmt eine neue GeoIP-Datenbank entgegen.
 *
 * Als Route Handler und nicht als Server-Aktion: Aktionen riegeln den Körper
 * bei einem Megabyte ab, und die Datei ist 46. Der Aufwand, das Limit
 * hochzusetzen, träfe alle Aktionen im Portal - hier trifft er nur diesen einen
 * Weg.
 *
 * Angenommen wird beides, was MaxMind ausliefert: das `.tar.gz` genau so, wie
 * es heruntergeladen wurde, oder die ausgepackte `.mmdb`. Wer eine Datei erst
 * entpacken muss, um sie hochzuladen, macht es irgendwann nicht mehr.
 *
 * Geschrieben wird über eine Nebendatei und `rename`: Ein Abbruch mitten im
 * Schreiben würde sonst eine halbe Datenbank hinterlassen, und die Ortung fiele
 * aus, bis es jemandem auffällt.
 */

/** Genug für die Europa-Ausgabe (46 MB) und die Weltausgabe (rund 120 MB). */
const HOECHSTGROESSE = 250 * 1024 * 1024;

export async function POST(anfrage: Request): Promise<NextResponse> {
  const angemeldet = await holeAngemeldete();
  if (angemeldet === null) {
    return NextResponse.json({ ok: false, meldung: "Nicht angemeldet." }, { status: 401 });
  }
  if (angemeldet.rolle !== "leitung") {
    return NextResponse.json(
      { ok: false, meldung: "Die Datenbank darf nur die Leitung austauschen." },
      { status: 403 },
    );
  }

  const formular = await anfrage.formData();
  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    return NextResponse.json({ ok: false, meldung: "Keine Datei angekommen." }, { status: 400 });
  }
  if (datei.size > HOECHSTGROESSE) {
    return NextResponse.json(
      { ok: false, meldung: `Die Datei ist größer als ${HOECHSTGROESSE / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  try {
    let inhalt = Buffer.from(await datei.arrayBuffer());
    if (istGzip(inhalt)) {
      // Mit Obergrenze entpacken: Die Größenprüfung oben gilt der gepackten
      // Datei. Ohne `maxOutputLength` könnte eine 200-MB-Datei zu mehreren
      // hundert Gigabyte aufgehen und den ganzen Prozess mitreißen - nicht nur
      // die Ortung. Die entpackte Datenbank ist rund 100 MB groß, die Grenze
      // ist also großzügig.
      inhalt = Buffer.from(gunzipSync(inhalt, { maxOutputLength: HOECHSTGROESSE }));
    }

    if (!istMmdb(inhalt)) {
      const gefunden = findeInTar(inhalt, ".mmdb");
      if (gefunden === null) {
        return NextResponse.json(
          {
            ok: false,
            meldung:
              "In der Datei steckt keine .mmdb. Erwartet wird das Archiv von MaxMind oder die Datenbank selbst.",
          },
          { status: 400 },
        );
      }
      inhalt = Buffer.from(gefunden.inhalt);
    }

    if (!istMmdb(inhalt)) {
      return NextResponse.json(
        { ok: false, meldung: "Das ist keine MaxMind-Datenbank." },
        { status: 400 },
      );
    }

    const ziel = datenbankpfad();
    mkdirSync(dirname(ziel), { recursive: true });
    const neben = `${ziel}.neu`;
    writeFileSync(neben, inhalt);
    renameSync(neben, ziel);
    vergissLeser();

    await sql`
      insert into moderationsprotokoll (aktion, moderator_id, kennung_versuch, begruendung)
      values ('geoip_ersetzt', ${angemeldet.id}, '',
              ${`GeoIP-Datenbank ersetzt (${Math.round(inhalt.length / 1024 / 1024)} MB)`})
    `;

    return NextResponse.json({ ok: true });
  } catch (fehler) {
    console.error("GeoIP-Datenbank konnte nicht ersetzt werden:", fehler);
    return NextResponse.json(
      { ok: false, meldung: "Die Datei ließ sich nicht verarbeiten." },
      { status: 500 },
    );
  }
}
