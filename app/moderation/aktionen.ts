"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sitzungscookie, SITZUNGSCOOKIE_NAMEN } from "@/domain/anmeldung";
import { melde } from "@/dienste/moderationsanmeldung";
import { zweiterFaktorPflicht } from "@/domain/zweiterfaktor";
import { verbindungIstSicher } from "../sichere-verbindung";
import {
  beendeSitzung,
  entscheide,
  entscheideMehrere,
  holeVorgang,
  kontaktEinsehen,
  zugang,
} from "@/db/moderation";
import { pruefeEntscheidung, pruefeSammelaktion, type Aktion, AKTIONEN } from "@/domain/moderation";
import type { Zustand } from "@/domain/bewertungsstatus";
import { holeAngemeldete, verlangeAnmeldung } from "./sitzung";
import {
  bestaetigeVonHand,
  BESTAETIGUNG_BEGRUENDUNG_MINDESTLAENGE,
  fuerErneutenVersand,
  merkeErneutenVersand,
} from "@/db/moderation";
import { erzeugeToken } from "@/domain/verifizierung";
import { baueBestaetigung, sende } from "@/versand/nachricht";
import { versandkette } from "@/versand/wege";
import { zaehle } from "@/domain/drosselung";
import { holeEinstellungen } from "@/db/einstellungen";
import { zahl } from "@/domain/einstellungen";

export interface Anmeldezustand {
  readonly meldung?: string;
  /**
   * Die zuletzt eingegebene Kennung.
   *
   * React setzt ein Formular nach einer Aktion zurück. Ohne dieses Feld stünde
   * nach jedem Fehlversuch auch die Kennung wieder leer da - und der zweite
   * Versuch scheiterte an einer leeren Eingabe statt am Kennwort.
   * Kennwort und Code kommen bewusst **nicht** zurück.
   */
  readonly kennung?: string;
}

export async function anmelden(_vorher: Anmeldezustand, formular: FormData): Promise<Anmeldezustand> {
  const kennung = String(formular.get("kennung") ?? "");
  const einstellungen = await holeEinstellungen();
  const ergebnis = await melde(
    zugang,
    {
      kennung,
      passwort: String(formular.get("passwort") ?? ""),
      code: String(formular.get("code") ?? ""),
    },
    new Date(),
    {
      zweiterFaktorPflicht: zweiterFaktorPflicht(einstellungen),
      sitzungsstunden: zahl(einstellungen, "sitzungsdauer_stunden"),
    },
  );

  if (!ergebnis.ok) return { meldung: ergebnis.meldung, kennung };

  // Entscheidend ist die Verbindung, nicht die Betriebsart: Ein `Secure`-Cookie
  // über http nimmt der Browser nicht an, und die Anmeldung liefe ins Leere
  // (siehe `app/sichere-verbindung.ts`).
  const sicher = await verbindungIstSicher();
  (await cookies()).set(sitzungscookie(sicher), ergebnis.sitzung.klartext, {
    httpOnly: true,
    secure: sicher,
    sameSite: "lax",
    path: "/",
    expires: ergebnis.sitzung.gueltigBis,
  });

  redirect("/moderation");
}

export async function abmelden(): Promise<void> {
  const speicher = await cookies();
  for (const name of SITZUNGSCOOKIE_NAMEN) {
    const wert = speicher.get(name)?.value;
    if (wert) await beendeSitzung(wert);
    speicher.delete(name);
  }
  redirect("/moderation/anmelden");
}

export interface Entscheidungszustand {
  readonly meldung?: string;
  readonly erledigt?: boolean;
  /** Wie bei der Anmeldung: React leert das Formular nach jeder Aktion. */
  readonly zusatz?: string;
  readonly grund?: string;
  /** Schlüssel für den Neuaufbau des Formulars, damit die Werte auch dastehen. */
  readonly versuch?: number;
}

function istAktion(wert: string): wert is Aktion {
  return (AKTIONEN as readonly string[]).includes(wert);
}

/**
 * Entscheidet über eine Bewertung.
 *
 * Der Zustand wird hier frisch gelesen und nicht aus dem Formular übernommen:
 * ein Formular, das seit zehn Minuten offen steht, weiß nicht, dass die
 * Bewertung inzwischen von jemand anderem bearbeitet wurde.
 */
