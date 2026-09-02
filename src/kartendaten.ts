import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Wo die Kartendaten liegen - und ob sie da sind.
 *
 * Steht getrennt von der ausliefernden Route, weil auch die Seite die Frage
 * stellt: Ohne Archiv zeigt sie die alte, hintergrundlose Darstellung. Eine
 * Seite, die eine Route importiert, um an eine Pfadangabe zu kommen, wäre
 * die falsche Richtung.
 */
export function kartenverzeichnis(): string {
  return resolve(process.env["KARTEN_VERZEICHNIS"] ?? "daten/karten");
}

/** Der Dateiname ist fest: Das Archiv wird ausgetauscht, nicht umbenannt. */
export const ARCHIVNAME = "basis.pmtiles";

let geprueft = 0;
let ergebnis = false;
const ABSTAND_MS = 60_000;

/**
 * Höchstens einmal je Minute wird wirklich nachgesehen.
 *
 * Ein Zugriff auf das Dateisystem je Seitenaufruf wäre Verschwendung; ein Wert
 * für die Laufzeit des Prozesses hiesse dagegen: Wer das Archiv einspielt,
 * muss den Dienst neu starten, damit die Karte erscheint. Eine Minute ist der
 * Punkt, an dem beides nicht mehr weh tut.
 */
export async function kachelarchivVorhanden(): Promise<boolean> {
  const jetzt = Date.now();
  if (jetzt - geprueft < ABSTAND_MS) return ergebnis;
  geprueft = jetzt;

  try {
    await access(join(kartenverzeichnis(), ARCHIVNAME));
    ergebnis = true;
  } catch {
    ergebnis = false;
  }
  return ergebnis;
}

export type Bereich = { readonly art: "ganz" } | { readonly art: "teil"; readonly von: number; readonly bis: number } | { readonly art: "ungueltig" };

/**
 * Wertet einen `Range`-Kopf aus.
 *
 * Steht hier und nicht in der Route, weil daran das ganze Verfahren hängt: Der
 * PMTiles-Client holt aus einem Archiv von mehreren Gigabyte einzelne Blöcke.
 * Wird der Kopf falsch gelesen, lädt jeder Kartenaufruf das ganze Archiv - und
 * das fällt in der Entwicklung nicht auf, weil dort ein kleines Archiv liegt.
 *
 * Drei Formen kommen vor, und die dritte ist die, die man vergisst:
 * `bytes=0-1023` (von-bis), `bytes=1024-` (ab hier bis zum Ende) und
 * `bytes=-500` - **die letzten 500 Byte**, nicht „von 0 bis 500". Genau die
 * benutzt der Client für den Abschlussblock des Archivs, mit dem er anfängt.
 */
export function bereichAusKopf(kopf: string | null, groesse: number): Bereich {
  if (kopf === null) return { art: "ganz" };

  const treffer = /^bytes=(\d*)-(\d*)$/.exec(kopf.trim());
  if (treffer === null) return { art: "ungueltig" };

  const rohVon = treffer[1] ?? "";
  const rohBis = treffer[2] ?? "";
  if (rohVon === "" && rohBis === "") return { art: "ungueltig" };

  const von = rohVon === "" ? Math.max(groesse - Number(rohBis), 0) : Number(rohVon);
  const bis = rohVon === "" || rohBis === "" ? groesse - 1 : Math.min(Number(rohBis), groesse - 1);

  if (!Number.isFinite(von) || !Number.isFinite(bis) || von > bis || von >= groesse || von < 0) {
    return { art: "ungueltig" };
  }
  return { art: "teil", von, bis };
}
