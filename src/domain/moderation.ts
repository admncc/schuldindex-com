/**
 * Entscheidungen der Moderation.
 *
 * Die Zustandsmaschine (`bewertungsstatus.ts`) sagt, welcher Übergang möglich
 * ist. Hier steht, was eine Moderatorin dafür beibringen muss: eine Begründung
 * bei jeder Ablehnung, einen Text bei jeder Rückfrage. Beides ist keine
 * Förmlichkeit — die Begründung geht an die betroffene Person und muss im
 * Streitfall die Entscheidung tragen (DSA Art. 17).
 */

import { wechsle, type Ausloeser, type Zustand } from "./bewertungsstatus";

export const AKTIONEN = ["freigeben", "ablehnen", "rueckfrage", "spam"] as const;
export type Aktion = (typeof AKTIONEN)[number];

export const AKTION_LABEL: Readonly<Record<Aktion, string>> = {
  freigeben: "Freigeben",
  ablehnen: "Ablehnen",
  rueckfrage: "Rückfrage stellen",
  spam: "Als Spam ablehnen",
};

export interface Ablehnungsgrund {
  readonly id: string;
  /** Was in der Warteschlange steht. */
  readonly kurz: string;
  /** Was die betroffene Person zu lesen bekommt. */
  readonly text: string;
}

/**
 * Vorlagen für Ablehnungen.
 *
 * Vorlagen statt freier Eingabe, weil fünf Moderatorinnen sonst fünf
 * unterschiedlich harte Begründungen für denselben Sachverhalt schreiben. Ein
 * Zusatz in eigenen Worten ist möglich, die Vorlage bleibt der Kern.
 */
export const ABLEHNUNGSGRUENDE: readonly Ablehnungsgrund[] = [
  {
    id: "person",
    kurz: "Nennt eine Person",
    text: "Deine Bewertung nennt eine einzelne Lehrkraft oder Mitschülerin erkennbar. Das veröffentlichen wir nicht — schreib bitte über die Schule, nicht über einzelne Menschen.",
  },
  {
    id: "beleidigung",
    kurz: "Beleidigung",
    text: "Deine Bewertung enthält Beschimpfungen. Kritik ist willkommen, Beleidigungen nicht.",
  },
  {
    id: "unwahr",
    kurz: "Nachweislich unzutreffend",
    text: "Die Angaben in deiner Bewertung treffen nach unserer Prüfung nicht zu.",
  },
  {
    id: "kein_bezug",
    kurz: "Kein Bezug zur Schule",
    text: "Deine Bewertung lässt keinen Bezug zu dieser Schule erkennen.",
  },
  {
    id: "werbung",
    kurz: "Werbung oder Verweise",
    text: "Deine Bewertung enthält Werbung oder Verweise auf andere Angebote.",
  },
  {
    id: "mehrfach",
    kurz: "Mehrfachabgabe",
    text: "Zu dieser Schule liegt von dir bereits eine Bewertung vor. Bearbeite die bestehende, statt eine zweite abzugeben.",
  },
  {
    id: "spam",
    kurz: "Spam",
    text: "Deine Bewertung wurde als automatisiert oder missbräuchlich eingestuft.",
  },
];

export function ablehnungsgrund(id: string): Ablehnungsgrund | null {
  return ABLEHNUNGSGRUENDE.find((g) => g.id === id) ?? null;
}

/** Die Vorlage, die „Als Spam ablehnen“ ohne Nachfrage setzt. */
export const SPAMGRUND = "spam";

export interface Entscheidung {
  readonly aktion: Aktion;
  /** Vorlagenkennung, nur bei `ablehnen`. */
  readonly grundId?: string | undefined;
  /** Eigener Zusatz zur Vorlage, bei `rueckfrage` der ganze Text. */
  readonly zusatz?: string | undefined;
}

export interface Entscheidungsfehler {
  readonly feld: "aktion" | "grundId" | "zusatz";
  readonly meldung: string;
}

