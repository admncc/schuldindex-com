"use client";

import { useEffect } from "react";
import {
  GERAETECOOKIE,
  GERAETESCHLUESSEL,
  GERAET_TAGE,
  REFSCHLUESSEL,
  istGeraetekennung,
} from "@/domain/geraetekennung";

/**
 * Hält Gerätekennung und Empfehlungskennung im Browser gleich.
 *
 * Der Server setzt beide als Cookie; dieses Stück spiegelt sie in den Local
 * Storage und stellt sie von dort wieder her, wenn der Cookie verschwunden ist
 * (Safari kappt skriptgesetzte Cookies nach sieben Tagen, Aufräumwerkzeuge
 * löschen sie, und die App-Browser von Instagram und TikTok haben einen
 * eigenen Cookiespeicher).
 *
 * **Gelesen wird serverseitig aus dem Cookie.** Was hier passiert, ist nur die
 * Sicherung dagegen, dass er abhandenkommt: Fehlt er und steht im Speicher
 * noch etwas Brauchbares, wird er daraus neu gesetzt. Die Werte selbst werden
 * hier nie erfunden - die Kennung kommt vom Server, sonst könnte sich jeder
 * eine ausdenken.
 *
 * Der Empfehlungscode ist `httpOnly` und für dieses Skript unsichtbar; er wird
 * beim Aufruf von `/e/<code>` zusätzlich in eine lesbare Kennung gespiegelt,
 * und die steht hier zur Wiederherstellung bereit.
 */
export function Kennungsspiegel({
  geraet,
  refcode,
}: {
  /** Die vom Server gesetzte Gerätekennung, falls vorhanden. */
  geraet: string | null;
  /** Der Empfehlungscode aus dem Cookie, falls vorhanden. */
  refcode: string | null;
}) {
  useEffect(() => {
    try {
      // Gerätekennung: vom Server nach vorn, sonst aus dem Speicher zurück.
      if (istGeraetekennung(geraet)) {
        window.localStorage.setItem(GERAETESCHLUESSEL, geraet);
      } else {
        const gespeichert = window.localStorage.getItem(GERAETESCHLUESSEL);
        if (istGeraetekennung(gespeichert)) {
          // Dieselben Merkmale wie beim Server: Ohne `secure` ersetzte diese
          // Zeile einen abgesicherten Cookie durch einen, der auch über eine
          // unverschlüsselte Verbindung mitgeht.
          const sicher = window.location.protocol === "https:" ? "; secure" : "";
          document.cookie =
            `${GERAETECOOKIE}=${gespeichert}; path=/; max-age=${GERAET_TAGE * 24 * 3600}` +
            `; samesite=lax${sicher}`;
        }
      }

      // Empfehlungskennung: Der Cookie ist httpOnly, deshalb reicht der Server
      // den Code hier herein, sobald er einen hat.
      if (refcode !== null && refcode !== "") {
        window.localStorage.setItem(REFSCHLUESSEL, refcode);
      }
    } catch {
      // Privates Fenster, gesperrter Speicher, abgeschaltete Website-Daten:
      // Dann gibt es die Sicherung eben nicht. Das Portal funktioniert ohne
      // sie vollständig - sie ist eine Stütze, keine Voraussetzung.
    }
  }, [geraet, refcode]);

  return null;
}

/**
 * Liest die im Browser gesicherten Kennungen.
 *
 * Wird vom Bewertungsformular benutzt: Die Werte gehen mit der Abgabe an den
 * Server, der sie nur dann verwendet, wenn der Cookie fehlt.
 */
export function gesicherteKennungen(): { geraet: string | null; refcode: string | null } {
  try {
    return {
      geraet: window.localStorage.getItem(GERAETESCHLUESSEL),
      refcode: window.localStorage.getItem(REFSCHLUESSEL),
    };
  } catch {
    return { geraet: null, refcode: null };
  }
}