export async function entscheiden(
  _vorher: Entscheidungszustand,
  formular: FormData,
): Promise<Entscheidungszustand> {
  const moderatorin = await verlangeAnmeldung();

  const bewertungId = String(formular.get("bewertung") ?? "");
  const rohAktion = String(formular.get("aktion") ?? "");
  const grund = (formular.get("grund") as string | null) ?? undefined;
  const zusatz = (formular.get("zusatz") as string | null) ?? undefined;
  const eingaben = { grund: grund ?? "", zusatz: zusatz ?? "", versuch: (_vorher.versuch ?? 0) + 1 };

  if (!istAktion(rohAktion)) return { ...eingaben, meldung: "Unbekannte Aktion." };

  const vorgang = await holeVorgang(bewertungId);
  if (vorgang === null) return { ...eingaben, meldung: "Diese Bewertung gibt es nicht mehr." };

  const geprueft = pruefeEntscheidung(vorgang.status as Zustand, {
    aktion: rohAktion,
    grundId: grund,
    zusatz,
  });

  if (!geprueft.ok) {
    return { ...eingaben, meldung: geprueft.fehler.map((f) => f.meldung).join(" ") };
  }

  const e = geprueft.entscheidung;
  const ok = await entscheide({
    bewertungId,
    moderatorId: moderatorin.id,
    aktion: e.aktion,
    vonStatus: vorgang.status as Zustand,
    nachStatus: e.nach,
    grundId: e.aktion === "spam" ? "spam" : (grund ?? null),
    begruendung: e.begruendung,
  });

  if (!ok) {
    return {
      ...eingaben,
      meldung: "Diese Bewertung wurde inzwischen von jemand anderem bearbeitet. Lade die Seite neu.",
    };
  }

  revalidatePath("/moderation");
  revalidatePath(`/moderation/${bewertungId}`);
  return { erledigt: true };
}

/** Zeigt den Kontakt im Klartext - und schreibt die Einsicht ins Protokoll. */
export async function kontaktZeigen(bewertungId: string): Promise<string | null> {
  const moderatorin = await holeAngemeldete();
  if (moderatorin === null) return null;
  const ergebnis = await kontaktEinsehen(bewertungId, moderatorin.id);
  return ergebnis?.klartext ?? null;
}

export interface Sammelzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Lehnt die ausgewählten Bewertungen ab.
 *
 * Nur Ablehnungen - eine Sammelfreigabe gibt es nicht. Wer hundert Bewertungen
 * auf einmal freigibt, hat keine davon angesehen, und die Freigabe ist die
 * Entscheidung, die niemandem auffällt, wenn sie falsch war.
 */
export async function sammelAblehnen(
  vorher: Sammelzustand,
  formular: FormData,
): Promise<Sammelzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  const geprueft = pruefeSammelaktion({
    ids: formular.getAll("auswahl").map(String),
    grundId: String(formular.get("grund") ?? ""),
    zusatz: (formular.get("zusatz") as string | null) ?? undefined,
  });
  if (!geprueft.ok) return { meldung: geprueft.meldung, versuch };

  const ergebnis = await entscheideMehrere(
    geprueft.ids,
    moderatorin.id,
    String(formular.get("grund")),
    geprueft.begruendung,
  );

  revalidatePath("/moderation");

  // Die übersprungenen ausdrücklich nennen: sonst bliebe unbemerkt, dass die
  // Sammelaktion an einer anderen Entscheidung vorbeigelaufen ist.
  const uebersprungen =
    ergebnis.uebersprungen === 0
      ? ""
      : ` ${ergebnis.uebersprungen} war${ergebnis.uebersprungen === 1 ? "" : "en"} inzwischen entschieden und blieb${
          ergebnis.uebersprungen === 1 ? "" : "en"
        } unberührt.`;

  return {
    erfolg: `${ergebnis.abgelehnt} Bewertung${ergebnis.abgelehnt === 1 ? "" : "en"} abgelehnt.${uebersprungen}`,
    versuch,
  };
}

