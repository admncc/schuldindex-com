/**
 * Meldungen nach Art. 16 DSA - Prüfung der Eingaben.
 *
 * Der Artikel schreibt vor, was eine Meldung enthalten muss, damit sie als
 * hinreichend genau und begründet gilt. Was hier geprüft wird, ist genau diese
 * Liste - nicht mehr: eine Hürde, die über das Gesetz hinausgeht, wäre selbst
 * ein Verstoß gegen die Pflicht zum „leicht zugänglichen“ Verfahren.
 */

export const MELDEGRUENDE = [
  "personenbezug",
  "beleidigung",
  "unwahr",
  "straftat",
  "urheberrecht",
  "sonstiges",
] as const;

export type Meldegrund = (typeof MELDEGRUENDE)[number];

export interface Meldegrundbeschreibung {
  readonly id: Meldegrund;
  readonly kurz: string;
  readonly hilfe: string;
}

export const MELDEGRUND_TEXT: readonly Meldegrundbeschreibung[] = [
  {
    id: "personenbezug",
    kurz: "Eine Person ist erkennbar",
    hilfe: "Der Inhalt nennt eine Lehrkraft, eine Schülerin oder eine andere Person mit Namen, Funktion oder auf andere Weise erkennbar.",
  },
  {
    id: "beleidigung",
    kurz: "Beleidigung oder Schmähung",
    hilfe: "Der Inhalt beschimpft jemanden, statt sachlich zu kritisieren.",
  },
  {
    id: "unwahr",
    kurz: "Unwahre Tatsachenbehauptung",
    hilfe: "Der Inhalt behauptet etwas, das nachweislich nicht stimmt. Bitte schreib unten, was und warum.",
  },
  {
    id: "straftat",
    kurz: "Drohung oder Gewaltankündigung",
    hilfe: "Wenn akute Gefahr besteht, ruf bitte zuerst die Polizei unter 110 an. Wir gehen solchen Meldungen dennoch sofort nach.",
  },
  {
    id: "urheberrecht",
    kurz: "Urheberrecht",
    hilfe: "Der Inhalt übernimmt geschützte Texte oder Bilder.",
  },
  {
    id: "sonstiges",
    kurz: "Etwas anderes",
    hilfe: "Beschreib unten möglichst genau, worum es geht.",
  },
];

export interface Meldeeingabe {
  readonly url: string;
  readonly grund: string;
  readonly erlaeuterung: string;
  readonly name: string;
  readonly kontakt: string;
  readonly gutglauben: boolean;
}

export interface Meldefehler {
  readonly feld: "url" | "grund" | "erlaeuterung" | "kontakt" | "gutglauben";
  readonly meldung: string;
}

/**
 * So lang muss die Erläuterung mindestens sein.
 *
 * „Ist falsch“ ist keine hinreichende Begründung im Sinne von Art. 16 Abs. 2
 * lit. a - und eine Meldung, mit der die Moderation nichts anfangen kann, hilft
 * der meldenden Person am wenigsten.
 */
export const MIN_ERLAEUTERUNG = 40;

export function istMeldegrund(wert: string): wert is Meldegrund {
  return (MELDEGRUENDE as readonly string[]).includes(wert);
}

/**
 * Prüft eine Meldung.
 *
 * Bei einer Meldung wegen einer Straftat gegen Leib und Leben verlangt Art. 16
 * Abs. 2 lit. c ausdrücklich **keine** Kontaktangabe. Wer eine Drohung meldet,
 * kommt hier deshalb auch ohne Adresse durch - nur bekommt er dann keine
 * Antwort, und darauf weist das Formular hin.
 */
export function pruefeMeldung(e: Meldeeingabe): Meldefehler[] {
  const fehler: Meldefehler[] = [];
  const url = e.url.trim();
  const erlaeuterung = e.erlaeuterung.trim();
  const kontakt = e.kontakt.trim();

  if (url === "") {
    fehler.push({ feld: "url", meldung: "Bitte gib die Adresse der Seite an, um die es geht." });
  } else if (!/^(https?:\/\/|\/)/i.test(url)) {
    fehler.push({
      feld: "url",
      meldung: "Das sieht nicht nach einer Adresse aus. Kopier sie am besten aus der Adresszeile des Browsers.",
    });
  }

  if (!istMeldegrund(e.grund)) {
    fehler.push({ feld: "grund", meldung: "Bitte wähle aus, worum es geht." });
  }

  if (erlaeuterung.length < MIN_ERLAEUTERUNG) {
    fehler.push({
      feld: "erlaeuterung",
      meldung: `Bitte beschreib in mindestens ${MIN_ERLAEUTERUNG} Zeichen, warum der Inhalt rechtswidrig ist.`,
    });
  }

  const brauchtKontakt = e.grund !== "straftat";
  if (brauchtKontakt && kontakt === "") {
    fehler.push({
      feld: "kontakt",
      meldung: "Ohne E-Mail-Adresse können wir dir das Ergebnis nicht mitteilen.",
    });
  } else if (kontakt !== "" && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(kontakt)) {
    fehler.push({ feld: "kontakt", meldung: "Diese E-Mail-Adresse sieht nicht vollständig aus." });
  }

  if (!e.gutglauben) {
    fehler.push({
      feld: "gutglauben",
      meldung: "Bitte bestätige, dass deine Angaben nach bestem Wissen richtig sind.",
    });
  }

  return fehler;
}

/**
 * Liest aus einer gemeldeten Adresse heraus, worauf sie zeigt.
 *
 * Meist ist es ein Schulprofil. Der Wert davon: die Moderation muss die Schule
 * nicht von Hand suchen, und die Meldung hängt am richtigen Datensatz, falls
 * die Adresse später nicht mehr aufgeht.
 */
export function deuteAdresse(url: string): { art: "schule" | "bewertung" | "unbekannt"; wert: string | null } {
  const schule = /\/schule\/([a-z0-9-]+)/i.exec(url);
  if (schule?.[1]) return { art: "schule", wert: schule[1] };

  const bewertung = /\/bewertung\/([0-9a-f-]{36})/i.exec(url);
  if (bewertung?.[1]) return { art: "bewertung", wert: bewertung[1] };

  return { art: "unbekannt", wert: null };
}

/** Was die meldende Person nach dem Absenden liest (Art. 16 Abs. 4). */
export const EINGANGSBESTAETIGUNG =
  "Deine Meldung ist eingegangen. Wir sehen sie uns an und teilen dir das Ergebnis mit, " +
  "sobald entschieden ist - in der Regel innerhalb weniger Tage.";
