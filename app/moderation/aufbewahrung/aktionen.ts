"use server";

import { revalidatePath } from "next/cache";
import { fuehreRegelAus } from "@/db/aufraeumen";
import { REGELN, regel, type Aufbewahrungsart } from "@/domain/aufbewahrung";
import { verlangeAnmeldung } from "../sitzung";

export interface Loeschzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

function istArt(wert: string): wert is Aufbewahrungsart {
  return REGELN.some((r) => r.art === wert);
}

/**
 * Führt eine Aufbewahrungsregel aus.
 *
 * Nur die Leitung, und nur auf ausdrücklichen Klick: es gibt keinen Zeitplan,
 * der das übernimmt (Vorgabe vom 27.08.2026). Was hier gelöscht wird, ist weg —
 * deshalb steht die Zahl vorher auf der Seite und der Vorgang danach im
 * Protokoll.
 */
export async function regelAusfuehren(
  vorher: Loeschzustand,
  formular: FormData,
): Promise<Loeschzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Eine Löschung darf nur die Leitung auslösen.", versuch };
  }

  const roh = String(formular.get("art") ?? "");
  if (!istArt(roh)) return { meldung: "Unbekannte Regel.", versuch };

  const betroffen = await fuehreRegelAus(roh, moderatorin.id);
  revalidatePath("/moderation/aufbewahrung");

  return {
    erfolg:
      betroffen === 0
        ? `${regel(roh).gegenstand}: nichts war fällig.`
        : `${regel(roh).gegenstand}: ${betroffen.toLocaleString("de-DE")} Datensätze gelöscht.`,
    versuch,
  };
}
