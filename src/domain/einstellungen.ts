/**
 * Einstellbare Werte der Betrugserkennung.
 *
 * Bisher standen die Grenzwerte als Konstanten im Code. Das genügt, solange
 * niemand sie ändern muss - im Betrieb ist das Gegenteil der Fall: Ob „mehr als
 * fünf Abgaben in zehn Minuten“ zu streng ist, weiß man erst, wenn die ersten
 * tausend Bewertungen da sind, und dann soll niemand für eine Zahl eine neue
 * Fassung ausliefern müssen.
 *
 * Deshalb dieser Katalog. Er beschreibt jede Stellschraube samt Grenzen,
 * Vorgabewert und Erklärung; die Oberfläche unter `/moderation/einstellungen`
 * baut sich daraus, und die Prüfung liest daraus. Wer eine Einstellung
 * hinzufügt, ändert genau eine Datei.
 *
 * **Grenzen nach oben und unten sind Pflicht.** Eine Halteschwelle von 0 hielte
 * jede Bewertung an, eine von 99 keine einzige - beides sind Zustände, in die
 * das Portal nicht durch einen Tippfehler geraten darf.
 */

/**
 * `schalter` ist eine Ganzzahl mit genau zwei erlaubten Werten, 0 und 1.
 *
 * Kein eigener Datentyp, weil die ganze Kette - Katalog, Prüfung, Speicherung,
 * Verlauf - auf Zahlen steht und ein zweiter Typ jede Stelle davon verzweigen
 * würde. Nur die Anzeige unterscheidet: Sie zeigt ein Ankreuzfeld statt eines
 * Zahlenfeldes.
 */
export type Einstellungsart = "ganzzahl" | "kommazahl" | "schalter";

export interface Einstellungsbeschreibung {
  readonly schluessel: string;
  readonly gruppe: "zugang" | "kontakt" | "tempo" | "abweichung" | "menge" | "ort" | "gewichtung";
  readonly label: string;
  readonly hilfe: string;
  readonly art: Einstellungsart;
  readonly vorgabe: number;
  readonly min: number;
  readonly max: number;
  readonly einheit?: string;
}

export const GRUPPEN_LABEL: Readonly<Record<Einstellungsbeschreibung["gruppe"], string>> = {
  zugang: "Zugang zur Moderation",
  kontakt: "Wege der Bestätigung",
  tempo: "Tempo der Beantwortung",
  abweichung: "Abweichung vom Schulmittel",
  menge: "Menge und Häufung",
  ort: "Ort der Abgabe",
  gewichtung: "Gewichtung",
};

export const GRUPPEN_HILFE: Readonly<Record<Einstellungsbeschreibung["gruppe"], string>> = {
  zugang:
    "Betrifft nicht die Betrugserkennung, sondern diese Oberfläche selbst. Hinter ihr liegen entschlüsselbare Kontaktdaten, die Freigabe von Bewertungen und die Schwellen darunter - wer hier etwas lockert, lockert den Zugang zu alldem.",
  kontakt:
    "Über welche Wege sich eine Bewertung bestätigen lässt. Mindestens einer muss anbleiben - sind alle aus, gelten wieder alle, denn ohne Bestätigung nimmt das Portal gar nichts an. Ein abgeschalteter Weg verschwindet aus dem Formular und wird auch dann nicht angenommen, wenn ihn jemand von Hand mitschickt.",
  tempo:
    "Wer den Fragebogen in Sekunden durchklickt, hat ihn nicht gelesen. Die Gesamtdauer misst der Server selbst über einen signierten Zeitstempel - eine Angabe des Browsers wäre wertlos. Die Abstände zwischen den einzelnen Klicks kommen aus dem Browser und werden gegen diese Dauer geprüft. Gespeichert werden Median und Streuung - und seit dem 27.08.2026 auch die Folge selbst, damit sich Muster nachträglich auswerten lassen; die Datenschutzerklärung weist das aus.",
  abweichung:
    "Eine Bewertung, die weit vom bisherigen Bild einer Schule abweicht, ist kein Beweis für Missbrauch: Es kann die eine Person sein, die etwas erlebt hat, das die anderen nicht sehen. Deshalb hält dieses Signal die Bewertung an, statt sie abzulehnen - und deshalb wiegt es leicht.",
  menge: "Viele Abgaben in kurzer Zeit, von derselben Quelle oder zu derselben Schule.",
  ort: "Abstand zwischen dem ungefähren Standort der Abgabe und der Schule. Die IP-Adresse selbst wird nie gespeichert.",
  gewichtung:
    "Jedes Signal hat ein Gewicht; ab der Halteschwelle geht die Bewertung in die Moderation. Ein einzelnes Signal soll nicht genügen - mehrere schwache zusammen schon.",
};

