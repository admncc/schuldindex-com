/**
 * Prüfung von Schulangaben, die von Hand eingetragen werden.
 *
 * Der Bestand kommt aus einer Datenquelle und ist dort schon normalisiert. Was
 * die Redaktion eintippt, ist es nicht - und eine Schule mit vertauschten
 * Koordinaten steht auf der Karte in Polen, eine ohne Bundesland taucht in
 * keinem Filter auf.
 *
 * Deshalb dieselbe Trennung wie beim Bewertungsformular: Die Regeln stehen hier,
 * ohne Datenbank und ohne React, und werden von der Server-Aktion aufgerufen.
 * Was im Browser noch einmal geprüft wird, ist Bequemlichkeit - verlassen kann
 * man sich nur auf diese Datei.
 */

import { BUNDESLAENDER, istBundesland, type Bundesland } from "./bundesland";
import { SCHULART_LABEL, type Schulart } from "../import/schulart";

export interface Schulangaben {
  readonly name: string;
  readonly bundesland: string;
  readonly schularten: readonly string[];
  readonly schulartOriginal: string;
  readonly strasse: string;
  readonly plz: string;
  readonly ort: string;
  readonly traeger: string;
  readonly website: string;
  readonly telefon: string;
  readonly email: string;
  /** Als Text, wie er aus dem Formular kommt - leer heißt „keine Koordinate“. */
  readonly lat: string;
  readonly lon: string;
  readonly istAktiv: boolean;
}

export interface Feldfehler {
  readonly feld: string;
  readonly meldung: string;
}

/**
 * Grober Rahmen um Deutschland.
 *
 * Nicht die Landesgrenze, sondern ein Rechteck darum: Es geht darum, den
 * Zahlendreher zu fangen (52,5 / 13,4 als 13,4 / 52,5 eingetragen ergibt eine
 * Schule im Indischen Ozean), nicht darum, Grenzverläufe nachzubilden.
 */
const RAHMEN = { sued: 47.0, nord: 55.4, west: 5.5, ost: 15.5 };

function zahlOderNull(wert: string): number | null {
  const bereinigt = wert.trim().replace(",", ".");
  if (bereinigt === "") return null;
  const zahl = Number(bereinigt);
  return Number.isFinite(zahl) ? zahl : Number.NaN;
}

export function pruefeSchulangaben(a: Schulangaben): Feldfehler[] {
  const fehler: Feldfehler[] = [];

  const name = a.name.trim();
  if (name.length < 3) {
    fehler.push({ feld: "name", meldung: "Der Name braucht mindestens drei Zeichen." });
  } else if (name.length > 200) {
    fehler.push({ feld: "name", meldung: "Der Name ist zu lang (höchstens 200 Zeichen)." });
  }

  if (!istBundesland(a.bundesland)) {
    fehler.push({ feld: "bundesland", meldung: "Bitte ein Bundesland wählen." });
  }

  for (const art of a.schularten) {
    if (!(art in SCHULART_LABEL)) {
      fehler.push({ feld: "schularten", meldung: `Unbekannte Schulart: ${art}` });
      break;
    }
  }

  const plz = a.plz.trim();
  if (plz !== "" && !/^\d{5}$/.test(plz)) {
    fehler.push({ feld: "plz", meldung: "Eine deutsche Postleitzahl hat fünf Ziffern." });
  }

  const website = a.website.trim();
  if (website !== "" && !/^https?:\/\/\S+$/i.test(website)) {
    fehler.push({ feld: "website", meldung: "Die Adresse muss mit http:// oder https:// beginnen." });
  }

  const email = a.email.trim();
  if (email !== "" && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    fehler.push({ feld: "email", meldung: "Das sieht nicht nach einer E-Mail-Adresse aus." });
  }

  const lat = zahlOderNull(a.lat);
  const lon = zahlOderNull(a.lon);

  if (lat !== null && Number.isNaN(lat)) {
    fehler.push({ feld: "lat", meldung: "Der Breitengrad muss eine Zahl sein." });
  }
  if (lon !== null && Number.isNaN(lon)) {
    fehler.push({ feld: "lon", meldung: "Der Längengrad muss eine Zahl sein." });
  }

  if ((lat === null) !== (lon === null)) {
    fehler.push({
      feld: "lat",
      meldung: "Breiten- und Längengrad gehören zusammen - entweder beide oder keins.",
    });
  }

  if (lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    if (lat < RAHMEN.sued || lat > RAHMEN.nord || lon < RAHMEN.west || lon > RAHMEN.ost) {
      // Der häufigste Fall ist der Zahlendreher; deshalb sagt die Meldung das
      // auch, statt nur „außerhalb“ zu melden.
      const vertauscht = lon >= RAHMEN.sued && lon <= RAHMEN.nord && lat >= RAHMEN.west && lat <= RAHMEN.ost;
      fehler.push({
        feld: "lat",
        meldung: vertauscht
          ? "Die Koordinate liegt außerhalb Deutschlands - Breite und Länge sind wohl vertauscht."
          : "Die Koordinate liegt außerhalb Deutschlands.",
      });
    }
  }

  return fehler;
}