export interface GeprueftEntscheidung {
  readonly aktion: Aktion;
  readonly ausloeser: Ausloeser | null;
  /** Zielzustand, `null` bei einer Rückfrage — die lässt den Zustand stehen. */
  readonly nach: Zustand | null;
  /** Vollständiger Text für die betroffene Person und das Protokoll. */
  readonly begruendung: string;
}

export type Pruefergebnis =
  | { readonly ok: true; readonly entscheidung: GeprueftEntscheidung }
  | { readonly ok: false; readonly fehler: readonly Entscheidungsfehler[] };

/** Rückfragen dürfen nicht als Umweg für eine Nachricht ohne Inhalt dienen. */
const RUECKFRAGE_MINDESTLAENGE = 15;

/**
 * Prüft eine Entscheidung, bevor sie die Datenbank berührt.
 *
 * Eine Rückfrage ist bewusst **kein** eigener Zustand. Die Bewertung bleibt in
 * der Prüfung stehen und behält damit ihren Platz in der Warteschlange; nur so
 * fällt sie nicht aus der 48-Stunden-Zusage heraus, während auf eine Antwort
 * gewartet wird.
 */
export function pruefeEntscheidung(zustand: Zustand, e: Entscheidung, jetzt = new Date()): Pruefergebnis {
  const fehler: Entscheidungsfehler[] = [];
  const zusatz = (e.zusatz ?? "").trim();

  if (e.aktion === "rueckfrage") {
    if (zustand !== "in_pruefung_geo" && zustand !== "in_pruefung_betrug") {
      fehler.push({ feld: "aktion", meldung: "Eine Rückfrage ist nur zu einer Bewertung in Prüfung möglich." });
    }
    if (zusatz.length < RUECKFRAGE_MINDESTLAENGE) {
      fehler.push({ feld: "zusatz", meldung: "Schreib die Rückfrage aus — mindestens ein vollständiger Satz." });
    }
    if (fehler.length > 0) return { ok: false, fehler };
    return {
      ok: true,
      entscheidung: { aktion: "rueckfrage", ausloeser: null, nach: null, begruendung: zusatz },
    };
  }

  const ausloeser: Ausloeser = e.aktion === "freigeben" ? "moderation_freigeben" : "moderation_ablehnen";
  const uebergang = wechsle(zustand, ausloeser);
  if (!uebergang.ok) fehler.push({ feld: "aktion", meldung: uebergang.fehler.grund });

  let begruendung = zusatz;
  if (e.aktion === "ablehnen" || e.aktion === "spam") {
    const id = e.aktion === "spam" ? SPAMGRUND : e.grundId;
    const vorlage = id === undefined ? null : ablehnungsgrund(id);
    if (vorlage === null) {
      fehler.push({ feld: "grundId", meldung: "Wähle einen Ablehnungsgrund aus." });
    } else {
      begruendung = zusatz === "" ? vorlage.text : `${vorlage.text}\n\n${zusatz}`;
    }
  }

  if (fehler.length > 0) return { ok: false, fehler };
  void jetzt;
  return {
    ok: true,
    entscheidung: {
      aktion: e.aktion,
      ausloeser,
      nach: uebergang.ok ? uebergang.nach : null,
      begruendung,
    },
  };
}

/**
 * Wie viele Bewertungen eine Sammelaktion höchstens umfasst.
 *
 * Nicht aus technischen Gründen — die Datenbank schafft auch tausend. Die
 * Grenze ist da, weil eine Sammelablehnung die einzige Stelle im ganzen Portal
 * ist, an der ein einzelner Klick hunderte Menschen trifft. Wer mehr ablehnen
 * will, muss es zweimal tun und sieht dazwischen, was er getan hat.
 */
export const MAX_SAMMELAKTION = 100;

export interface Sammelaktion {
  readonly ids: readonly string[];
  readonly grundId: string;
  readonly zusatz?: string | undefined;
}

export type Sammelpruefung =
  | { readonly ok: true; readonly ids: readonly string[]; readonly begruendung: string }
  | { readonly ok: false; readonly meldung: string };