export const KATALOG: readonly Einstellungsbeschreibung[] = [
  {
    schluessel: "zweiter_faktor",
    gruppe: "zugang",
    label: "Zweiter Faktor bei der Anmeldung verlangen",
    hilfe:
      "Ist er an, braucht jede Anmeldung zusätzlich den sechsstelligen Code aus der Authenticator-App. Zurzeit aus, auf Entscheidung vom 27.08.2026 für den Testbetrieb - vor dem Echtbetrieb einschalten. Das TOTP-Geheimnis der Konten bleibt gespeichert, das Einschalten wirkt sofort und kostet niemanden eine Neueinrichtung. Solange er aus ist, steht ein Hinweis darauf auf jeder Seite der Moderation.",
    art: "schalter",
    vorgabe: 0,
    min: 0,
    max: 1,
  },
  {
    schluessel: "sitzungsdauer_stunden",
    gruppe: "zugang",
    label: "Eine Anmeldung gilt so lange",
    hilfe:
      "Danach ist eine erneute Anmeldung nötig. Zwölf Stunden decken einen Arbeitstag ab und melden einen vergessenen Rechner über Nacht ab. Läuft die Sitzung mitten in der Arbeit ab, landet man auf der Anmeldeseite - wer das oft erlebt, erhöht den Wert hier. Mehr als eine Woche lässt das Feld nicht zu: Hinter dieser Oberfläche liegen entschlüsselbare Kontaktdaten, und ein Sitzungscookie, das einen Monat gilt, ist ein Monat Zugang für jeden, der es sich holt. Laufende Sitzungen behalten ihre Frist; die Änderung wirkt ab der nächsten Anmeldung.",
    art: "ganzzahl",
    vorgabe: 12,
    min: 1,
    max: 168,
    einheit: "Stunden",
  },
  {
    schluessel: "kontakt_whatsapp",
    gruppe: "kontakt",
    label: "Bestätigung über WhatsApp anbieten",
    hilfe:
      "Der Weg mit der höchsten Hürde für Mehrfachkonten: Eine Telefonnummer ist nicht in Sekunden neu angelegt. Setzt eine freigeschaltete WhatsApp-Business-Nummer voraus.",
    art: "schalter",
    vorgabe: 1,
    min: 0,
    max: 1,
  },
  {
    schluessel: "kontakt_sms",
    gruppe: "kontakt",
    label: "Bestätigung über SMS anbieten",
    hilfe:
      "Wie WhatsApp, aber über den SMS-Dienstleister - und mit Kosten je Nachricht. Aus, solange kein Vertrag besteht.",
    art: "schalter",
    vorgabe: 1,
    min: 0,
    max: 1,
  },
  {
    schluessel: "kontakt_email",
    gruppe: "kontakt",
    label: "Bestätigung über E-Mail anbieten",
    hilfe:
      "Der bequemste Weg - und der mit der geringsten Hürde: Eine Adresse ist in Sekunden neu angelegt. Abgaben über E-Mail bekommen deshalb ohnehin einen Signalpunkt.",
    art: "schalter",
    vorgabe: 1,
    min: 0,
    max: 1,
  },
  {
    schluessel: "geraet_hoechstzahl",
    gruppe: "menge",
    label: "Abgaben aus demselben Browser in 24 Stunden",
    hilfe:
      "Ab dieser Zahl gilt die nächste Abgabe aus demselben Browser als auffällig. Nicht zu streng einstellen: In einer Familie, einem Computerraum oder an einem geteilten Rechner sind mehrere Abgaben der Normalfall. Die Kennung dahinter ist Zufall und in zehn Sekunden zurückgesetzt - sie fängt den bequemen Fall, nicht den entschlossenen.",
    art: "ganzzahl",
    vorgabe: 5,
    min: 2,
    max: 50,
  },
  {
    schluessel: "geraet_gewicht",
    gruppe: "gewichtung",
    label: "Gewicht: viele Abgaben aus demselben Browser",
    hilfe:
      "Wie schwer die Häufung aus einem Browser wiegt. Klein halten - sie ist ein Hinweis, kein Nachweis.",
    art: "ganzzahl",
    vorgabe: 1,
    min: 1,
    max: 3,
  },
  {
    schluessel: "tempo_sekunden_je_frage",
    gruppe: "tempo",
    label: "Mindestzeit je Frage",
    hilfe:
      "Liegt der Schnitt darunter, gilt die Abgabe als durchgeklickt. Lesen und Antworten dauert erfahrungsgemäß zwei bis vier Sekunden je Frage; 1,5 lässt Raum für schnelle Leser.",
    art: "kommazahl",
    vorgabe: 1.5,
    min: 0.2,
    max: 15,
    einheit: "Sekunden",
  },
  {
    schluessel: "tempo_mindestfragen",
    gruppe: "tempo",
    label: "Erst ab so vielen Fragen prüfen",
    hilfe:
      "Bei wenigen Fragen sagt der Schnitt nichts: Wer drei Fragen in vier Sekunden beantwortet, kann sie gelesen haben.",
    art: "ganzzahl",
    vorgabe: 10,
    min: 1,
    max: 61,
    einheit: "Fragen",
  },
  {
    schluessel: "tempo_gewicht",
    gruppe: "tempo",
    label: "Gewicht des Tempo-Signals",
    hilfe: "1 = Hinweis, 2 = auffällig, 3 = allein schon Grund zum Anhalten.",
    art: "ganzzahl",
    vorgabe: 2,
    min: 1,
    max: 3,
  },
  {
    schluessel: "klick_mindestabstand_ms",
    gruppe: "tempo",
    label: "Mindestabstand zwischen zwei Klicks",
    hilfe:
      "Der mittlere Abstand zwischen zwei Antworten. Wer eine Frage liest und entscheidet, braucht mehr als eine halbe Sekunde; 400 Millisekunden lassen selbst schnellem Durchgehen Raum.",
    art: "ganzzahl",
    vorgabe: 400,
    min: 50,
    max: 5000,
    einheit: "ms",
  },
  {
    schluessel: "klick_gleichmass_prozent",
    gruppe: "tempo",
    label: "Mindeststreuung der Klickabstände",
    hilfe:
      "Streuen die Abstände weniger als das, klickt niemand von Hand: Ein Mensch braucht für die eine Frage zwei Sekunden und für die nächste zehn, ein Skript immer gleich lang. Der verräterischste Befund von allen - auch ein langsames Skript fällt darüber auf.",
    art: "ganzzahl",
    vorgabe: 15,
    min: 1,
    max: 80,
    einheit: "%",
  },
  {
    schluessel: "klick_mindestzahl",
    gruppe: "tempo",
    label: "Erst ab so vielen Klicks auswerten",
    hilfe: "Aus drei Abständen lässt sich weder ein Mittel noch eine Streuung ablesen.",
    art: "ganzzahl",
    vorgabe: 15,
    min: 2,
    max: 60,
    einheit: "Klicks",
  },
  {
    schluessel: "klick_tempo_gewicht",
    gruppe: "tempo",
    label: "Gewicht: zu schnell geklickt",
    hilfe: "1 = Hinweis, 2 = auffällig, 3 = allein schon Grund zum Anhalten.",
    art: "ganzzahl",
    vorgabe: 2,
    min: 1,
    max: 3,
  },
  {
    schluessel: "klick_gleichmass_gewicht",
    gruppe: "tempo",
    label: "Gewicht: zu gleichmäßig geklickt",
    hilfe:
      "Höher vorgegeben als das reine Tempo: Gleichmäßigkeit hat keine harmlose Erklärung, Schnelligkeit schon.",
    art: "ganzzahl",
    vorgabe: 3,
    min: 1,
    max: 3,
  },
  {
    schluessel: "abweichung_punkte",
    gruppe: "abweichung",
    label: "Abstand zum Schulmittel",
    hilfe:
      "Ab diesem Abstand auf der Skala von 0 bis 10 wird die Bewertung angehalten. Drei Punkte sind viel: Sie trennen „deutlich anderer Eindruck“ von „das Gegenteil aller anderen“.",
    art: "kommazahl",
    vorgabe: 3,
    min: 0.5,
    max: 10,
    einheit: "Punkte",
  },
  {
    schluessel: "abweichung_mindestbewertungen",
    gruppe: "abweichung",
    label: "Erst ab so vielen Bewertungen vergleichen",
    hilfe:
      "Vorher hat die Schule kein Mittel, von dem jemand abweichen könnte. Bei drei Bewertungen wäre die vierte automatisch verdächtig, wenn die ersten drei einer Meinung waren.",
    art: "ganzzahl",
    vorgabe: 10,
    min: 3,
    max: 200,
    einheit: "Bewertungen",
  },
  {
    schluessel: "abweichung_gewicht",
    gruppe: "abweichung",
    label: "Gewicht des Abweichungs-Signals",
    hilfe:
      "Bewusst niedrig vorgegeben: Die abweichende Meinung ist der Normalfall, den ein Bewertungsportal aushalten muss, nicht der Verdachtsfall.",
    art: "ganzzahl",
    vorgabe: 1,
    min: 1,
    max: 3,
  },
  {
    schluessel: "abgaben_je_zehn_minuten",
    gruppe: "menge",
    label: "Abgaben je Konto in zehn Minuten",
    hilfe: "Darüber liegt keine Beantwortung mehr vor, sondern ein Ablauf.",
    art: "ganzzahl",
    vorgabe: 5,
    min: 1,
    max: 50,
  },
  {
    schluessel: "schulen_je_tag",
    gruppe: "menge",
    label: "Verschiedene Schulen je Konto und Tag",
    hilfe: "Wer an einem Tag fünf Schulen bewertet, kennt sie kaum alle aus eigener Anschauung.",
    art: "ganzzahl",
    vorgabe: 3,
    min: 1,
    max: 30,
  },
  {
    schluessel: "bewertungen_je_schule_und_stunde",
    gruppe: "menge",
    label: "Bewertungen je Schule und Stunde",
    hilfe:
      "Über alle Absender. Schlägt an, wenn eine Klasse geschlossen bewertet - der häufigste Fall einer organisierten Welle.",
    art: "ganzzahl",
    vorgabe: 10,
    min: 2,
    max: 200,
  },
  {
    schluessel: "entfernung_km",
    gruppe: "ort",
    label: "Höchstabstand zur Schule",
    hilfe:
      "Darüber wird die Bewertung angehalten. Deutsche Mobilfunkadressen orten auf den Netzknoten - deshalb großzügig.",
    art: "ganzzahl",
    vorgabe: 150,
    min: 10,
    max: 2000,
    einheit: "km",
  },
  {
    schluessel: "halteschwelle",
    gruppe: "gewichtung",
    label: "Halteschwelle",
    hilfe:
      "Summe der Signalgewichte, ab der eine Bewertung in die Moderation geht. Niedriger heißt mehr Handarbeit, höher heißt mehr Durchgelassenes.",
    art: "ganzzahl",
    vorgabe: 3,
    min: 1,
    max: 12,
  },
];

