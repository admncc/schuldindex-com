"use server";

import { revalidatePath } from "next/cache";
import { fuehreRegelAus } from "@/db/aufraeumen";
import { loescheDemodaten } from "@/db/demodaten";
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
 * der das übernimmt (Vorgabe vom 27.08.2026). Was hier gelöscht wird, ist weg -
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

/**
 * Entfernt die Demodaten.
 *
 * Getrennt von den Aufbewahrungsregeln, obwohl beides löscht: Die Regeln setzen
 * eine Zusage aus der Datenschutzerklärung um, das hier räumt einen Testbestand
 * weg. Sie in einen Topf zu werfen hieße, das Protokoll unlesbar zu machen.
 */
export async function demodatenLoeschen(
  vorher: Loeschzustand,
  _formular: FormData,
): Promise<Loeschzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Demodaten darf nur die Leitung löschen.", versuch };
  }

  const geloescht = await loescheDemodaten(moderatorin.id);
  revalidatePath("/moderation/aufbewahrung");
  revalidatePath("/");

  return {
    erfolg:
      geloescht.bewertungen === 0
        ? "Es lagen keine Demodaten vor."
        : `${geloescht.bewertungen.toLocaleString("de-DE")} Demobewertungen und ` +
          `${geloescht.konten.toLocaleString("de-DE")} Demokonten gelöscht, ` +
          `${geloescht.schulen.toLocaleString("de-DE")} Schulwertungen neu gerechnet.`,
    versuch,
  };
}
