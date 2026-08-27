"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fordereZugangAn, beendeSchulsitzung } from "@/db/schulzugang";
import { wegtext } from "@/domain/schulzugang";
import { baueSchulzugang, sende } from "@/versand/nachricht";
import { versandkette } from "@/versand/wege";
import { holeSchule } from "@/db/schulen";
import { SCHULCOOKIE_NAMEN } from "./sitzung";

export interface Anfragezustand {
  readonly meldung?: string;
  readonly fehler?: string;
  readonly werte?: Record<string, string>;
  readonly versuch?: number;
}

export async function zugangAnfordern(
  vorher: Anfragezustand,
  formular: FormData,
): Promise<Anfragezustand> {
  const slug = String(formular.get("schule") ?? "");
  const kontakt = String(formular.get("kontakt") ?? "").trim();
  const notiz = String(formular.get("notiz") ?? "");
  const versuch = (vorher.versuch ?? 0) + 1;
  const werte = { schule: slug, kontakt, notiz };

  const schule = await holeSchule(slug);
  if (schule === null) return { fehler: "Diese Schule kennen wir nicht.", werte, versuch };

  if (notiz.trim().length < 20) {
    return {
      fehler: "Bitte schreib in einem Satz, in welcher Funktion du für die Schule sprichst.",
      werte,
      versuch,
    };
  }

  const ergebnis = await fordereZugangAn({
    schuleId: schule.id,
    kontakt: kontakt === "" ? null : kontakt,
    notiz,
  });
  if (ergebnis === null) return { fehler: "Diese Schule kennen wir nicht.", werte, versuch };

  // Der Link geht nur bei den beiden belegbaren Wegen hinaus. Bei der Prüfung
  // von Hand entsteht gar keiner — es gibt nichts zu verschicken, bevor ein
  // Mensch entschieden hat.
  if (ergebnis.link !== null && ergebnis.entscheidung.ziel !== null) {
    const basis = process.env["BASIS_URL"] ?? "http://localhost:3000";
    const nachricht = baueSchulzugang(basis, ergebnis.link, schule.name);
    await sende(versandkette(), ergebnis.entscheidung.ziel, "email", nachricht);
  }

  return { meldung: wegtext(ergebnis.entscheidung), versuch };
}

export async function schuleAbmelden(): Promise<void> {
  const speicher = await cookies();
  for (const name of SCHULCOOKIE_NAMEN) {
    const wert = speicher.get(name)?.value;
    if (wert) await beendeSchulsitzung(wert);
    speicher.delete(name);
  }
  redirect("/");
}