export type Einstellungen = Readonly<Record<string, number>>;

export const VORGABEN: Einstellungen = Object.freeze(
  Object.fromEntries(KATALOG.map((e) => [e.schluessel, e.vorgabe])),
);

export function beschreibung(schluessel: string): Einstellungsbeschreibung | null {
  return KATALOG.find((e) => e.schluessel === schluessel) ?? null;
}

export type Wertpruefung =
  | { readonly ok: true; readonly wert: number }
  | { readonly ok: false; readonly meldung: string };

/**
 * Prüft einen eingegebenen Wert.
 *
 * Deutsche Eingabe: `2,5` ist dasselbe wie `2.5`. Wer eine Zahl mit Komma
 * abweist, weil das Formular Punkte erwartet, hat die Oberfläche nicht für
 * Menschen gebaut.
 */
export function pruefeWert(schluessel: string, eingabe: string | number): Wertpruefung {
  const b = beschreibung(schluessel);
  if (b === null) return { ok: false, meldung: "Diese Einstellung gibt es nicht." };

  const roh = typeof eingabe === "number" ? eingabe : Number(String(eingabe).trim().replace(",", "."));
  if (!Number.isFinite(roh)) return { ok: false, meldung: "Das ist keine Zahl." };

  if ((b.art === "ganzzahl" || b.art === "schalter") && !Number.isInteger(roh)) {
    return { ok: false, meldung: "Hier ist nur eine ganze Zahl möglich." };
  }
  if (roh < b.min || roh > b.max) {
    return { ok: false, meldung: `Zulässig ist ${b.min} bis ${b.max}${b.einheit ? ` ${b.einheit}` : ""}.` };
  }

  // Kommazahlen auf eine Nachkommastelle: mehr steuert niemand sinnvoll aus,
  // und die Anzeige bliebe sonst hinter dem gespeicherten Wert zurück.
  return { ok: true, wert: b.art === "kommazahl" ? Math.round(roh * 10) / 10 : roh };
}

