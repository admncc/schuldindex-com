"use server";

import { revalidatePath } from "next/cache";
import { speichereEinstellungen } from "@/db/einstellungen";
import { KATALOG, beschreibung, pruefeWert } from "@/domain/einstellungen";
import { verlangeAnmeldung } from "../sitzung";
import { ANTHROPIC, entferneSchluessel, setzeSchluessel } from "@/db/geheimnisse";
import { sichtbarKeinSchluessel } from "@/domain/geheimnis";

export interface Einstellungszustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly fehler?: readonly { schluessel: string; meldung: string }[];
  readonly versuch?: number;
}

/**
 * Speichert die Einstellungen.
 *
 * Nur die Leitung. Diese Werte entscheiden, welche Bewertungen durchgehen und
 * welche ein Mensch ansieht - das ist keine Einstellung wie die Sortierung
 * einer Liste.
 */
export async function speichern(
  vorher: Einstellungszustand,
  formular: FormData,
): Promise<Einstellungszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Diese Werte darf nur die Leitung ändern.", versuch };
  }

  const fehler: { schluessel: string; meldung: string }[] = [];
  const aenderungen: { schluessel: string; wert: number }[] = [];

  for (const b of KATALOG) {
    const roh = formular.get(b.schluessel);
    if (roh === null) continue;

    const geprueft = pruefeWert(b.schluessel, String(roh));
    if (geprueft.ok) aenderungen.push({ schluessel: b.schluessel, wert: geprueft.wert });
    else fehler.push({ schluessel: b.schluessel, meldung: geprueft.meldung });
  }

  // Bei einem Fehler wird gar nichts gespeichert: Eine halb übernommene
  // Einstellungsseite ist schlimmer als eine abgelehnte - niemand wüsste
  // hinterher, welche Hälfte gilt.
  if (fehler.length > 0) {
    return { meldung: "Nichts gespeichert - bitte sieh dir die markierten Felder an.", fehler, versuch };
  }

  const ergebnis = await speichereEinstellungen(aenderungen, moderatorin.id);
  revalidatePath("/moderation/einstellungen");

  if (ergebnis.geaendert.length === 0) return { erfolg: "Nichts geändert.", versuch };

  const liste = ergebnis.geaendert
    .map((g) => `${beschreibung(g.schluessel)?.label ?? g.schluessel}: ${g.alt ?? "Vorgabe"} → ${g.neu}`)
    .join(" · ");
  return { erfolg: `Gespeichert. ${liste}`, versuch };
}

export interface Schluesselzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Hinterlegt den Claude-Schlüssel.
 *
 * Der Klartext geht durch diese Funktion und nirgendwo sonst hin: Er wird
 * verschlüsselt gespeichert, im Protokoll steht nur, **dass** ein Schlüssel
 * gesetzt wurde, und die Antwort an das Formular enthält ihn nicht.
 */
export async function schluesselSetzen(
  vorher: Schluesselzustand,
  formular: FormData,
): Promise<Schluesselzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Den Schlüssel darf nur die Leitung setzen.", versuch };
  }

  const klartext = String(formular.get("schluessel") ?? "").trim();
  const beanstandung = sichtbarKeinSchluessel(klartext);
  if (beanstandung !== null) return { meldung: beanstandung, versuch };

  await setzeSchluessel(ANTHROPIC, klartext, moderatorin.id);
  revalidatePath("/moderation/einstellungen");
  return { erfolg: "Schlüssel gespeichert. Der nächste Zusammenfassungslauf benutzt ihn.", versuch };
}

export async function schluesselEntfernen(
  vorher: Schluesselzustand,
  _formular: FormData,
): Promise<Schluesselzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Den Schlüssel darf nur die Leitung entfernen.", versuch };
  }

  await entferneSchluessel(ANTHROPIC, moderatorin.id);
  revalidatePath("/moderation/einstellungen");
  return { erfolg: "Schlüssel entfernt.", versuch };
}