/**
 * Prüft eine Sammelablehnung.
 *
 * Nur Ablehnungen: eine Sammelfreigabe gibt es nicht. Wer hundert Bewertungen
 * auf einmal freigibt, hat keine davon angesehen — und die Freigabe ist die
 * Entscheidung, die niemand zurücknimmt, weil sie niemandem auffällt.
 */
export function pruefeSammelaktion(a: Sammelaktion): Sammelpruefung {
  const ids = [...new Set(a.ids.filter((id) => id !== ""))];

  if (ids.length === 0) return { ok: false, meldung: "Es ist nichts ausgewählt." };
  if (ids.length > MAX_SAMMELAKTION) {
    return {
      ok: false,
      meldung: `Höchstens ${MAX_SAMMELAKTION} auf einmal. Ausgewählt sind ${ids.length}.`,
    };
  }

  const vorlage = ablehnungsgrund(a.grundId);
  if (vorlage === null) return { ok: false, meldung: "Wähle einen Ablehnungsgrund aus." };

  const zusatz = (a.zusatz ?? "").trim();
  return {
    ok: true,
    ids,
    begruendung: zusatz === "" ? vorlage.text : `${vorlage.text}\n\n${zusatz}`,
  };
}

/** Zusage an die Nutzenden: innerhalb von 48 Stunden ist entschieden. */
export const ZIEL_REAKTION_STUNDEN = 48;

/** Ab hier ist ein Eintrag ein Betriebsvorfall, kein Rückstand mehr. */
export const ALARM_ALTER_STUNDEN = 72;

/** Ab dieser Länge schafft die Besetzung die Warteschlange nicht mehr. */
export const ALARM_LAENGE = 100;

export type Dringlichkeit = "neu" | "faellig" | "ueberfaellig";

export const DRINGLICHKEIT_LABEL: Readonly<Record<Dringlichkeit, string>> = {
  // Nicht „Neu“: ein Eintrag, der 46 Stunden liegt, ist nicht neu — er ist
  // gerade noch in der Frist.
  neu: "In Frist",
  faellig: "Fällig",
  ueberfaellig: "Überfällig",
};

export function alterInStunden(erstelltAm: Date, jetzt = new Date()): number {
  return (jetzt.getTime() - erstelltAm.getTime()) / 3600_000;
}

export function dringlichkeit(erstelltAm: Date, jetzt = new Date()): Dringlichkeit {
  const alter = alterInStunden(erstelltAm, jetzt);
  if (alter >= ALARM_ALTER_STUNDEN) return "ueberfaellig";
  if (alter >= ZIEL_REAKTION_STUNDEN) return "faellig";
  return "neu";
}

export interface Warteschlangenlage {
  readonly laenge: number;
  readonly aeltesterEintragAm: Date | null;
}

/**
 * Der Alarm aus Abschnitt 8 des Entwicklungsplans.
 *
 * Bewusst zwei Auslöser: die Länge zeigt einen Ansturm, das Alter zeigt eine
 * unbesetzte Moderation. Eine kurze Schlange mit einem drei Tage alten Eintrag
 * ist der schlimmere Fall — und der, den eine reine Längenmessung übersieht.
 */
export function warteschlangenalarm(lage: Warteschlangenlage, jetzt = new Date()): readonly string[] {
  const alarme: string[] = [];
  if (lage.laenge > ALARM_LAENGE) {
    alarme.push(`Die Warteschlange hat ${lage.laenge} Einträge (Grenze ${ALARM_LAENGE}).`);
  }
  if (lage.aeltesterEintragAm !== null) {
    const alter = alterInStunden(lage.aeltesterEintragAm, jetzt);
    if (alter >= ALARM_ALTER_STUNDEN) {
      alarme.push(`Der älteste Eintrag wartet seit ${Math.floor(alter)} Stunden (Grenze ${ALARM_ALTER_STUNDEN}).`);
    }
  }
  return alarme;
}
