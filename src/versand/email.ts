/**
 * Der E-Mail-Weg - der erste, der wirklich zustellt.
 *
 * Bis hierher war jeder Versandweg der Protokollweg: Er schreibt die Nachricht
 * in die Serverausgabe und ist in der Produktion gesperrt. Das hiess im
 * Klartext, dass im Echtbetrieb **niemand** einen Bestätigungslink bekam, über
 * keinen Kanal - das Portal nahm Bewertungen an, die danach nie bestätigt
 * werden konnten.
 *
 * **Warum SMTP und nicht die Schnittstelle eines Anbieters.** Die Wahl des
 * Anbieters ist eine Entscheidung über Preis, Zustellquote und Ort der
 * Verarbeitung - keine Entscheidung über Code. Jeder Anbieter spricht SMTP;
 * eine JSON-Schnittstelle spricht nur einer. Mit SMTP wechselt man den
 * Anbieter, indem man vier Umgebungsvariablen ändert, und die
 * Datenschutzerklärung ist das Einzige, was danach noch anzufassen ist.
 *
 * **Verschlüsselung ist Pflicht, nicht Vorgabe.** Ohne `requireTLS` fällt ein
 * SMTP-Client stillschweigend auf Klartext zurück, wenn der Server kein
 * STARTTLS anbietet - und verschickt dann Zugangsdaten und Bestätigungslink
 * offen durchs Netz. Genau das wäre hier der teuerste Fehler: Der Link **ist**
 * das Geheimnis.
 */

import type { Nachricht, Versandweg, Zustellergebnis } from "./nachricht";

export interface Smtpeinstellungen {
  readonly host: string;
  readonly port: number;
  readonly benutzer: string;
  readonly kennwort: string;
  /** Absender, wie er im Postfach steht: `SCHULINDEX <info@schulindex.com>`. */
  readonly absender: string;
  /** Antwortadresse, falls Antworten woanders hinsollen als der Absender. */
  readonly antwortAn: string | null;
}

function ausUmgebung(name: string): string | null {
  const wert = process.env[name];
  return wert === undefined || wert.trim() === "" ? null : wert.trim();
}

/**
 * Die Einstellungen aus der Umgebung - oder `null`, wenn nichts eingerichtet ist.
 *
 * Unvollständig eingerichtet zählt als nicht eingerichtet. Ein Versand mit
 * Host, aber ohne Kennwort scheitert erst beim ersten echten Versuch, und zwar
 * an einer Stelle, an der niemand hinsieht.
 */
export function smtpAusUmgebung(): Smtpeinstellungen | null {
  const host = ausUmgebung("SMTP_HOST");
  const benutzer = ausUmgebung("SMTP_BENUTZER");
  const kennwort = ausUmgebung("SMTP_KENNWORT");
  const absender = ausUmgebung("SMTP_ABSENDER");
  if (host === null || benutzer === null || kennwort === null || absender === null) return null;

  const port = Number(ausUmgebung("SMTP_PORT") ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { host, port, benutzer, kennwort, absender, antwortAn: ausUmgebung("SMTP_ANTWORT_AN") };
}

/**
 * Prüft eine Empfängeradresse, bevor sie zu einer SMTP-Kopfzeile wird.
 *
 * **Warum noch einmal, obwohl das Formular schon prüft.** Weil hier aus einer
 * Zeichenkette ein Protokoll wird. Ein Zeilenumbruch in einer Adresse beendet
 * die Kopfzeile `To:` und beginnt eine neue - wer `opfer@x.de\nBcc: alle@…`
 * einschleust, verschickt über unseren Server, was er will. Die Prüfung im
 * Formular schneidet Leerraum ab und fängt das mit; darauf will ich mich an
 * dieser Stelle nicht verlassen, denn sie steht dort aus einem anderen Grund
 * und kann sich aus einem anderen Grund ändern.
 */
export function pruefeEmpfaenger(wert: string): string | null {
  const sauber = wert.trim();
  if (sauber.length === 0 || sauber.length > 254) return null;
  // Steuerzeichen jeder Art, nicht nur CR und LF: Auch ein NUL hat in einer
  // Kopfzeile nichts zu suchen.
  if (/[\u0000-\u001f\u007f]/.test(sauber)) return null;
  if (!/^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,}$/i.test(sauber)) return null;
  return sauber;
}

