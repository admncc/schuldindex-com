"use server";

import { revalidatePath } from "next/cache";
import { gewinnerkontakt, merkeBenachrichtigung, ziehen } from "@/db/verlosung";
import { GEWINNE, VERLOSUNG_LABEL, istVerlosungsart, monatsname } from "@/domain/verlosung";
import { verlangeAnmeldung } from "../sitzung";

export interface Ziehungszustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Zieht einen Monat.
 *
 * Nur die Leitung: eine Ziehung lässt sich nicht rückgängig machen, und wer
 * sie auslöst, steht im Protokoll der Verlosung.
 */
export async function monatZiehen(
  vorher: Ziehungszustand,
  formular: FormData,
): Promise<Ziehungszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Eine Ziehung darf nur die Leitung auslösen.", versuch };
  }

  const jahr = Number(formular.get("jahr"));
  const monat = Number(formular.get("monat"));
  const rohArt = String(formular.get("art") ?? "normal");
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || monat < 1 || monat > 12) {
    return { meldung: "Bitte wähle einen gültigen Monat.", versuch };
  }
  if (!istVerlosungsart(rohArt)) {
    return { meldung: "Diese Ziehung gibt es nicht.", versuch };
  }

  // Ein laufender Monat wird nicht gezogen: es kämen laufend Lose hinzu, und
  // die Ziehung wäre nicht nachvollziehbar.
  const jetzt = new Date();
  const abgelaufen = new Date(Date.UTC(jahr, monat, 1)) <= jetzt;
  if (!abgelaufen) {
    return { meldung: "Dieser Monat läuft noch. Gezogen wird erst nach seinem Ende.", versuch };
  }

  const ergebnis = await ziehen(jahr, monat, moderatorin.id, rohArt);
  if (!ergebnis.ok) {
    return {
      meldung:
        ergebnis.grund === "schon_gezogen"
          ? "Für diesen Monat wurde bereits gezogen. Eine zweite Ziehung gibt es nicht."
          : "Für diesen Monat liegen keine Lose vor.",
      versuch,
    };
  }

  revalidatePath("/moderation/verlosung");
  revalidatePath("/verlosung");

  return {
    erfolg:
      ergebnis.ziehung.gewinner_konto_id === null
        ? `${VERLOSUNG_LABEL[rohArt]} ${monatsname(jahr, monat)}: keine Teilnahmen. Der Monat ist vermerkt.`
        : `${VERLOSUNG_LABEL[rohArt]} ${monatsname(jahr, monat)}: ${Math.min(
            GEWINNE[rohArt].anzahl,
            ergebnis.ziehung.lose_gesamt,
          )} von ${ergebnis.ziehung.lose_gesamt} Losen gezogen.`,
    versuch,
  };
}

/** Zeigt den Kontakt der gewinnenden Person - für die Benachrichtigung von Hand. */
export async function kontaktZeigen(gewinnId: string): Promise<string | null> {
  const moderatorin = await verlangeAnmeldung();
  if (moderatorin.rolle !== "leitung") return null;
  return (await gewinnerkontakt(gewinnId))?.klartext ?? null;
}

/**
 * Hält fest, dass die gewinnende Person benachrichtigt wurde.
 *
 * Von Hand, solange kein Versandweg steht: die Moderation schreibt die Nachricht
 * selbst und vermerkt es hier. Ohne diesen Vermerk wüsste beim nächsten Blick
 * niemand, ob die Benachrichtigung schon heraus ist.
 */
export async function benachrichtigungVermerken(formular: FormData): Promise<void> {
  await verlangeAnmeldung();
  const id = String(formular.get("gewinn") ?? "");
  if (id !== "") await merkeBenachrichtigung(id);
  revalidatePath("/moderation/verlosung");
}
