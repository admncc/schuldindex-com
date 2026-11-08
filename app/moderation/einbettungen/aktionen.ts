"use server";

import { revalidatePath } from "next/cache";
import { setzeEinbettung } from "@/db/einbettungen";
import { PLAETZE, PLATZBESCHREIBUNG, pruefeSchnipsel, type Platz } from "@/domain/einbettung";
import { verlangeAnmeldung } from "../sitzung";

export interface Einbettungszustand {
  readonly platz?: Platz;
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly hinweise?: readonly string[];
  readonly hosts?: readonly string[];
  readonly versuch?: number;
}

/**
 * Speichert einen Schnipsel.
 *
 * **Nur die Leitung.** Was hier eingetragen wird, läuft im Browser jedes
 * Besuchers - das ist die folgenreichste Eingabe im ganzen Panel, folgenreicher
 * als jede Freigabe einer einzelnen Bewertung.
 *
 * Die Prüfung läuft hier, nicht im Browser: Eine Prüfung im Formular ist
 * Bequemlichkeit für den, der tippt, und kein Schutz - wer die Serveraktion
 * direkt aufruft, umgeht sie.
 */
export async function schnipselSpeichern(
  vorher: Einbettungszustand,
  formular: FormData,
): Promise<Einbettungszustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  const platz = String(formular.get("platz") ?? "") as Platz;
  if (!PLAETZE.includes(platz)) return { meldung: "Diesen Platz gibt es nicht.", versuch };
  if (moderatorin.rolle !== "leitung") {
    return { platz, meldung: "Fremde Skripte darf nur die Leitung eintragen.", versuch };
  }

  const inhalt = String(formular.get("inhalt") ?? "").trim();
  const aktiv = formular.get("aktiv") !== null;

  const geprueft = pruefeSchnipsel(inhalt);
  if (!geprueft.ok) return { platz, meldung: geprueft.meldung, versuch };

  await setzeEinbettung(platz, inhalt, aktiv, moderatorin.id);
  // Die ganze Oberfläche, nicht nur diese Seite: Der Schnipsel steckt in den
  // Layouts aller öffentlichen Seiten.
  revalidatePath("/", "layout");

  const label = PLATZBESCHREIBUNG.find((p) => p.platz === platz)?.label ?? platz;
  if (inhalt === "") {
    return { platz, erfolg: `${label}: entfernt. Es wird nichts mehr eingebettet.`, versuch };
  }
  return {
    platz,
    erfolg: `${label}: gespeichert, ${geprueft.skripte.length} Skript${
      geprueft.skripte.length === 1 ? "" : "e"
    }, ${aktiv ? "aktiv" : "abgeschaltet"}.`,
    hinweise: geprueft.hinweise,
    hosts: geprueft.hosts,
    versuch,
  };
}
