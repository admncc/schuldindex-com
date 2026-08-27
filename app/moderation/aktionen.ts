"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sitzungscookie, SITZUNGSCOOKIE_NAMEN } from "@/domain/anmeldung";
import { melde } from "@/dienste/moderationsanmeldung";
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

export interface Anmeldezustand {
  readonly meldung?: string;
  /**
   * Die zuletzt eingegebene Kennung.
   *
   * React setzt ein Formular nach einer Aktion zurück. Ohne dieses Feld stünde
   * nach jedem Fehlversuch auch die Kennung wieder leer da — und der zweite
   * Versuch scheiterte an einer leeren Eingabe statt am Kennwort.
   * Kennwort und Code kommen bewusst **nicht** zurück.
   */
  readonly kennung?: string;
}

export async function anmelden(_vorher: Anmeldezustand, formular: FormData): Promise<Anmeldezustand> {
  const kennung = String(formular.get("kennung") ?? "");
  const ergebnis = await melde(zugang, {
    kennung,
    passwort: String(formular.get("passwort") ?? ""),
    code: String(formular.get("code") ?? ""),
  });

  if (!ergebnis.ok) return { meldung: ergebnis.meldung, kennung };

  // In der Entwicklung läuft die Oberfläche über http; dort fällt sowohl
  // `Secure` als auch das `__Host-`-Präfix weg (siehe `sitzungscookie`).
  const sicher = process.env.NODE_ENV === "production";
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

/** Zeigt den Kontakt im Klartext — und schreibt die Einsicht ins Protokoll. */
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
 * Nur Ablehnungen — eine Sammelfreigabe gibt es nicht. Wer hundert Bewertungen
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
