"use server";

import { revalidatePath } from "next/cache";
import { speichereEinstellungen } from "@/db/einstellungen";
import {
  KATALOG,
  beschreibung,
  erlaubteKontaktarten,
  mitVorgaben,
  pruefeWert,
} from "@/domain/einstellungen";
import { zustellbareArten } from "@/versand/wege";
import { verlangeAnmeldung } from "../sitzung";
import { ANTHROPIC, entferneSchluessel, setzeSchluessel } from "@/db/geheimnisse";
import { sichtbarKeinSchluessel } from "@/domain/geheimnis";
import { emailweg, pruefeEmpfaenger, smtpAusUmgebung } from "@/versand/email";
import { zaehle } from "@/domain/drosselung";
import { protokolliere } from "@/db/ereignisse";

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

  /**
   * **Ein Haken darf das Portal nicht stilllegen.**
   *
   * Genau das ist passiert: E-Mail stand auf „aus", WhatsApp auf „an" - und
   * weil WhatsApp nicht zustellen kann, blieb von den angebotenen Wegen keiner
   * übrig. Die Bewertungsseite zeigte daraufhin „Bewerten ist gerade nicht
   * möglich", und zwar für alle, ohne dass im Panel irgendwo etwas gestanden
   * hätte. Die Regel „sind alle aus, gelten wieder alle" fing das nicht ab:
   * Sie schützt gegen *alle* aus, nicht gegen „der einzige, der zustellt, ist
   * aus".
   *
   * Geprüft wird deshalb nicht, ob irgendein Haken gesetzt ist, sondern ob am
   * Ende ein Weg übrig bleibt, der auch ankommt.
   */
  const kuenftig = erlaubteKontaktarten(
    mitVorgaben(Object.fromEntries(aenderungen.map((a) => [a.schluessel, a.wert]))),
  );
  const zustellbar = zustellbareArten();
  if (!kuenftig.some((art) => zustellbar.includes(art))) {
    const moeglich = zustellbar.length === 0
      ? "Zurzeit kann kein einziger Weg zustellen - sieh unter „Nachrichtenversand“ nach."
      : `Zustellen kann zurzeit nur: ${zustellbar.join(", ")}.`;
    return {
      meldung:
        `Nichts gespeichert. Mit dieser Auswahl bliebe kein Weg übrig, über den eine Bestätigung ` +
        `ankommt - das Portal würde gar keine Bewertungen mehr annehmen. ${moeglich}`,
      versuch,
    };
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

export interface Versandzustand {
  readonly meldung?: string;
  readonly erfolg?: string;
  readonly versuch?: number;
}

/**
 * Verschickt eine Testnachricht.
 *
 * **Warum es diesen Knopf gibt.** Ob SMTP richtig eingerichtet ist, zeigte
 * sich bisher erst, wenn jemand eine Bewertung abgab und auf eine Nachricht
 * wartete, die nicht kam - und dann stand die Bewertung unbestätigt in der
 * Datenbank, und niemand wusste, ob es an der Einrichtung lag, am Anbieter
 * oder am Spamfilter. Ein Knopf, der denselben Weg benutzt wie der Ernstfall,
 * beantwortet das in fünf Sekunden.
 *
 * **Und warum er gedrosselt ist.** Er verschickt Post an eine frei
 * eingetragene Adresse. Wer sich Zugang zum Panel verschafft, hätte damit
 * einen Versender in der Hand, der unter unserem Namen und mit unserer
 * Zustellreputation schreibt. Fünf je Stunde reichen zum Einrichten und zu
 * nichts sonst; jeder Versuch steht im Protokoll.
 */
export async function testmailSenden(
  vorher: Versandzustand,
  formular: FormData,
): Promise<Versandzustand> {
  const moderatorin = await verlangeAnmeldung();
  const versuch = (vorher.versuch ?? 0) + 1;

  if (moderatorin.rolle !== "leitung") {
    return { meldung: "Testnachrichten darf nur die Leitung verschicken.", versuch };
  }

  const smtp = smtpAusUmgebung();
  if (smtp === null) {
    return {
      meldung:
        "SMTP ist nicht eingerichtet. Ohne SMTP_HOST, SMTP_BENUTZER, SMTP_KENNWORT und SMTP_ABSENDER in der .env geht nichts hinaus.",
      versuch,
    };
  }

  const an = pruefeEmpfaenger(String(formular.get("an") ?? ""));
  if (an === null) return { meldung: "Diese Adresse ist nicht zustellbar.", versuch };

  if (!zaehle("testmail", moderatorin.id, 5, 3_600_000).erlaubt) {
    return { meldung: "Fünf Testnachrichten je Stunde reichen. Bitte später noch einmal.", versuch };
  }

  const ergebnis = await emailweg(smtp).sende({
    empfaenger: an,
    betreff: "SCHULINDEX: Testnachricht aus dem Panel",
    text:
      `Diese Nachricht bestätigt, dass der E-Mail-Versand von SCHULINDEX funktioniert.\n\n` +
      `Verschickt von: ${moderatorin.name} (${moderatorin.kennung})\n` +
      `Über: ${smtp.host}:${smtp.port}\n\n` +
      `Kommt sie im Posteingang an und nicht im Spam, ist auch SPF und DKIM in Ordnung.\n\n` +
      `- SCHULINDEX`,
  });

  await protokolliere({
    art: ergebnis.ok ? "info" : "warnung",
    bereich: "versand",
    meldung: ergebnis.ok
      ? "Testnachricht verschickt"
      : `Testnachricht fehlgeschlagen: ${ergebnis.ok ? "" : ergebnis.grund}`,
    // Die Adresse nicht mitgeben - `saeubere` würde sie schwärzen, aber sie
    // hat hier ohnehin nichts verloren.
  });

  if (!ergebnis.ok) return { meldung: ergebnis.grund, versuch };
  return {
    erfolg: `Verschickt an ${an}. Kommt sie nicht an, sieh im Spam nach - dann fehlen SPF oder DKIM.`,
    versuch,
  };
}
