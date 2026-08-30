import { NextResponse } from "next/server";
import { bewertungAbgeben } from "@/dienste/bewertungAbgeben";
import { umgebungMitDatenbank } from "@/dienste/umgebung";
import type { Bewertungseingabe } from "@/domain/bewertungseingabe";
import { pruefeStempel, STEMPEL_HINWEIS } from "@/domain/formularstempel";
import { MAX_ABSTAENDE } from "@/domain/klickmuster";
import { absenderadresse, ortungFuerIp } from "@/geo/mmdb";
import { zaehle } from "@/domain/drosselung";
import { cookies } from "next/headers";
import { EMPFEHLUNGSCOOKIE, istEmpfehlungscode } from "@/domain/empfehlung";
import { GERAETECOOKIE, gueltigeKennung } from "@/domain/geraetekennung";

type Anfragekoerper = Bewertungseingabe & {
  stempel?: string;
  klickabstaende?: unknown;
  /** Was der Browser aus dem Local Storage mitschickt - siehe unten. */
  gesichert?: { geraet?: unknown; refcode?: unknown };
};

/**
 * Nimmt die gemeldeten Klickabstände entgegen - und nur das, was auch eine
 * Zahlenreihe ist.
 *
 * Alles hier kommt aus dem Browser und ist damit beliebig fälschbar. Geprüft
 * wird deshalb nur die Form; ob die Reihe zur Wirklichkeit passt, entscheidet
 * später der Vergleich mit der vom Server gemessenen Dauer
 * (`domain/klickmuster.ts`).
 */
function klickabstaende(wert: unknown): number[] | null {
  if (!Array.isArray(wert)) return null;
  const zahlen = wert
    .slice(0, MAX_ABSTAENDE)
    .filter((a): a is number => typeof a === "number" && Number.isFinite(a) && a >= 0);
  return zahlen.length > 0 ? zahlen : null;
}

/**
 * Nimmt eine Bewertung entgegen.
 *
 * Die eigentliche Prüfung steckt in `bewertungAbgeben` - hier steht nur, was
 * zur Anbindung gehört: Anfrage lesen, Umgebung bauen, Antwort formen.
 */
/** Ein vollständiges Formular ist wenige Kilobyte groß. 64 KB sind großzügig. */
const HOECHSTGROESSE = 64 * 1024;

/** Höchstens so viele Abgaben je Absender und Stunde. */
const ABGABEN_JE_STUNDE = 20;

