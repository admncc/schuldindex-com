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
export async function verbindungIstSicher(): Promise<boolean> {
  const kopf = await headers();

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
  const weitergereicht = anfrage.headers.get("x-forwarded-proto");
  if (weitergereicht) {
    return weitergereicht.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const rfc = anfrage.headers.get("forwarded");
  if (rfc) return /proto=("?)https\1/i.test(rfc);

  return new URL(anfrage.url).protocol === "https:";
}
