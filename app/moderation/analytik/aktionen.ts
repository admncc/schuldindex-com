"use server";

import { revalidatePath } from "next/cache";
import { ANTHROPIC, holeSchluessel } from "@/db/geheimnisse";
import { grundlageFuerAnalyse } from "@/db/analytik";
import { entscheide } from "@/db/moderation";
import { analysiere, claudeAnalyse, type Analysebefund, type Analysezeile } from "@/ki/betrugsanalyse";
import { ablehnungsgrund } from "@/domain/moderation";
import { sql } from "@/db/verbindung";
import type { Zustand } from "@/domain/bewertungsstatus";
import { verlangeAnmeldung } from "../sitzung";

export interface Analysezustand {
  readonly meldung?: string;
  readonly befund?: Analysebefund;
  /** Die Zuordnung von laufender Nummer zu Bewertung - das Modell kennt nur Nummern. */
  readonly zuordnung?: readonly { nr: number; id: string }[];
  readonly versuch?: number;
}

/**
 * Lässt ein Sprachmodell über die Bewertungen einer Schule sehen.
 *
 * Was hinausgeht, steht in `ki/betrugsanalyse.ts`: laufende Nummer, Datum,
 * Rolle, Wertung, Signale, Klickkennzahlen, Freitext. **Kein Kontakt, keine
 * Kontokennung.** Die Zuordnung von Nummer zu Bewertung bleibt hier.
 *
 * Der Befund entscheidet nichts. Er markiert Zeilen, und ablehnen kann sie
 * danach ein Mensch - mit einem Grund aus der Vorlage und mit seinem Namen im
 * Protokoll.
 */
export async function analyseStarten(
  vorher: Analysezustand,
  formular: FormData,
): Promise<Analysezustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Die KI-Analyse darf nur die Leitung starten.", versuch };
  }

  const schuleId = String(formular.get("schule") ?? "");
  if (schuleId === "") return { meldung: "Keine Schule gewählt.", versuch };

  const schluessel = await holeSchluessel(ANTHROPIC, "ANTHROPIC_API_KEY");
  if (schluessel === null) {
    return {
      meldung:
        "Kein Claude-Schlüssel hinterlegt. Unter Einstellungen eintragen, dann noch einmal versuchen.",
      versuch,
    };
  }

  const grundlage = await grundlageFuerAnalyse(schuleId);
  if (grundlage.length === 0) return { meldung: "Diese Schule hat keine Bewertungen.", versuch };

  const zeilen: Analysezeile[] = grundlage.map((g, i) => ({
    nr: i + 1,
    abgegeben: g.erstellt_am.toISOString().slice(0, 16).replace("T", " "),
    rolle: g.rolle,
    gesamtscore: g.gesamtscore === null ? null : Number(g.gesamtscore),
    signale: (g.signale ?? []).map((s) => s.art),
    signalpunkte: g.signalpunkte,
    klickMedianMs: g.klickmuster?.medianMs ?? null,
    klickStreuung: g.klickmuster?.streuung ?? null,
    dauerSekunden: null,
    freitext: Object.values(g.freitexte ?? {}).join(" ") || null,
  }));

  try {
    const befund = await analysiere(zeilen, claudeAnalyse(schluessel));
    if (befund === null) {
      return { meldung: "Das Modell hat keine verwertbare Antwort geliefert.", versuch };
    }
    return {
      befund,
      zuordnung: zeilen.map((z, i) => ({ nr: z.nr, id: grundlage[i]!.id })),
      versuch,
    };
  } catch (fehler) {
    console.error("KI-Analyse fehlgeschlagen:", fehler);
    return { meldung: "Der Aufruf ist fehlgeschlagen. Details stehen im Serverprotokoll.", versuch };
  }
}

export interface Ablehnzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Lehnt eine Bewertung aus der Auswertung heraus ab.
 *
 * Derselbe Weg wie in der Warteschlange - dieselbe Funktion, derselbe
 * Protokolleintrag, dieselbe Neuberechnung des Schulaggregats. Was hier anders
 * ist, ist nur der Ort, an dem der Knopf steht: Wer eine Welle von zwanzig
 * gekauften Bewertungen vor sich hat, soll sie nicht einzeln in der
 * Warteschlange wiederfinden müssen.
 */
export async function ausAnalyseAblehnen(
  vorher: Ablehnzustand,
  formular: FormData,
): Promise<Ablehnzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  const bewertungId = String(formular.get("bewertung") ?? "");
  const grundId = String(formular.get("grund") ?? "");
  const grund = ablehnungsgrund(grundId);
  if (bewertungId === "" || grund === null) {
    return { meldung: "Bitte einen Ablehnungsgrund wählen.", versuch };
  }

  // `vonStatus` sichert gegen zwei gleichzeitige Entscheidungen: Wer aus der
  // Auswertung ablehnt, während jemand anders in der Warteschlange freigibt,
  // bekommt eine Meldung statt eines stillen Überschreibens.
  const [zustand] = await sql<{ status: Zustand }[]>`
    select status::text as status from bewertungen where id = ${bewertungId}
  `;
  if (zustand === undefined) return { meldung: "Diese Bewertung gibt es nicht mehr.", versuch };

  const geaendert = await entscheide({
    bewertungId,
    moderatorId: moderatorin.id,
    aktion: "ablehnen",
    nachStatus: "abgelehnt",
    grundId: grund.id,
    begruendung: grund.text,
    vonStatus: zustand.status,
  });

  revalidatePath("/moderation/analytik");
  return geaendert
    ? { erfolg: "Abgelehnt. Die Schulwertung wurde neu gerechnet.", versuch }
    : { meldung: "Die Bewertung war inzwischen in einem anderen Zustand.", versuch };
}
