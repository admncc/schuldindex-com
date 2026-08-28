"use server";

import { revalidatePath } from "next/cache";
import { entscheideMeldung } from "@/db/meldungen";
import { RECHTSBEHELFSHINWEIS } from "@/domain/meldungsstatus";
import { verlangeAnmeldung } from "../sitzung";

export interface Entscheidungszustand {
  readonly meldung?: string;
  readonly erledigt?: boolean;
  readonly text?: string;
  /**
   * Zählt die Versuche und dient dem Formular als Schlüssel.
   *
   * React leert das Formular nach jeder Aktion im DOM. Ohne den Neuaufbau
   * stünde die eben geschriebene Begründung nach einer Rückmeldung nicht mehr
   * da - und weil das Feld verpflichtend ist, bliebe der nächste Klick auf
   * „Inhalt entfernt“ wirkungslos.
   */
  readonly versuch?: number;
}

const MINDESTLAENGE = 20;

/**
 * Entscheidet über eine Meldung.
 *
 * Die Begründung geht an die meldende Person, deshalb die Mindestlänge - und
 * deshalb hängt das System den Rechtsbehelfshinweis selbst an, statt sich darauf
 * zu verlassen, dass ihn jemand mitschreibt (Art. 16 Abs. 5 DSA).
 */
export async function entscheiden(
  _vorher: Entscheidungszustand,
  formular: FormData,
): Promise<Entscheidungszustand> {
  const moderatorin = await verlangeAnmeldung();

  const id = String(formular.get("meldung") ?? "");
  const roh = String(formular.get("status") ?? "");
  const text = String(formular.get("begruendung") ?? "").trim();

  const versuch = (_vorher.versuch ?? 0) + 1;

  if (roh !== "erledigt" && roh !== "abgelehnt") {
    return { meldung: "Bitte wähle, wie entschieden wird.", text, versuch };
  }
  if (text.length < MINDESTLAENGE) {
    return {
      meldung: "Die Begründung geht an die meldende Person - bitte schreib sie aus.",
      text,
      versuch,
    };
  }

  const ok = await entscheideMeldung(id, moderatorin.id, roh, `${text}\n\n${RECHTSBEHELFSHINWEIS}`);
  if (!ok) {
    return { meldung: "Diese Meldung wurde inzwischen von jemand anderem entschieden.", text, versuch };
  }

  revalidatePath("/moderation/meldungen");
  return { erledigt: true };
}