/**
 * Macht einen Text kopfzeilensicher.
 *
 * Der Betreff wird von uns gebaut - bis auf einen Fall: `baueSchulzugang`
 * setzt den Schulnamen hinein, und der kommt aus dem importierten
 * Schulverzeichnis. Ein Zeilenumbruch darin wäre dasselbe Loch wie in der
 * Adresse, nur über einen Weg, den niemand im Blick hat.
 */
export function kopfzeilensicher(text: string): string {
  return text.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200);
}

/** Was der Weg zum Versenden braucht - als Naht, damit er prüfbar bleibt. */
export type Versender = (auftrag: {
  von: string;
  antwortAn: string | null;
  an: string;
  betreff: string;
  text: string;
}) => Promise<void>;

/**
 * Baut den Versender auf Grundlage von nodemailer.
 *
 * Einmal angelegt und wiederverwendet (`pool`): Für jede Nachricht eine neue
 * Verbindung aufzubauen kostet bei den meisten Anbietern mehr Zeit als der
 * Versand selbst, und manche werten es als Missbrauch.
 */
function nodemailerVersender(e: Smtpeinstellungen): Versender {
  let transport: import("nodemailer").Transporter | null = null;

  return async (auftrag) => {
    if (transport === null) {
      const { createTransport } = await import("nodemailer");
      transport = createTransport({
        host: e.host,
        port: e.port,
        // 465 ist das implizite TLS, alles andere beginnt im Klartext und
        // hebt über STARTTLS ab - was `requireTLS` verbindlich macht.
        secure: e.port === 465,
        requireTLS: e.port !== 465,
        auth: { user: e.benutzer, pass: e.kennwort },
        tls: { minVersion: "TLSv1.2" },
        pool: true,
        maxConnections: 3,
        // Ohne diese drei hängt eine Abgabe an einem stummen Server, bis der
        // Browser aufgibt - und die Person sieht nie, ob etwas passiert ist.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }

    await transport.sendMail({
      from: e.absender,
      ...(auftrag.antwortAn === null ? {} : { replyTo: auftrag.antwortAn }),
      to: auftrag.an,
      subject: auftrag.betreff,
      text: auftrag.text,
    });
  };
}

/**
 * Der E-Mail-Weg.
 *
 * Wirft nicht: Ein Fehler beim Versand ist ein Ergebnis, kein Absturz - die
 * Kette in `nachricht.ts` soll den nächsten Weg versuchen können.
 */
export function emailweg(e: Smtpeinstellungen, versenden: Versender = nodemailerVersender(e)): Versandweg {
  return {
    art: "email",
    zustaendig: (empfaenger) => pruefeEmpfaenger(empfaenger) !== null,

    async sende(nachricht: Nachricht): Promise<Zustellergebnis> {
      const an = pruefeEmpfaenger(nachricht.empfaenger);
      if (an === null) return { ok: false, grund: "Adresse nicht zustellbar" };

      try {
        await versenden({
          von: e.absender,
          antwortAn: e.antwortAn,
          an,
          betreff: kopfzeilensicher(nachricht.betreff),
          text: nachricht.text,
        });
        return { ok: true, weg: "email" };
      } catch (fehler) {
        // **Nur die Art des Fehlers, nie die Nachricht.** Im Text steht der
        // Bestätigungslink; eine Fehlermeldung, die ihn mitführt, legt ihn in
        // jedem Protokoll ab, das diesen Grund später aufnimmt.
        const grund = fehler instanceof Error ? fehler.message : "unbekannter Fehler";
        return { ok: false, grund: `E-Mail-Versand fehlgeschlagen: ${kopfzeilensicher(grund)}` };
      }
    },
  };
}