/**
 * Legt gespeicherte Werte über die Vorgaben.
 *
 * Unbekannte Schlüssel werden übergangen: Nach dem Entfernen einer Einstellung
 * bleibt ihr Wert womöglich in der Datenbank stehen, und er soll nicht als
 * Einstellung wiederauferstehen.
 */
export function mitVorgaben(gespeichert: Readonly<Record<string, number>>): Einstellungen {
  const ergebnis: Record<string, number> = { ...VORGABEN };
  for (const [schluessel, wert] of Object.entries(gespeichert)) {
    const geprueft = pruefeWert(schluessel, wert);
    if (geprueft.ok) ergebnis[schluessel] = geprueft.wert;
  }
  return ergebnis;
}

/** Welche Werte von der Vorgabe abweichen - für die Anzeige im Panel. */
export function abweichungen(e: Einstellungen): readonly string[] {
  return KATALOG.filter((b) => e[b.schluessel] !== b.vorgabe).map((b) => b.schluessel);
}

export function zahl(e: Einstellungen, schluessel: string): number {
  const wert = e[schluessel];
  return wert === undefined ? (VORGABEN[schluessel] ?? 0) : wert;
}

/**
 * Welche Wege der Bestätigung angeboten werden.
 *
 * Sind alle drei abgeschaltet, gelten wieder alle: Ohne Bestätigung nimmt das
 * Portal gar keine Bewertung an, und eine leere Auswahl wäre keine Einstellung,
 * sondern ein stillgelegtes Formular.
 */
export function erlaubteKontaktarten(e: Einstellungen): ("whatsapp" | "sms" | "email")[] {
  const erlaubt = (["whatsapp", "sms", "email"] as const).filter(
    (art) => zahl(e, `kontakt_${art}`) === 1,
  );
  return erlaubt.length > 0 ? [...erlaubt] : ["whatsapp", "sms", "email"];
}