/** Die geprüften Angaben in der Form, in der sie gespeichert werden. */
export interface Gepruefte {
  readonly name: string;
  readonly bundesland: Bundesland;
  readonly schularten: Schulart[];
  readonly schulartOriginal: string | null;
  readonly strasse: string | null;
  readonly plz: string | null;
  readonly ort: string | null;
  readonly traeger: string | null;
  readonly website: string | null;
  readonly telefon: string | null;
  readonly email: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly istAktiv: boolean;
}

/** Leere Felder werden zu `null`, nicht zu `""` - sonst steht überall „ “. */
function oderNull(wert: string): string | null {
  const bereinigt = wert.trim();
  return bereinigt === "" ? null : bereinigt;
}

export function uebernimm(a: Schulangaben): Gepruefte {
  const lat = zahlOderNull(a.lat);
  const lon = zahlOderNull(a.lon);
  return {
    name: a.name.trim(),
    bundesland: (istBundesland(a.bundesland) ? a.bundesland : BUNDESLAENDER[0]) as Bundesland,
    schularten: a.schularten.filter((s): s is Schulart => s in SCHULART_LABEL),
    schulartOriginal: oderNull(a.schulartOriginal),
    strasse: oderNull(a.strasse),
    plz: oderNull(a.plz),
    ort: oderNull(a.ort),
    traeger: oderNull(a.traeger),
    website: oderNull(a.website),
    telefon: oderNull(a.telefon),
    email: oderNull(a.email),
    lat: lat === null || Number.isNaN(lat) ? null : lat,
    lon: lon === null || Number.isNaN(lon) ? null : lon,
    istAktiv: a.istAktiv,
  };
}

/**
 * Was sich geändert hat, als Text fürs Protokoll.
 *
 * „Schule bearbeitet“ ist im Protokoll wertlos - man müsste die alte Fassung
 * kennen, um zu verstehen, was jemand getan hat. Deshalb steht dort, welche
 * Felder sich geändert haben und wie.
 */
export function aenderungstext(alt: Record<string, unknown>, neu: Record<string, unknown>): string {
  const teile: string[] = [];
  for (const feld of Object.keys(neu)) {
    const vorher = alt[feld];
    const nachher = neu[feld];
    const gleich = Array.isArray(vorher)
      ? JSON.stringify(vorher) === JSON.stringify(nachher)
      : (vorher ?? null) === (nachher ?? null);
    if (gleich) continue;
    teile.push(`${feld}: ${beschreibe(vorher)} → ${beschreibe(nachher)}`);
  }
  return teile.length === 0 ? "keine Änderung" : teile.join(", ");
}

function beschreibe(wert: unknown): string {
  if (wert === null || wert === undefined || wert === "") return "-";
  if (Array.isArray(wert)) return wert.length === 0 ? "-" : wert.join("/");
  return String(wert);
}
