/**
 * Angaben zum Betreiber - Grundlage für Impressum und Datenschutzerklärung.
 *
 * Diese Daten kennt der Code nicht: sie hängen daran, wer das Portal am Ende
 * betreibt (§ 5 DDG verlangt unter anderem die Rechtsform, das Register und die
 * Vertretungsberechtigten). Sie kommen deshalb aus der Umgebung.
 *
 * Was hier **nicht** passiert: Beispielangaben als Voreinstellung. Ein
 * Impressum mit „Musterstraße 1“ sieht aus wie ein Impressum und ist keines -
 * und ein fehlendes Impressum ist abmahnfähig. Fehlt eine Angabe, sagt die
 * Seite das an der Stelle deutlich, an der sie stehen müsste.
 */

export interface Betreiberangaben {
  readonly name: string | null;
  readonly rechtsform: string | null;
  readonly strasse: string | null;
  readonly plz: string | null;
  readonly ort: string | null;
  /**
   * Das Land, wenn der Sitz nicht in Deutschland ist.
   *
   * Fehlte als Feld, solange ein deutscher Sitz unterstellt war. Eine
   * Anschrift ohne Land ist aber keine ladungsfähige Anschrift, sobald der
   * Sitz im Ausland liegt - und § 5 DDG verlangt genau eine solche.
   */
  readonly land: string | null;
  readonly vertreten: string | null;
  /**
   * Der Vertreter in der Union nach Art. 27 DSGVO und Art. 13 DSA.
   *
   * **Keine Formalie.** Wer von ausserhalb der EU Dienste fuer Menschen in der
   * EU anbietet, muss schriftlich einen Vertreter in einem Mitgliedstaat
   * benennen und ihn im Impressum und in der Datenschutzerklaerung nennen -
   * die Aufsichtsbehoerden und Betroffene wenden sich an ihn. Fuer eine
   * Online-Plattform im Sinne des DSA kommt dieselbe Pflicht ein zweites Mal
   * aus Art. 13 DSA. Fehlt die Angabe, sagt die Seite das deutlich, statt die
   * Luecke zu verdecken.
   */
  readonly euVertreter: string | null;
  readonly register: string | null;
  readonly registernummer: string | null;
  readonly umsatzsteuerId: string | null;
  readonly email: string | null;
  readonly telefon: string | null;
  /** Verantwortlich nach § 18 Abs. 2 MStV - bei redaktionellen Angeboten Pflicht. */
  readonly verantwortlich: string | null;
  readonly datenschutzbeauftragter: string | null;
  /** Verarbeitungsregion der Claude API, die im Vertrag festgelegt wurde. */
  readonly kiRegion: string | null;
  /** Wer die Anwendung betreibt - Empfänger der Zugriffsprotokolle. */
  readonly hoster: string | null;
  /**
   * Wer die Bestätigungsnachrichten zustellt.
   *
   * Art. 13 Abs. 1 lit. e DSGVO verlangt die Empfaenger oder zumindest die
   * Kategorien. „Unser E-Mail-Dienstleister" war die Kategorie - und solange
   * keiner feststand, auch das Genaueste, was sich sagen liess. Steht einer
   * fest, gehoert er benannt: Er bekommt die E-Mail-Adresse jeder Person,
   * die hier bewertet.
   */
  readonly emaildienst: string | null;
  /** Wie lange die Zugriffsprotokolle des Servers aufbewahrt werden. */
  readonly protokollfrist: string | null;
  /**
   * Ob die Reichweitenmessung von Cloudflare eingeschaltet ist.
   *
   * **Warum das eine Angabe und keine Feststellung ist.** Cloudflare fuegt
   * das Zaehlskript selbst in die Antwort ein, ausserhalb unseres Codes und
   * umschaltbar in einer fremden Oberflaeche - der Server kann es nicht
   * ablesen. Ein fest geschriebener Absatz in der Datenschutzerklaerung
   * waere deshalb entweder eine Zusage ueber etwas, das nicht laeuft, oder
   * ein Verschweigen von etwas, das laeuft. Beides ist ein Mangel, also
   * steht es hier: Wer den Schalter bei Cloudflare umlegt, legt ihn auch
   * hier um.
   */
  readonly cloudflareZaehler: boolean;
}

function ausUmgebung(name: string): string | null {
  const wert = process.env[name];
  return wert === undefined || wert.trim() === "" ? null : wert.trim();
}

