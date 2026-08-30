import { headers } from "next/headers";

/**
 * Läuft diese Anfrage über HTTPS?
 *
 * Davon hängt ab, ob die Sitzungscookies das Attribut `Secure` und das Präfix
 * `__Host-` bekommen. Bis hierher wurde das an `NODE_ENV` entschieden - und das
 * war der Grund, aus dem die Moderation auf dem Testserver bei jedem Klick auf
 * die Anmeldeseite zurückfiel: Der Server lief im Produktionsmodus, die Seite
 * aber über `http://<IP>:3000`. Das Cookie wurde also als `Secure` gesetzt, und
 * ein `Secure`-Cookie nimmt der Browser über eine unverschlüsselte Verbindung
 * nicht an. Anmeldung erfolgreich, Cookie weg, zurück zum Anfang.
 *
 * Deshalb entscheidet jetzt die Verbindung selbst, nicht die Betriebsart. Das
 * ist auch die richtige Reihenfolge: `Secure` beschreibt eine Eigenschaft der
 * Übertragung, nicht eine Einstellung des Betreibers - und genau deshalb gibt es
 * dafür bewusst **keinen Schalter im Panel**. Ein Schalter hier könnte nur zwei
 * Dinge bewirken, und beide sind schlecht: über HTTPS die Absicherung abnehmen,
 * oder über HTTP aussperren, ohne dass sich der Zustand von innen beheben ließe.
 *
 * Erkannt wird HTTPS am `X-Forwarded-Proto` des vorgeschalteten Servers
 * (Caddy, nginx) beziehungsweise am `Forwarded`-Kopf nach RFC 7239. Steht
 * keiner von beiden, läuft die Anwendung ohne Proxy und damit über HTTP.
 *
 * **Das ersetzt kein TLS.** Ohne HTTPS geht das Sitzungscookie im Klartext über
 * die Leitung; für den Echtbetrieb gehört ein Proxy mit Zertifikat davor. Diese
 * Erkennung sorgt nur dafür, dass der Testbetrieb nicht an einem Attribut
 * scheitert, das ohne TLS ohnehin nichts schützt.
 */
/**
 * Nur hinter einem eigenen Proxy ist der Kopf eine Auskunft, sonst eine
 * Behauptung des Absenders (dieselbe Überlegung wie in `src/geo/mmdb.ts`).
 * Ohne Proxy zählt allein die Verbindung selbst.
 */
function hinterProxy(): boolean {
  const roh = Number(process.env["VERTRAUTE_PROXYS"] ?? "0");
  return Number.isInteger(roh) && roh > 0;
}

export async function verbindungIstSicher(): Promise<boolean> {
  const kopf = await headers();

  if (!hinterProxy()) {
    // Ohne eigenen Proxy ist der Kopf eine Behauptung des Absenders und taugt
    // nicht. Eine Server Action sieht die Verbindung selbst nicht - was bleibt,
    // ist die Adresse, unter der das Portal betrieben wird. Sie steht in
    // `BASIS_URL` und ist eine Angabe des Betreibers, keine des Besuchers.
    //
    // `return false` stand hier einmal und war zu streng: Bei direktem TLS -
    // oder wenn jemand `VERTRAUTE_PROXYS` vergisst - bekam das Sitzungscookie
    // der Moderation weder `Secure` noch das `__Host-`-Präfix.
    return (process.env["BASIS_URL"] ?? "").startsWith("https://");
  }

  const weitergereicht = kopf.get("x-forwarded-proto");
  if (weitergereicht) {
    // Mehrere Proxys hängen ihre Werte aneinander: "https,http". Der erste ist
    // der äußere und damit der, den der Browser gesehen hat.
    return weitergereicht.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const rfc = kopf.get("forwarded");
  if (rfc) return /proto=("?)https\1/i.test(rfc);

  return false;
}

/** Dieselbe Frage für Route Handler, die die Anfrage ohnehin in der Hand haben. */
export function anfrageIstSicher(anfrage: Request): boolean {
  if (!hinterProxy()) return new URL(anfrage.url).protocol === "https:";

  const weitergereicht = anfrage.headers.get("x-forwarded-proto");
  if (weitergereicht) {
    return weitergereicht.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const rfc = anfrage.headers.get("forwarded");
  if (rfc) return /proto=("?)https\1/i.test(rfc);

  return new URL(anfrage.url).protocol === "https:";
}
