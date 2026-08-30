"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  fuehreDublettenZusammen,
  holeSchuldatensatz,
  legeSchuleAn,
  speichereSchule,
} from "@/db/schulverwaltung";
import {
  aenderungstext,
  pruefeSchulangaben,
  uebernimm,
  type Feldfehler,
  type Schulangaben,
} from "@/domain/schulpflege";
import { verlangeAnmeldung } from "../sitzung";

export interface Pflegezustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly fehler?: readonly Feldfehler[];
  readonly versuch?: number;
  /** Die eingegebenen Werte, damit nach einem Fehler nichts neu getippt werden muss. */
  readonly werte?: Schulangaben;
}

function ausFormular(formular: FormData): Schulangaben {
  const text = (feld: string) => String(formular.get(feld) ?? "");
  return {
    name: text("name"),
    bundesland: text("bundesland"),
    schularten: formular.getAll("schularten").map(String),
    schulartOriginal: text("schulartOriginal"),
    strasse: text("strasse"),
    plz: text("plz"),
    ort: text("ort"),
    traeger: text("traeger"),
    website: text("website"),
    telefon: text("telefon"),
    email: text("email"),
    lat: text("lat"),
    lon: text("lon"),
    istAktiv: formular.get("istAktiv") === "an",
  };
}

/**
 * Änderungen am Schulbestand darf nur die Leitung.
 *
 * Eine umbenannte oder stillgelegte Schule wirkt auf jedes Profil, jeden Link
 * und jede Bewertung, die daran hängt - das ist ein tieferer Eingriff als die
 * Entscheidung über eine einzelne Bewertung.
 */
export async function schuleSpeichern(
  vorher: Pflegezustand,
  formular: FormData,
): Promise<Pflegezustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;
  const werte = ausFormular(formular);

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Den Schulbestand darf nur die Leitung ändern.", versuch, werte };
  }

  const id = String(formular.get("id") ?? "");
  const bestand = await holeSchuldatensatz(id);
  if (bestand === null) return { meldung: "Diese Schule gibt es nicht (mehr).", versuch, werte };

  const fehler = pruefeSchulangaben(werte);
  if (fehler.length > 0) return { fehler, versuch, werte };

  const neu = uebernimm(werte);
  const beschreibung = `${bestand.name} (${bestand.slug}): ${aenderungstext(
    {
      name: bestand.name,
      bundesland: bestand.bundesland,
      schularten: bestand.schularten,
      strasse: bestand.strasse,
      plz: bestand.plz,
      ort: bestand.ort,
      traeger: bestand.traeger,
      website: bestand.website,
      telefon: bestand.telefon,
      email: bestand.email,
      lat: bestand.lat,
      lon: bestand.lon,
      ist_aktiv: bestand.ist_aktiv,
    },
    {
      name: neu.name,
      bundesland: neu.bundesland,
      schularten: neu.schularten,
      strasse: neu.strasse,
      plz: neu.plz,
      ort: neu.ort,
      traeger: neu.traeger,
      website: neu.website,
      telefon: neu.telefon,
      email: neu.email,
      lat: neu.lat,
      lon: neu.lon,
      ist_aktiv: neu.istAktiv,
    },
  )}`;

  await speichereSchule(id, neu, moderatorin.id, beschreibung);

  revalidatePath("/moderation/schulen");
  revalidatePath(`/moderation/schulen/${id}`);
  // Auch öffentlich: Profil und Suche zeigen sonst weiter den alten Namen.
  revalidatePath(`/schule/${bestand.slug}`);

  return { erfolg: "Gespeichert. Der nächste Import lässt diese Schule unangetastet.", versuch };
}

export async function schuleAnlegen(
  vorher: Pflegezustand,
  formular: FormData,
): Promise<Pflegezustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;
  const werte = ausFormular(formular);

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Schulen anlegen darf nur die Leitung.", versuch, werte };
  }

  const fehler = pruefeSchulangaben(werte);
  if (fehler.length > 0) return { fehler, versuch, werte };

  const { id } = await legeSchuleAn(uebernimm(werte), moderatorin.id);
  revalidatePath("/moderation/schulen");
  // `typedRoutes` kennt den Pfad mit eingesetzter Kennung nicht als Literal;
  // die Umleitung ist trotzdem gültig.
  redirect(`/moderation/schulen/${id}` as "/moderation/schulen");
}

export interface Dublettenzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
}

/**
 * Führt gefundene Dubletten zusammen.
 *
 * Nur die Leitung, und nur auf ausdrücklichen Klick: Der Bestand ist die
 * Grundlage von allem anderen, und eine falsche Zusammenführung sähe niemand
 * sofort. Gelöscht wird nichts - die überzähligen Zeilen werden stillgelegt
 * und lassen sich einzeln wieder aktivieren.
 */
export async function dublettenZusammenfuehren(): Promise<Dublettenzustand> {
  const moderatorin = await verlangeAnmeldung();
  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Das darf nur die Leitung." };
  }

  const anzahl = await fuehreDublettenZusammen(moderatorin.id);
  revalidatePath("/moderation/schulen");
  return anzahl === 0
    ? { erfolg: "Es gab nichts zusammenzuführen." }
    : { erfolg: `${anzahl} Dublette${anzahl === 1 ? "" : "n"} stillgelegt.` };
}
