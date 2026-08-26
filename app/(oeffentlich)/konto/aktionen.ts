"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { KONTOCOOKIE_NAMEN } from "@/domain/kontozugang";
import { fordereAnmeldelinkAn } from "@/dienste/kontozugang";
import {
  beendeAlleSitzungen,
  beendeKontositzung,
  kontoumgebung,
  loescheBewertung,
  loescheKonto,
} from "@/db/konto";
import { istKontaktart } from "@/domain/kontakt";
import { holeAngemeldetesKonto, verlangeKonto } from "./sitzung";

export interface Anmeldezustand {
  readonly meldung?: string;
  readonly kontakt?: string;
  readonly versuch?: number;
}

/** Fordert einen Anmeldelink an. Die Antwort ist immer dieselbe. */
export async function linkAnfordern(
  vorher: Anmeldezustand,
  formular: FormData,
): Promise<Anmeldezustand> {
  const kontakt = String(formular.get("kontakt") ?? "");
  const rohArt = String(formular.get("kontaktart") ?? "");
  const art = istKontaktart(rohArt) ? rohArt : "email";
  const versuch = (vorher.versuch ?? 0) + 1;

  const basis = process.env["BASIS_URL"] ?? "http://localhost:3000";
  const ergebnis = await fordereAnmeldelinkAn(kontoumgebung(basis), { kontakt, art });

  // `intern` bleibt hier: es sagt, ob es das Konto gibt, und darf den Server
  // nicht verlassen (siehe `dienste/kontozugang.ts`).
  return { meldung: ergebnis.meldung, kontakt, versuch };
}

export async function abmelden(): Promise<void> {
  const speicher = await cookies();
  for (const name of KONTOCOOKIE_NAMEN) {
    const wert = speicher.get(name)?.value;
    if (wert) await beendeKontositzung(wert);
    speicher.delete(name);
  }
  redirect("/");
}

/** Meldet alle Geräte ab — für den Fall, dass ein Telefon verlorengeht. */
export async function ueberallAbmelden(): Promise<void> {
  const konto = await holeAngemeldetesKonto();
  if (konto !== null) await beendeAlleSitzungen(konto.id);
  const speicher = await cookies();
  for (const name of KONTOCOOKIE_NAMEN) speicher.delete(name);
  redirect("/");
}

export interface Loeschzustand {
  readonly meldung?: string;
  readonly geloescht?: boolean;
}

export async function bewertungLoeschen(
  _vorher: Loeschzustand,
  formular: FormData,
): Promise<Loeschzustand> {
  const konto = await verlangeKonto();
  const id = String(formular.get("bewertung") ?? "");

  // Die Konto-Kennung kommt aus der Sitzung, nicht aus dem Formular — sonst
  // ließe sich mit einer fremden Bewertungs-Kennung jede Bewertung löschen.
  const ok = await loescheBewertung(konto.id, id);
  if (!ok) return { meldung: "Diese Bewertung gibt es nicht mehr." };

  revalidatePath("/konto");
  return { geloescht: true };
}

export async function kontoLoeschen(): Promise<void> {
  const konto = await verlangeKonto();
  await loescheKonto(konto.id);

  const speicher = await cookies();
  for (const name of KONTOCOOKIE_NAMEN) speicher.delete(name);
  redirect("/?geloescht=1");
}
