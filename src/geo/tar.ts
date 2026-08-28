/**
 * So viel tar, wie für eine Datei aus einem MaxMind-Archiv nötig ist.
 *
 * MaxMind liefert `GeoIP2-City-….tar.gz` mit der Datenbank, einer Lizenz und
 * einer Liesmich. Wer im Panel hochlädt, soll genau diese Datei nehmen können,
 * ohne sie vorher auszupacken - das ist der Unterschied zwischen „macht die
 * Redaktion selbst“ und „braucht jemanden mit Serverzugang“.
 *
 * Ein Paket dafür wäre möglich; das Format ist aber so schlicht, dass die
 * Abhängigkeit teurer wäre als der Code: 512 Byte Kopf, Name und Größe als
 * Text, dann der Inhalt, aufgefüllt auf ein Vielfaches von 512.
 *
 * Absichtlich **nicht** unterstützt: Verzeichnisse anlegen, Zeitstempel,
 * Rechte, harte Verweise, GNU-Langnamen über 100 Zeichen. Gesucht wird eine
 * Datei mit passender Endung, alles andere wird übersprungen.
 */

const BLOCK = 512;

/** Der Name steht als nullterminierter Text in den ersten 100 Byte. */
function name(kopf: Buffer): string {
  const roh = kopf.subarray(0, 100);
  const ende = roh.indexOf(0);
  return roh.subarray(0, ende === -1 ? 100 : ende).toString("utf8");
}

/**
 * Die Größe steht oktal als Text - eine Eigenheit des Formats von 1979.
 *
 * Sehr große Dateien schreibt GNU tar stattdessen binär, erkennbar am gesetzten
 * höchsten Bit im ersten Byte. Beides kommt vor, also beides gelesen.
 */
function groesse(kopf: Buffer): number {
  const feld = kopf.subarray(124, 136);
  if ((feld[0] ?? 0) & 0x80) {
    let wert = 0;
    for (const byte of feld.subarray(1)) wert = wert * 256 + byte;
    return wert;
  }
  const text = feld.toString("ascii").replace(/\0.*$/, "").trim();
  return text === "" ? 0 : parseInt(text, 8);
}

/**
 * Sucht die erste Datei mit dieser Endung.
 *
 * `null`, wenn keine drin ist - der Aufrufer sagt dann, was er erwartet hätte,
 * statt eine unbrauchbare Datei zu schreiben.
 */
export function findeInTar(archiv: Buffer, endung: string): { name: string; inhalt: Buffer } | null {
  let stelle = 0;

  while (stelle + BLOCK <= archiv.length) {
    const kopf = archiv.subarray(stelle, stelle + BLOCK);
    // Zwei Nullblöcke beenden das Archiv; ein einzelner leerer Kopf reicht als
    // Abbruchgrund, weil danach nichts Brauchbares mehr kommt.
    if (kopf.every((b) => b === 0)) return null;

    const dateiname = name(kopf);
    const laenge = groesse(kopf);
    const inhaltAb = stelle + BLOCK;

    if (dateiname.toLowerCase().endsWith(endung.toLowerCase()) && laenge > 0) {
      if (inhaltAb + laenge > archiv.length) return null;
      return { name: dateiname, inhalt: archiv.subarray(inhaltAb, inhaltAb + laenge) };
    }

    // Auf den nächsten Blockanfang aufrunden.
    stelle = inhaltAb + Math.ceil(laenge / BLOCK) * BLOCK;
  }

  return null;
}

/** Sieht der Anfang nach gzip aus? Zwei Byte, seit 1992 unverändert. */
export function istGzip(daten: Buffer): boolean {
  return daten.length > 2 && daten[0] === 0x1f && daten[1] === 0x8b;
}

/** Die MaxMind-Datenbank beginnt nicht mit gzip und nicht mit einem tar-Kopf. */
export function istMmdb(daten: Buffer): boolean {
  // Kein eigener Anfangsstempel, aber am Ende steht immer diese Kennung.
  return daten.subarray(-100_000).includes(Buffer.from("\xab\xcd\xefMaxMind.com", "binary"));
}
