import { headers } from "next/headers";
import { Skripte } from "./skripte";
import { GEHEIMKOPFZEILE } from "@/domain/geheimeadresse";
import { holeEinbettungenFuerSeite } from "@/db/einbettungen";

/**
 * Liefert die im Panel hinterlegten Fremdskripte aus.
 *
 * **Nur in den öffentlichen Gruppen**, nicht im Wurzellayout: Die Moderation
 * braucht kein Einwilligungsbanner und soll nicht in der Reichweitenmessung
 * auftauchen - ein Arbeitsplatz ist kein Besuch. Nebenbei bleibt das
 * Wurzellayout ohne Datenbankzugriff, und die Fehlerseite baut sich auch dann,
 * wenn die Datenbank weg ist.
 *
 * Die Reihenfolge ist nicht Geschmack: Das Banner steht vor der Messung, weil
 * es den Einwilligungsmodus auf „abgelehnt“ setzt, bevor die Messung sich
 * danach richten kann. Umgekehrt würde gemessen, bis jemand zustimmt oder
 * ablehnt - also genau in dem Moment, in dem noch keine Einwilligung vorliegt.
 */

export async function Einbettungen() {
  // Auf einer Adresse mit Geheimnis läuft nichts Fremdes: Die Messung würde
  // sonst den Bestätigungstoken als Teil der Seitenadresse an ihren Anbieter
  // schicken (`domain/geheimeadresse.ts`).
  if ((await headers()).get(GEHEIMKOPFZEILE) === "1") return null;

  const werte = await holeEinbettungenFuerSeite();
  return (
    <>
      {(["einwilligung", "messung"] as const).map((platz) => {
        const e = werte[platz];
        if (e === undefined || !e.aktiv) return null;
        // Die Messung ohne Banner wäre eine Messung ohne Einwilligung.
        if (platz === "messung" && !(werte.einwilligung?.aktiv ?? false)) return null;
        return <Skripte key={platz} platz={platz} inhalt={e.inhalt} />;
      })}
    </>
  );
}

/** Ob überhaupt ein Banner läuft - entscheidet über den Link in der Fußzeile. */
export async function bannerLaeuft(): Promise<boolean> {
  const werte = await holeEinbettungenFuerSeite();
  return werte.einwilligung?.aktiv ?? false;
}
