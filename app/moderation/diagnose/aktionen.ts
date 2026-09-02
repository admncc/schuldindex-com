"use server";

import { revalidatePath } from "next/cache";
import { beendeZugang, schalteFrei } from "@/db/diagnosezugang";
import { istZugangsdauer } from "@/domain/diagnose";
import { protokolliere } from "@/db/ereignisse";
import { verlangeAnmeldung } from "../sitzung";

export interface Zugangszustand {
  readonly meldung?: string;
  /** Wird genau einmal angezeigt und nirgends gespeichert. */
  readonly kennwort?: string;
  readonly gueltigBis?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Schaltet den Diagnosezugang frei.
 *
 * Nur die Leitung. Ein Zugang, der den Zustand des ganzen Systems ausliest,
 * ist keine Moderationsaufgabe - und wer ihn freischaltet, steht hinterher im
 * Protokoll.
 */
export async function zugangFreischalten(
  vorher: Zugangszustand,
  formular: FormData,
): Promise<Zugangszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Den Diagnosezugang darf nur die Leitung freischalten.", versuch };
  }

  const stunden = Number(formular.get("stunden") ?? "0");
  if (!istZugangsdauer(stunden)) return { meldung: "Ungültige Dauer.", versuch };

  const { klartext, gueltigBis } = await schalteFrei(moderatorin.id, stunden);
  await protokolliere({
    art: "info",
    bereich: "diagnose",
    meldung: `Diagnosezugang freigeschaltet für ${stunden} Stunden`,
    einzelheiten: { von: moderatorin.kennung },
  });
  revalidatePath("/moderation/diagnose");

  return { kennwort: klartext, gueltigBis: gueltigBis.toISOString(), versuch };
}

export async function zugangBeenden(
  vorher: Zugangszustand,
  _formular: FormData,
): Promise<Zugangszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Den Diagnosezugang darf nur die Leitung beenden.", versuch };
  }

  const gab = await beendeZugang(moderatorin.id);
  await protokolliere({
    art: "info",
    bereich: "diagnose",
    meldung: gab ? "Diagnosezugang beendet" : "Beenden angefordert, es war keiner offen",
    einzelheiten: { von: moderatorin.kennung },
  });
  revalidatePath("/moderation/diagnose");

  return {
    erfolg: gab ? "Zugang beendet. Das Kennwort ist ab sofort wertlos." : "Es war kein Zugang offen.",
    versuch,
  };
}
