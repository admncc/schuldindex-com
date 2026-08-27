"use server";

import { revalidatePath } from "next/cache";
import { gibAnfrageFrei, lehneAnfrageAb } from "@/db/schulzugang";
import { verlangeAnmeldung } from "../sitzung";

export interface Pruefzustand {
  readonly meldung?: string;
  readonly link?: string;
  readonly kontakt?: string | undefined;
  readonly versuch?: number;
}

/**
 * Gibt eine von Hand geprüfte Anfrage frei.
 *
 * Der Link wird hier angezeigt und nicht verschickt: die Redaktion hat die
 * Schule bei dieser Prüfung ohnehin gerade am Telefon oder im Schriftverkehr,
 * und wohin er gehen soll, hat gerade ein Mensch entschieden.
 */
export async function freigeben(vorher: Pruefzustand, formular: FormData): Promise<Pruefzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;
  const id = String(formular.get("anfrage") ?? "");

  const ergebnis = await gibAnfrageFrei(id, moderatorin.id);
  if (ergebnis === null) return { meldung: "Diese Anfrage wurde bereits entschieden.", versuch };

  const basis = process.env["BASIS_URL"] ?? "http://localhost:3000";
  revalidatePath("/moderation/schulzugang");

  return {
    link: `${basis}/schulsupport/eintreten?token=${ergebnis.link}`,
    kontakt: ergebnis.kontakt ?? undefined,
    versuch,
  };
}

export async function ablehnen(vorher: Pruefzustand, formular: FormData): Promise<Pruefzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;
  const id = String(formular.get("anfrage") ?? "");
  const grund = String(formular.get("grund") ?? "").trim();

  if (grund.length < 10) {
    return { meldung: "Bitte halte in einem Satz fest, warum die Anfrage abgelehnt wird.", versuch };
  }

  const ok = await lehneAnfrageAb(id, moderatorin.id, grund);
  if (!ok) return { meldung: "Diese Anfrage wurde bereits entschieden.", versuch };

  revalidatePath("/moderation/schulzugang");
  return { meldung: "Abgelehnt und vermerkt.", versuch };
}