export function betreiber(): Betreiberangaben {
  return {
    name: ausUmgebung("BETREIBER_NAME"),
    rechtsform: ausUmgebung("BETREIBER_RECHTSFORM"),
    strasse: ausUmgebung("BETREIBER_STRASSE"),
    plz: ausUmgebung("BETREIBER_PLZ"),
    ort: ausUmgebung("BETREIBER_ORT"),
    land: ausUmgebung("BETREIBER_LAND"),
    vertreten: ausUmgebung("BETREIBER_VERTRETEN"),
    euVertreter: ausUmgebung("BETREIBER_EU_VERTRETER"),
    register: ausUmgebung("BETREIBER_REGISTER"),
    registernummer: ausUmgebung("BETREIBER_REGISTERNUMMER"),
    umsatzsteuerId: ausUmgebung("BETREIBER_USTID"),
    email: ausUmgebung("BETREIBER_EMAIL"),
    telefon: ausUmgebung("BETREIBER_TELEFON"),
    verantwortlich: ausUmgebung("BETREIBER_VERANTWORTLICH"),
    datenschutzbeauftragter: ausUmgebung("BETREIBER_DATENSCHUTZBEAUFTRAGTER"),
    kiRegion: ausUmgebung("KI_VERARBEITUNGSREGION"),
    hoster: ausUmgebung("BETREIBER_HOSTER"),
    emaildienst: ausUmgebung("BETREIBER_EMAILDIENST"),
    protokollfrist: ausUmgebung("BETREIBER_PROTOKOLLFRIST"),
    // Nur ein ausdrueckliches "an" zaehlt. Eine Messung, die sich
    // versehentlich einschaltet, weil irgendetwas in der Variable stand,
    // waere der falsche Fehler.
    cloudflareZaehler: (ausUmgebung("CLOUDFLARE_ZAEHLER") ?? "").toLowerCase() === "an",
  };
}

/**
 * Die Angaben, ohne die ein Impressum unvollständig ist (§ 5 DDG).
 *
 * Register und Umsatzsteuer-Identifikationsnummer stehen bewusst nicht darin:
 * beide gibt es nur, wenn es sie gibt.
 */
export const PFLICHTANGABEN: readonly (keyof Betreiberangaben)[] = [
  "name",
  "strasse",
  "plz",
  "ort",
  "email",
];

/**
 * Was zusätzlich Pflicht wird, sobald der Sitz nicht in Deutschland liegt.
 *
 * Das Land, weil eine Anschrift ohne Land nicht zustellbar ist - und der
 * Vertreter in der Union, weil Art. 27 DSGVO und Art. 13 DSA ihn von jedem
 * Anbieter ausserhalb der EU verlangen. Beides hing bisher an keiner
 * Vollständigkeitsprüfung: Die Seite zeigte „Impressum vollständig" und liess
 * die eine Angabe aus, die bei einem Sitz in Delaware am ehesten fehlt.
 */
export function fehlendeAngaben(a: Betreiberangaben = betreiber()): readonly (keyof Betreiberangaben)[] {
  const pflicht = [...PFLICHTANGABEN];
  if (a.land !== null && a.land !== "Deutschland") pflicht.push("euVertreter");
  return pflicht.filter((feld) => a[feld] === null);
}

export const FELDNAME: Readonly<Record<keyof Betreiberangaben, string>> = {
  name: "Name des Betreibers",
  rechtsform: "Rechtsform",
  strasse: "Straße und Hausnummer",
  plz: "Postleitzahl",
  ort: "Ort",
  land: "Land",
  vertreten: "Vertretungsberechtigte Person",
  euVertreter: "Vertreter in der EU (Art. 27 DSGVO, Art. 13 DSA)",
  register: "Registergericht",
  registernummer: "Registernummer",
  umsatzsteuerId: "Umsatzsteuer-Identifikationsnummer",
  email: "E-Mail-Adresse",
  telefon: "Telefonnummer",
  verantwortlich: "Verantwortlich nach § 18 Abs. 2 MStV",
  datenschutzbeauftragter: "Datenschutzbeauftragte Person",
  kiRegion: "Verarbeitungsregion der Claude API",
  hoster: "Hosting-Anbieter",
  emaildienst: "E-Mail-Dienstleister",
  protokollfrist: "Aufbewahrungsfrist der Zugriffsprotokolle",
  cloudflareZaehler: "Reichweitenmessung von Cloudflare",
};
