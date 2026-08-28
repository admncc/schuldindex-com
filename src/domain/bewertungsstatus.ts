/**
 * Zustände einer Bewertung und die erlaubten Übergänge.
 *
 * Als ausdrückliche Tabelle geführt, nicht als verstreute Wenn-Bedingungen.
 * Fehler in Zustandsübergängen sind besonders teuer: eine Bewertung, die aus
 * „abgelehnt“ zurück in „freigegeben“ rutscht, veröffentlicht Inhalte, die ein
 * Mensch bewusst gestoppt hat - und niemand bemerkt es.
 */

export const ZUSTAENDE = [
  "wartet_auf_verifizierung",
  "in_pruefung_geo",
  "in_pruefung_betrug",
  "freigegeben",
  "abgelehnt",
] as const;

export type Zustand = (typeof ZUSTAENDE)[number];

export const ZUSTAND_LABEL: Readonly<Record<Zustand, string>> = {
  wartet_auf_verifizierung: "Warten auf Bestätigung",
  in_pruefung_geo: "Wird geprüft",
  in_pruefung_betrug: "Wird geprüft",
  freigegeben: "Veröffentlicht",
  abgelehnt: "Abgelehnt",
};

/**
 * Was die bewertende Person sieht.
 *
 * Die beiden Prüfzustände tragen **denselben** Text. Der Unterschied gehört in
 * die Moderation, nicht nach außen: „Ihre Bewertung wurde wegen auffälliger
 * Muster gehalten“ verrät jemandem, der es darauf anlegt, welche Prüfung
 * angeschlagen hat.
 */
export const ZUSTAND_HINWEIS: Readonly<Record<Zustand, string>> = {
  wartet_auf_verifizierung: "Bitte bestätige deine Bewertung über den Link, den wir dir geschickt haben.",
  in_pruefung_geo: "Deine Bewertung wird geprüft. Das dauert in der Regel ein bis zwei Tage.",
  in_pruefung_betrug: "Deine Bewertung wird geprüft. Das dauert in der Regel ein bis zwei Tage.",
  freigegeben: "Deine Bewertung ist veröffentlicht.",
  abgelehnt: "Deine Bewertung wurde nicht veröffentlicht.",
};

export type Ausloeser =
  | "verifiziert"          // Konto bestätigt, automatische Prüfung läuft
  | "pruefung_bestanden"
  | "pruefung_geo"
  | "pruefung_betrug"
  | "moderation_freigeben"
  | "moderation_ablehnen"
  | "bearbeitet";          // Person ändert ihre Bewertung

/**
 * Erlaubte Übergänge. Alles, was hier nicht steht, ist verboten.
 *
 * Zwei Festlegungen, die eine Begründung verdienen:
 *
 *  - **Aus „abgelehnt“ führt kein Weg zurück.** Eine erneute Abgabe legt eine
 *    neue Bewertung an. Sonst könnte ein Fehlgriff in der Oberfläche eine
 *    bewusst gestoppte Bewertung wieder online bringen.
 *  - **Eine Bearbeitung führt zurück in die Prüfung**, nicht direkt zurück
 *    online. Sonst ließe sich eine harmlose Bewertung freigeben und danach
 *    beliebig umschreiben.
 */
const UEBERGAENGE: Readonly<Record<Zustand, Partial<Record<Ausloeser, Zustand>>>> = {
  wartet_auf_verifizierung: {
    verifiziert: "in_pruefung_betrug", // Zwischenzustand, bis die Prüfung entscheidet
    pruefung_bestanden: "freigegeben",
    pruefung_geo: "in_pruefung_geo",
    pruefung_betrug: "in_pruefung_betrug",
    // Wer seine Bewertung ändert, bevor er sie bestätigt hat, wartet danach
    // weiter auf die Bestätigung. Ohne diesen Übergang scheiterte die Änderung.
    bearbeitet: "wartet_auf_verifizierung",
  },
  in_pruefung_geo: {
    moderation_freigeben: "freigegeben",
    moderation_ablehnen: "abgelehnt",
    // Eine Änderung am Text ändert nichts am Ort der Abgabe: der Geo-Verdacht
    // bleibt bestehen, die Bewertung behält ihren Platz in der Warteschlange.
    bearbeitet: "in_pruefung_geo",
  },
  in_pruefung_betrug: {
    pruefung_bestanden: "freigegeben",
    moderation_freigeben: "freigegeben",
    moderation_ablehnen: "abgelehnt",
    bearbeitet: "in_pruefung_betrug",
  },
  freigegeben: {
    bearbeitet: "in_pruefung_betrug",
    moderation_ablehnen: "abgelehnt",
  },
  abgelehnt: {},
};

export interface Uebergangsfehler {
  readonly von: Zustand;
  readonly ausloeser: Ausloeser;
  readonly grund: string;
}

export type Uebergangsergebnis =
  | { readonly ok: true; readonly nach: Zustand }
  | { readonly ok: false; readonly fehler: Uebergangsfehler };

export function wechsle(von: Zustand, ausloeser: Ausloeser): Uebergangsergebnis {
  const nach = UEBERGAENGE[von][ausloeser];
  if (nach === undefined) {
    return {
      ok: false,
      fehler: {
        von,
        ausloeser,
        grund:
          von === "abgelehnt"
            ? "Eine abgelehnte Bewertung bleibt abgelehnt. Eine erneute Abgabe legt eine neue an."
            : `Aus „${ZUSTAND_LABEL[von]}“ ist „${ausloeser}“ nicht vorgesehen.`,
      },
    };
  }
  return { ok: true, nach };
}

export function istErlaubt(von: Zustand, ausloeser: Ausloeser): boolean {
  return wechsle(von, ausloeser).ok;
}

/** Zustände, die in der Moderationswarteschlange auftauchen. */
export const WARTESCHLANGE: readonly Zustand[] = ["in_pruefung_geo", "in_pruefung_betrug"];

/** Zustände, deren Bewertungen in Score und Ranglisten eingehen. */
export const OEFFENTLICH: readonly Zustand[] = ["freigegeben"];

export function istOeffentlich(zustand: Zustand): boolean {
  return OEFFENTLICH.includes(zustand);
}