export async function POST(anfrage: Request): Promise<NextResponse> {
  // Die Adresse wird gezählt und nicht gespeichert (`domain/drosselung.ts`).
  const absender = absenderadresse(anfrage.headers);
  if (!zaehle("bewertung", absender, ABGABEN_JE_STUNDE, 3_600_000).erlaubt) {
    return NextResponse.json(
      {
        ok: false,
        fehler: [{ feld: "", meldung: "Das waren gerade viele Abgaben. Bitte versuche es später noch einmal." }],
      },
      { status: 429 },
    );
  }

  // Vor dem Parsen: Ein 20 MB großer Rumpf wurde bisher vollständig gelesen und
  // in den Speicher gelegt, bevor irgendeine Prüfung griff.
  const laenge = Number(anfrage.headers.get("content-length") ?? "0");
  if (Number.isFinite(laenge) && laenge > HOECHSTGROESSE) {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage ist zu groß." }] },
      { status: 413 },
    );
  }

  let eingabe: Anfragekoerper;
  try {
    eingabe = (await anfrage.json()) as Anfragekoerper;
  } catch {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: "Die Anfrage war nicht lesbar." }] },
      { status: 400 },
    );
  }

  const basis = process.env["BASIS_URL"] ?? new URL(anfrage.url).origin;

  // Die IP wird gelesen und nirgends gespeichert (Entscheidung E3). Nachgeschlagen
  // wird sie in der Datenbank auf unserem eigenen Server - kein fremder Dienst
  // erfährt, wer hier bewertet (`src/geo/mmdb.ts`). Liegt keine Datenbank vor,
  // bleibt der Ort unbekannt und die Bewertung geht in die Moderation, statt
  // ungeprüft durchzugehen.
  const ortung = async () => {
    const treffer = await ortungFuerIp(absender);
    return treffer === null ? null : { lat: treffer.lat, lon: treffer.lon };
  };

  // Die Dauer rechnet der Server aus seinem eigenen Stempel - nicht aus einer
  // Zahl, die die Anfrage mitbringt. Der Stempel ist an die Schule gebunden;
  // ein für eine andere Schule geholter gilt hier nicht.
  //
  // Fehlt er ganz oder passt er nicht, ist das ein **Signal** und kein
  // stillschweigendes Nichts: Vorher war „Stempel weglassen“ der einfachste
  // Weg, die Tempoprüfung und die Plausibilisierung der Klickfolge zugleich
  // abzuschalten.
  /**
   * Empfehlungscode und Gerätekennung.
   *
   * **Der Cookie gilt.** Der Wert aus dem Local Storage springt nur ein, wenn
   * der Cookie fehlt - er kommt aus dem Browser und ließe sich in der Konsole
   * beliebig setzen. Als alleinige Quelle wäre er eine Einladung, sich selbst
   * zu werben; als Rückfall rettet er die Empfehlung, wenn Safari den Cookie
   * nach sieben Tagen kappt oder der Link in einer App geöffnet wurde.
   */
  const kekse = await cookies();
  const gesichert = eingabe.gesichert ?? {};
  const codeAusCookie = kekse.get(EMPFEHLUNGSCOOKIE)?.value ?? null;
  const codeAusSpeicher = typeof gesichert.refcode === "string" ? gesichert.refcode : null;
  const empfehlungscode = istEmpfehlungscode(codeAusCookie)
    ? codeAusCookie
    : istEmpfehlungscode(codeAusSpeicher)
      ? codeAusSpeicher
      : null;

  const geraet = gueltigeKennung(
    kekse.get(GERAETECOOKIE)?.value,
    typeof gesichert.geraet === "string" ? gesichert.geraet : null,
  );

  const slug = typeof eingabe.schulSlug === "string" ? eingabe.schulSlug : "";
  const stempel = typeof eingabe.stempel === "string" ? pruefeStempel(eingabe.stempel, slug) : null;
  const dauerSekunden = stempel?.ok ? stempel.dauerSekunden : null;
  const stempelFehlt = stempel === null || !stempel.ok;

  // Ist der Stempel abgelaufen, ist das kein Verdachtsfall, sondern ein
  // offenes Formular von gestern - und dafür gibt es eine Erklärung, die
  // bisher geschrieben war und nie ausgeliefert wurde.
  if (stempel !== null && !stempel.ok && stempel.grund === "abgelaufen") {
    return NextResponse.json(
      { ok: false, fehler: [{ feld: "", meldung: STEMPEL_HINWEIS.abgelaufen }] },
      { status: 422 },
    );
  }

  try {
    const ergebnis = await bewertungAbgeben(
      {
        ...eingabe,
        dauerSekunden,
        stempelFehlt,
        empfehlungscode,
        geraetekennung: geraet,
        klickabstaende: klickabstaende(eingabe.klickabstaende),
      },
      umgebungMitDatenbank(basis, ortung),
    );
    return NextResponse.json(ergebnis, { status: ergebnis.ok ? 201 : 422 });
  } catch (fehler) {
    console.error("Bewertung konnte nicht angenommen werden:", fehler);
    return NextResponse.json(
      {
        ok: false,
        fehler: [{ feld: "", meldung: "Da ist etwas schiefgegangen. Bitte versuche es später noch einmal." }],
      },
      { status: 500 },
    );
  }
}