export interface Bestaetigungszustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Schickt den Bestätigungslink noch einmal - der Regelweg.
 *
 * Zustellung scheitert: Postfach voll, Spamfilter, Tippfehler. Bis hierher gab
 * es dafür nichts; die Bewertung blieb liegen, und die Person hatte ihren
 * einen Versuch für diese Schule verbraucht. Der Kontakt wird dafür
 * entschlüsselt, aber nicht angezeigt - er geht direkt in den Versand.
 */
export async function bestaetigungErneutSenden(
  vorher: Bestaetigungszustand,
  formular: FormData,
): Promise<Bestaetigungszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;
  const bewertungId = String(formular.get("bewertung") ?? "");

  if (!zaehle("bestaetigung-erneut", moderatorin.id, 20, 3_600_000).erlaubt) {
    return { meldung: "Zwanzig erneute Versände je Stunde reichen. Bitte später noch einmal.", versuch };
  }

  const auftrag = await fuerErneutenVersand(bewertungId);
  if (auftrag === null) {
    return {
      meldung:
        "Hier ist nichts zu bestätigen: Das Konto ist bereits bestätigt, oder die Bewertung wartet nicht mehr darauf.",
      versuch,
    };
  }

  const token = erzeugeToken();
  const basis = process.env["BASIS_URL"] ?? "http://localhost:3000";
  const nachricht = baueBestaetigung(basis, token.klartext, auftrag.kontaktart);
  const ergebnis = await sende(
    versandkette(),
    auftrag.kontaktKlartext,
    auftrag.kontaktart,
    nachricht,
  );

  if (!ergebnis.ok) return { meldung: `Versand gescheitert: ${ergebnis.grund}`, versuch };

  await merkeErneutenVersand(auftrag, bewertungId, moderatorin.id, token);
  revalidatePath(`/moderation/${bewertungId}`);
  return { erfolg: `Neuer Bestätigungslink verschickt (${auftrag.kontaktart}).`, versuch };
}

/**
 * Bestätigt den Kontakt von Hand - die Ausnahme.
 *
 * **Sie ersetzt den Klick, nicht die Prüfung.** Die wartenden Bewertungen
 * gehen anschliessend denselben Weg wie nach einem echten Klick: Wer über der
 * Halteschwelle liegt, landet in der Moderation. Veröffentlicht wird dadurch
 * nichts, was nach einem echten Klick nicht auch veröffentlicht worden wäre.
 *
 * Nur die Leitung, nur mit geschriebener Begründung, eigene Protokollart. Das
 * ist Absicht: Der Weg soll erklärbar sein, nicht bequem. Wer ihn gewohnheits-
 * mässig benutzt, hebt die Zusage auf, dass jede Bewertung einen bestätigten
 * Kontakt hat - und das steht in den Nutzungsbedingungen.
 */
export async function vonHandBestaetigen(
  vorher: Bestaetigungszustand,
  formular: FormData,
): Promise<Bestaetigungszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Von Hand bestätigen darf nur die Leitung.", versuch };
  }

  const bewertungId = String(formular.get("bewertung") ?? "");
  const begruendung = String(formular.get("begruendung") ?? "").trim();
  if (begruendung.length < BESTAETIGUNG_BEGRUENDUNG_MINDESTLAENGE) {
    return {
      meldung: `Schreib auf, warum von Hand bestätigt wird - mindestens ${BESTAETIGUNG_BEGRUENDUNG_MINDESTLAENGE} Zeichen. Das steht später im Protokoll.`,
      versuch,
    };
  }

  const schwelle = zahl(await holeEinstellungen(), "halteschwelle");
  const ergebnis = await bestaetigeVonHand(bewertungId, moderatorin.id, begruendung, schwelle);
  if (ergebnis === null) {
    return { meldung: "Das Konto ist bereits bestätigt, oder die Bewertung gibt es nicht.", versuch };
  }

  revalidatePath(`/moderation/${bewertungId}`);
  revalidatePath("/moderation");
  return {
    erfolg:
      `Kontakt bestätigt. ${ergebnis.bewertungen} wartende Bewertung(en) weitergeleitet, ` +
      `davon ${ergebnis.veroeffentlicht} sofort veröffentlicht - der Rest liegt jetzt in der Moderation.`,
    versuch,
  };
}
