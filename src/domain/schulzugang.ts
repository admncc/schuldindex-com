/**
 * Zugang für Schulen (Rolle „Schulsupport“, Entscheidung E8).
 *
 * Eine Schule soll ihre eigenen Werte sehen: Gesamtwertung, Kategorien, Trend,
 * die Zusammenfassung - **keine Einzelbewertungen**. Die Frage, an der alles
 * hängt, ist nicht die Anzeige, sondern der Nachweis: Wie belegt jemand, dass er
 * für diese Schule spricht?
 *
 * Der Versuch, das über die E-Mail-Domäne zu lösen, scheitert am echten
 * Datenbestand. Die Adressen im Schulverzeichnis sehen so aus:
 *
 *     123456@schule.nrw.de          → 5.447 Schulen unter demselben Host
 *     poststelle@0412…schule.bwl.de → je Schule ein eigener Host
 *     sekretariat@t-online.de       → 805 Schulen, Freemailer
 *
 * Wer bei „gleiche Domäne genügt“ landet, gibt jedem mit einer
 * `schule.nrw.de`-Adresse Zugriff auf fünftausend fremde Schulen. Deshalb drei
 * Wege, in dieser Reihenfolge:
 *
 *  1. **Die hinterlegte Adresse.** Der Link geht an die Adresse aus dem
 *     Schulverzeichnis - die anfragende Person wählt sie nicht aus, sie muss nur
 *     Zugriff darauf haben. Sichere Variante, unabhängig von geteilten Hosts.
 *  2. **Eine Adresse an einem Host, der genau einer Schule gehört.** Nur dann
 *     sagt der Host etwas über die Schule aus.
 *  3. **Prüfung durch Menschen.** Für alles andere - die Redaktion ruft an oder
 *     schreibt an die Schulanschrift.
 */

export type Zugangsweg = "amtliche_adresse" | "eigener_host" | "pruefung";

export interface Schulkontakt {
  /** Adresse aus dem Schulverzeichnis, wenn vorhanden. */
  readonly email: string | null;
  readonly website: string | null;
}

/** Zieht den Hostnamen aus einer Adresse oder einer Web-Adresse, klein geschrieben. */
export function host(wert: string | null): string | null {
  if (wert === null) return null;
  const roh = wert.trim().toLowerCase();
  if (roh === "") return null;

  const nachAt = roh.includes("@") ? roh.slice(roh.lastIndexOf("@") + 1) : roh;
  const ohneSchema = nachAt.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const ohnePfad = ohneSchema.split(/[/?#]/)[0] ?? "";
  const ohneNutzer = ohnePfad.includes("@") ? ohnePfad.slice(ohnePfad.lastIndexOf("@") + 1) : ohnePfad;
  const ohnePort = ohneNutzer.split(":")[0] ?? "";
  // `www.` ist keine Aussage über die Zugehörigkeit, sondern eine Gewohnheit.
  const ohneWww = ohnePort.replace(/^www\./, "");

  return /^[a-z0-9ä-ü.-]+\.[a-z]{2,}$/.test(ohneWww) ? ohneWww : null;
}

export function istEmail(wert: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(wert.trim());
}

/**
 * Wie viele Schulen einen Host benutzen - die Auskunft, die den Ausschlag gibt.
 *
 * Kommt aus der Datenbank; die Entscheidung darüber steht hier.
 */
export interface Hostauskunft {
  /** Zahl der Schulen, deren hinterlegte Adresse oder Website auf diesem Host liegt. */
  readonly schulen: number;
}

export interface Wegentscheidung {
  readonly weg: Zugangsweg;
  /**
   * Adresse, an die der Link geht. Bei `pruefung` leer - dann geht nichts
   * hinaus, bevor ein Mensch entschieden hat.
   */
  readonly ziel: string | null;
  readonly begruendung: string;
}

/**
 * Entscheidet, auf welchem Weg eine Schule Zugang bekommt.
 *
 * `vorgeschlagen` ist die Adresse, die jemand von sich aus angibt. Sie wird nur
 * benutzt, wenn ihr Host genau dieser einen Schule gehört - sonst wäre sie
 * genau das Schlupfloch, das die geteilten Landesdomänen aufmachen.
 */
export function entscheideWeg(
  schule: Schulkontakt,
  vorgeschlagen: string | null,
  auskunft: (host: string) => Hostauskunft,
): Wegentscheidung {
  const amtlich = schule.email !== null && istEmail(schule.email) ? schule.email.trim().toLowerCase() : null;

  // Weg 1 hat Vorrang, auch wenn eine Adresse vorgeschlagen wurde: die
  // hinterlegte Adresse ist der stärkere Nachweis, und sie kostet nichts.
  if (amtlich !== null) {
    return {
      weg: "amtliche_adresse",
      ziel: amtlich,
      begruendung: "Der Link geht an die im Schulverzeichnis hinterlegte Adresse der Schule.",
    };
  }

  if (vorgeschlagen !== null && istEmail(vorgeschlagen)) {
    const vorschlagshost = host(vorgeschlagen);
    const schulhost = host(schule.website);

    if (vorschlagshost !== null && schulhost !== null && vorschlagshost === schulhost) {
      if (auskunft(vorschlagshost).schulen === 1) {
        return {
          weg: "eigener_host",
          ziel: vorgeschlagen.trim().toLowerCase(),
          begruendung: `Die Adresse liegt auf ${vorschlagshost} - der Domäne dieser Schule.`,
        };
      }
      return {
        weg: "pruefung",
        ziel: null,
        begruendung: `${vorschlagshost} wird von mehreren Schulen genutzt und belegt daher nichts. Wir prüfen von Hand.`,
      };
    }
  }

  return {
    weg: "pruefung",
    ziel: null,
    begruendung: "Zu dieser Schule ist keine Adresse hinterlegt, die wir prüfen können. Wir melden uns.",
  };
}

/**
 * Was die anfragende Person zu sehen bekommt.
 *
 * Bei Weg 1 **ohne** die Adresse: Sie steht zwar öffentlich im Schulverzeichnis,
 * aber sie hier auszugeben hieße, aus einem Zugangsformular einen Adressabruf zu
 * machen - samt Prüfung, welche Schule welche Adresse hat.
 */
export function wegtext(entscheidung: Wegentscheidung): string {
  switch (entscheidung.weg) {
    case "amtliche_adresse":
      return (
        "Wir haben einen Zugangslink an die im Schulverzeichnis hinterlegte Adresse der Schule " +
        "geschickt. Wer dort Zugriff hat, kann den Zugang einrichten."
      );
    case "eigener_host":
      return "Wir haben einen Zugangslink an die angegebene Adresse geschickt.";
    case "pruefung":
      return (
        "Deine Anfrage liegt uns vor. Weil sich der Zugang hier nicht automatisch belegen lässt, " +
        "prüfen wir sie von Hand und melden uns bei der Schule."
      );
  }
}

/** Gültigkeit des Zugangslinks. Kürzer als beim Konto: er richtet einen Zugang ein. */
export const ZUGANGSLINK_STUNDEN = 24;

/** Wie lange ein eingerichteter Zugang gilt, bevor er neu belegt werden muss. */
export const ZUGANG_TAGE = 180;
