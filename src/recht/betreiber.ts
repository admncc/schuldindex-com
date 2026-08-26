/**
 * Angaben zum Betreiber — Grundlage für Impressum und Datenschutzerklärung.
 *
 * Diese Daten kennt der Code nicht: sie hängen daran, wer das Portal am Ende
 * betreibt (§ 5 DDG verlangt unter anderem die Rechtsform, das Register und die
 * Vertretungsberechtigten). Sie kommen deshalb aus der Umgebung.
 *
 * Was hier **nicht** passiert: Beispielangaben als Voreinstellung. Ein
 * Impressum mit „Musterstraße 1“ sieht aus wie ein Impressum und ist keines —
 * und ein fehlendes Impressum ist abmahnfähig. Fehlt eine Angabe, sagt die
 * Seite das an der Stelle deutlich, an der sie stehen müsste.
 */

export interface Betreiberangaben {
  readonly name: string | null;
  readonly rechtsform: string | null;
  readonly strasse: string | null;
  readonly plz: string | null;
  readonly ort: string | null;
  readonly vertreten: string | null;
  readonly register: string | null;
  readonly registernummer: string | null;
  readonly umsatzsteuerId: string | null;
  readonly email: string | null;
  readonly telefon: string | null;
  /** Verantwortlich nach § 18 Abs. 2 MStV — bei redaktionellen Angeboten Pflicht. */
  readonly verantwortlich: string | null;
  readonly datenschutzbeauftragter: string | null;
  /** Verarbeitungsregion der Claude API, die im Vertrag festgelegt wurde. */
  readonly kiRegion: string | null;
  /** Wer die Anwendung betreibt — Empfänger der Zugriffsprotokolle. */
  readonly hoster: string | null;
  /** Wie lange die Zugriffsprotokolle des Servers aufbewahrt werden. */
  readonly protokollfrist: string | null;
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
    vertreten: ausUmgebung("BETREIBER_VERTRETEN"),
    register: ausUmgebung("BETREIBER_REGISTER"),
    registernummer: ausUmgebung("BETREIBER_REGISTERNUMMER"),
    umsatzsteuerId: ausUmgebung("BETREIBER_USTID"),
    email: ausUmgebung("BETREIBER_EMAIL"),
    telefon: ausUmgebung("BETREIBER_TELEFON"),
    verantwortlich: ausUmgebung("BETREIBER_VERANTWORTLICH"),
    datenschutzbeauftragter: ausUmgebung("BETREIBER_DATENSCHUTZBEAUFTRAGTER"),
    kiRegion: ausUmgebung("KI_VERARBEITUNGSREGION"),
    hoster: ausUmgebung("BETREIBER_HOSTER"),
    protokollfrist: ausUmgebung("BETREIBER_PROTOKOLLFRIST"),
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

export function fehlendeAngaben(a: Betreiberangaben = betreiber()): readonly (keyof Betreiberangaben)[] {
  return PFLICHTANGABEN.filter((feld) => a[feld] === null);
}

export const FELDNAME: Readonly<Record<keyof Betreiberangaben, string>> = {
  name: "Name des Betreibers",
  rechtsform: "Rechtsform",
  strasse: "Straße und Hausnummer",
  plz: "Postleitzahl",
  ort: "Ort",
  vertreten: "Vertretungsberechtigte Person",
  register: "Registergericht",
  registernummer: "Registernummer",
  umsatzsteuerId: "Umsatzsteuer-Identifikationsnummer",
  email: "E-Mail-Adresse",
  telefon: "Telefonnummer",
  verantwortlich: "Verantwortlich nach § 18 Abs. 2 MStV",
  datenschutzbeauftragter: "Datenschutzbeauftragte Person",
  kiRegion: "Verarbeitungsregion der Claude API",
  hoster: "Hosting-Anbieter",
  protokollfrist: "Aufbewahrungsfrist der Zugriffsprotokolle",
};
