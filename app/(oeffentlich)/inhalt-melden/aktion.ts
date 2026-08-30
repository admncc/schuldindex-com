"use server";

import { nimmMeldungAn } from "@/db/meldungen";
import { EINGANGSBESTAETIGUNG, istMeldegrund, pruefeMeldung } from "@/domain/meldung";
import { absenderadresse } from "@/geo/mmdb";
import { zaehle } from "@/domain/drosselung";
import { headers } from "next/headers";

export interface Meldezustand {
  readonly fehler?: readonly { feld: string; meldung: string }[];
  readonly bestaetigung?: string;
  readonly kennung?: string;
  /** Eingaben, damit ein Fehlversuch nicht das ganze Formular leert. */
  readonly werte?: Record<string, string>;
  /**
   * Zählt die Versuche.
   *
   * React setzt ein Formular nach jeder Aktion zurück, und zwar im DOM: die
   * Vorgabewerte aus dem Zustand wirken erst wieder, wenn das Formular neu
   * aufgebaut wird. Diese Zahl dient dem Formular als Schlüssel und erzwingt
   * genau das - sonst standen nach einem Tippfehler in der Adresse plötzlich
   * wieder alle Felder leer, das Pflichtkreuz eingeschlossen, und der nächste
   * Klick auf „Absenden“ tat scheinbar gar nichts.
   */
  readonly versuch?: number;
}

/** Höchstens so viele Meldungen je Absender und Stunde. */
const MELDUNGEN_JE_STUNDE = 10;

export async function melden(_vorher: Meldezustand, formular: FormData): Promise<Meldezustand> {
  // Die Warteschlange der Meldungen ist die Stelle, an der Menschen arbeiten.
  // Ohne Grenze ließ sie sich beliebig füllen.
  const absender = absenderadresse(await headers());
  if (!zaehle("meldung", absender, MELDUNGEN_JE_STUNDE, 3_600_000).erlaubt) {
    return {
      fehler: [
        { feld: "", meldung: "Das waren gerade viele Meldungen. Bitte versuche es später noch einmal." },
      ],
    };
  }

  const eingabe = {
    url: String(formular.get("url") ?? ""),
    grund: String(formular.get("grund") ?? ""),
    erlaeuterung: String(formular.get("erlaeuterung") ?? ""),
    name: String(formular.get("name") ?? ""),
    kontakt: String(formular.get("kontakt") ?? ""),
    gutglauben: formular.get("gutglauben") === "on",
  };

  // React setzt das Formular nach jeder Aktion zurück. Ohne diese Werte müsste
  // nach einem Tippfehler in der Adresse alles neu eingegeben werden - auch das
  // Kreuz bei der Versicherung, und weil das Feld verpflichtend ist, ließe sich
  // das Formular danach klicken, ohne dass irgendetwas passiert.
  const werte = {
    url: eingabe.url,
    grund: eingabe.grund,
    erlaeuterung: eingabe.erlaeuterung,
    name: eingabe.name,
    kontakt: eingabe.kontakt,
    gutglauben: eingabe.gutglauben ? "ja" : "",
  };

  const versuch = (_vorher.versuch ?? 0) + 1;

  const fehler = pruefeMeldung(eingabe);
  if (fehler.length > 0) return { fehler, werte, versuch };
  if (!istMeldegrund(eingabe.grund)) {
    return { fehler: [{ feld: "grund", meldung: "Unbekannter Grund." }], werte, versuch };
  }

  const { id } = await nimmMeldungAn({ ...eingabe, grund: eingabe.grund });

  // Die Kennung ist die Eingangsbestätigung nach Art. 16 Abs. 4: sie erlaubt der
  // meldenden Person, sich auf genau diese Meldung zu beziehen - auch dann,
  // wenn sie keine E-Mail-Adresse angegeben hat (Meldung einer Drohung).
  return { bestaetigung: EINGANGSBESTAETIGUNG, kennung: id.slice(0, 8).toUpperCase() };
}
