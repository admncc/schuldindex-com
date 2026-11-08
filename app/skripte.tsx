import { pruefeSchnipsel, type Platz, type Skript } from "@/domain/einbettung";

/**
 * Macht aus einem Schnipsel ein ausgeliefertes Skript.
 *
 * **Warum nicht einfach `<script>`-Elemente nach React geben.** Der erste
 * Entwurf tat genau das, und eine Prüfung hat ihn widerlegt: React behandelt
 * `<script async src=…>` besonders - es zieht solche Elemente in den
 * Dokumentkopf und liefert sie **vor** den übrigen aus. Der übliche Aufbau
 * eines Einwilligungsbanners besteht aber aus zwei Teilen in fester Reihenfolge:
 * erst ein kurzer Code, der `window.__tcfapi` als Warteschlange anlegt, dann
 * der Lader des Anbieters. Werden die beiden vertauscht, kann der Lader
 * loslaufen, bevor die Warteschlange steht - selten, von Zwischenspeicher und
 * Leitung abhängig, und damit genau die Art Fehler, die im Betrieb auftritt
 * und sich nicht nachstellen lässt.
 *
 * Deshalb geht der ganze Schnipsel als **ein** Skript hinaus, das die
 * Elemente selbst in der eingetragenen Reihenfolge anlegt. Damit gibt es
 * nichts mehr zu vertauschen: Ein angelegtes Skript mit Code läuft im
 * Augenblick des Anhängens, ein externes danach - und `async = false` hält
 * mehrere externe in der Reihenfolge, in der sie dastanden, ohne das
 * Seitenaufbau zu blockieren.
 *
 * Der Weg über Zeichenketten ist hier kein Leichtsinn, sondern das Gegenteil:
 * Jeder Wert geht durch `JSON.stringify`, Adressen sind auf `https` geprüft,
 * und ein `</script` im Inhalt wird gar nicht angenommen
 * (`domain/einbettung.ts`) - andernfalls käme der Schnipsel aus seinem eigenen
 * Element heraus.
 */

/** Attribute, die beim Anlegen nicht gesetzt werden, weil sie eigens behandelt sind. */
const EIGENS = new Set(["src", "async", "defer"]);

function anlegen(s: Skript): string {
  if (s.src === null) return `i(${JSON.stringify(s.code)});`;

  const weitere: Record<string, string> = {};
  for (const [name, wert] of Object.entries(s.attribute)) {
    if (EIGENS.has(name)) continue;
    weitere[name] = wert === true ? "" : wert;
  }
  // `async`/`defer` so, wie sie dastanden: Wer sie weggelassen hat, bekommt
  // `async = false` - geordnete Ausführung, aber ohne das Blockieren, das ein
  // einfaches <script src> im Dokument mit sich brächte.
  const art = "async" in s.attribute ? "a" : "defer" in s.attribute ? "d" : "o";
  return `e(${JSON.stringify(s.src)},${JSON.stringify(weitere)},${JSON.stringify(art)});`;
}

/**
 * Der Rahmen, der die Elemente anlegt.
 *
 * Bewusst klein und ohne Abhängigkeit: Er läuft als erstes auf der Seite, in
 * jedem Browser, auch in denen, die unser übriges JavaScript nicht ausführen.
 */
function rahmen(zeilen: string): string {
  return (
    "(function(){var d=document,h=d.head||d.documentElement;" +
    "function i(c){var s=d.createElement('script');s.text=c;h.appendChild(s);}" +
    "function e(u,m,t){var s=d.createElement('script');" +
    "for(var k in m){if(Object.prototype.hasOwnProperty.call(m,k))s.setAttribute(k,m[k]);}" +
    "if(t==='a')s.async=true;else if(t==='d')s.defer=true;else s.async=false;" +
    "s.src=u;h.appendChild(s);}" +
    zeilen +
    "})();"
  );
}

export function Skripte({ platz, inhalt }: { platz: Platz; inhalt: string }) {
  const geprueft = pruefeSchnipsel(inhalt);
  // Geprüft wird beim Speichern. Hier noch einmal, weil zwischen dem Speichern
  // und heute eine Fassung liegen kann, die strenger prüft - dann soll der
  // alte Schnipsel nicht ausgeliefert werden.
  if (!geprueft.ok || geprueft.skripte.length === 0) return null;

  return (
    <script
      data-einbettung={platz}
      dangerouslySetInnerHTML={{ __html: rahmen(geprueft.skripte.map(anlegen).join("")) }}
    />
  );
}
