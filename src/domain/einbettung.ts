/**
 * Fremde Skripte, die im Panel hinterlegt werden.
 *
 * Der Anlass: Das Einwilligungsbanner kommt nicht von uns, sondern von einem
 * Anbieter (hier InMobi CMP), und die Reichweitenmessung hängt daran. Beides
 * wird beim Anbieter zusammengeklickt und als Schnipsel ausgegeben - in den
 * Code gehört es nicht, weil es sich ändert, ohne dass sich das Portal ändert,
 * und weil jede Änderung sonst eine Auslieferung kostet.
 *
 * Was hier **nicht** passiert: ein Textfeld, das seinen Inhalt ungeprüft in
 * jede Seite schreibt. Das wäre die bequemste Variante und zugleich eine
 * offene Tür - wer das Panel erreicht, könnte damit jedem Besucher beliebiges
 * HTML unterschieben. Deshalb wird der Schnipsel zerlegt: Er darf aus
 * `<script>`-Elementen bestehen und aus nichts anderem. Kein `<iframe>`, kein
 * `<img onerror=…>`, kein Stylesheet, keine Ereignisattribute, keine
 * `http:`-Adressen. Was nicht als Skript lesbar ist, wird abgelehnt, und zwar
 * mit Begründung - nicht stillschweigend weggefiltert, weil der Betreiber
 * sonst glaubt, sein Banner sei eingebaut.
 *
 * Das hebt die Gefahr nicht auf: Ein Skript von `cmp.inmobi.com` kann alles,
 * was JavaScript kann. Die Prüfung verkleinert sie auf die Entscheidung, die
 * der Betreiber bewusst trifft - **welchem Anbieter** er die Seite öffnet -,
 * statt sie zur Nebenwirkung eines Tippfehlers zu machen. Welche Hosts das
 * sind, zeigt das Panel an, und die Datenschutzerklärung nennt sie.
 */

/** Wo ein Schnipsel steht. Die Reihenfolge ist die der Ausführung. */
export type Platz = "einwilligung" | "messung";

export const PLAETZE: readonly Platz[] = ["einwilligung", "messung"];

export interface Platzbeschreibung {
  readonly platz: Platz;
  readonly label: string;
  readonly hilfe: string;
}

export const PLATZBESCHREIBUNG: readonly Platzbeschreibung[] = [
  {
    platz: "einwilligung",
    label: "Einwilligungsbanner (CMP)",
    hilfe:
      "Der Schnipsel des Anbieters, der nach der Einwilligung fragt - bei InMobi CMP die Zeilen aus „Install the CMP“. Steht als erstes auf jeder öffentlichen Seite, damit er die Einwilligung auf „abgelehnt“ setzen kann, bevor etwas anderes lädt. Die Moderation bekommt ihn nicht: dort wird nicht gemessen.",
  },
  {
    platz: "messung",
    label: "Reichweitenmessung (z. B. Google Analytics)",
    hilfe:
      "Läuft nach dem Banner. Trag hier nur Skripte ein, die den Einwilligungsmodus beachten (bei Google Analytics: „Consent Mode“, vom CMP gesteuert) - sonst messen sie, bevor jemand zugestimmt hat, und die Einwilligung wäre eine Behauptung. Ohne hinterlegtes Banner bleibt dieses Feld ohne Wirkung.",
  },
];

/**
 * Mehr als 32 KB ist kein Schnipsel mehr.
 *
 * Die Stubs der großen CMP-Anbieter sind groß (die IAB-TCF-Vorlage allein
 * bringt einige Kilobyte mit), deshalb nicht zu knapp. Eine Grenze braucht es
 * trotzdem: Sie geht in jede Seitenauslieferung ein.
 */
export const HOECHSTLAENGE = 32_768;

export interface Skript {
  /** Externe Quelle, oder `null` bei einem Skript mit Code im Schnipsel. */
  readonly src: string | null;
  /** Der Code zwischen den Tags. Leer bei einem externen Skript. */
  readonly code: string;
  /** Weitere Attribute, die so ausgeliefert werden, wie sie dastanden. */
  readonly attribute: Readonly<Record<string, string | true>>;
}

export type Pruefung =
  | {
      readonly ok: true;
      readonly skripte: readonly Skript[];
      /** Die fremden Hosts - für das Panel und die Datenschutzerklärung. */
      readonly hosts: readonly string[];
      /** Was auffiel, ohne die Annahme zu verhindern. */
      readonly hinweise: readonly string[];
    }
  | { readonly ok: false; readonly meldung: string };

/**
 * Löst HTML-Entitäten in einem Attributwert auf.
 *
 * **Der Fund, der das nötig gemacht hat.** Die erste Fassung las Attributwerte
 * roh. Ein Browser tut das nicht: In einem Attribut ist `&amp;` ein
 * kaufmännisches Und, `&quot;` ein Anführungszeichen. Der Unterschied ist
 * nicht theoretisch - Schnipsel von Tag-Verwaltungen tragen ihre Parameter
 * regelmässig als `?id=X&amp;v=2`, und roh weitergereicht lädt der Browser
 * eine Adresse mit einem literalen „&amp;" darin. Das Banner erscheint dann
 * nicht, und niemand weiss, warum.
 *
 * **Die Reihenfolge ist sicherheitsrelevant.** Aufgelöst wird *vor* der
 * Prüfung auf `</script` in `pruefeSchnipsel` - sonst käme ein
 * `&lt;/script&gt;` ungeprüft durch und bräche beim Ausliefern aus dem
 * umgebenden Element aus. Deshalb steht die Auflösung hier in der
 * Attributzerlegung und nicht erst beim Ausliefern.
 */
function entschluessle(wert: string): string {
  return wert.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (ganz, kern: string) => {
    const k = kern.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos" || k === "#39") return "'";
    if (k.startsWith("#x")) {
      const n = Number.parseInt(k.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ganz;
    }
    if (k.startsWith("#")) {
      const n = Number.parseInt(k.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ganz;
    }
    // Was wir nicht kennen, bleibt stehen. Eine halb geratene Auflösung wäre
    // schlechter als gar keine.
    return ganz;
  });
}

/**
 * Attribute, die ein `<script>` behalten darf.
 *
 * Eine Positivliste, keine Sperrliste: Bei einer Sperrliste entscheidet die
 * Vollständigkeit meiner Erinnerung darüber, was durchkommt. `data-*` ist
 * zusätzlich erlaubt - CMP-Schnipsel übergeben darüber ihre Kennungen.
 */
const ERLAUBTE_ATTRIBUTE = new Set([
  "src",
  "async",
  "defer",
  "type",
  "id",
  "class",
  "charset",
  "crossorigin",
  "integrity",
  "referrerpolicy",
  "fetchpriority",
  "nomodule",
]);

interface Rohskript {
  readonly attribute: Readonly<Record<string, string | true>>;
  readonly code: string;
}

/** Zerlegt die Attribute eines Tags. */
function leseAttribute(roh: string): Record<string, string | true> | string {
  const attribute: Record<string, string | true> = {};
  const muster = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let rest = roh;

  for (const treffer of roh.matchAll(muster)) {
    rest = rest.replace(treffer[0], "");
    const name = (treffer[1] ?? "").toLowerCase();
    const wert = treffer[2] ?? treffer[3] ?? treffer[4];

    // Ereignisattribute zuerst, mit eigener Meldung: Das ist der Weg, auf dem
    // Code in eine Seite kommt, ohne wie Code auszusehen.
    if (name.startsWith("on")) return `Das Attribut „${name}“ führt Code aus und ist hier nicht erlaubt.`;
    if (!ERLAUBTE_ATTRIBUTE.has(name) && !name.startsWith("data-")) {
      return `Das Attribut „${name}“ ist in einem eingebetteten Skript nicht erlaubt.`;
    }
    attribute[name] = wert === undefined ? true : entschluessle(wert);
  }

  // Was die Attributsuche nicht erfasst hat, darf nur Leerraum und das
  // Schrägzeichen eines selbstschließenden Tags sein.
  if (rest.replace(/[\s/]/g, "") !== "") {
    return "Im Skript-Tag steht etwas, das sich nicht als Attribut lesen lässt.";
  }
  return attribute;
}

/**
 * Trennt den Schnipsel in Skripte.
 *
 * Von Hand und nicht mit einem HTML-Parser: Der Server hat kein DOM, und eine
 * zusätzliche Abhängigkeit für zwei Tag-Arten wäre mehr Angriffsfläche als
 * Hilfe. Erlaubt sind `<script>`, HTML-Kommentare und Leerraum; `<noscript>`
 * wird verworfen - ohne JavaScript messen und fragen diese Anbieter nicht,
 * und ein `<iframe>` darin käme sonst durch die Hintertür herein.
 */
function zerlege(roh: string): { skripte: Rohskript[]; noscript: boolean } | string {
  const skripte: Rohskript[] = [];
  let noscript = false;
  let i = 0;

  while (i < roh.length) {
    const naechstes = roh.indexOf("<", i);
    if (naechstes === -1) {
      if (roh.slice(i).trim() !== "") return "Zwischen den Skripten steht Text, der dort nicht hingehört.";
      break;
    }
    if (roh.slice(i, naechstes).trim() !== "") {
      return "Zwischen den Skripten steht Text, der dort nicht hingehört.";
    }
    i = naechstes;
    const ab = roh.slice(i);

    if (ab.startsWith("<!--")) {
      const ende = roh.indexOf("-->", i);
      if (ende === -1) return "Ein HTML-Kommentar wird nicht geschlossen.";
      i = ende + 3;
      continue;
    }

    if (/^<noscript[\s>]/i.test(ab)) {
      const ende = roh.toLowerCase().indexOf("</noscript>", i);
      if (ende === -1) return "Ein <noscript>-Block wird nicht geschlossen.";
      noscript = true;
      i = ende + "</noscript>".length;
      continue;
    }

    if (!/^<script[\s>]/i.test(ab)) {
      const name = /^<\/?\s*([a-zA-Z0-9-]*)/.exec(ab)?.[1] ?? "";
      return name === ""
        ? "Der Schnipsel enthält ein Zeichen „<“, das zu keinem Tag gehört."
        : `Hier ist nur <script> erlaubt, nicht <${name.toLowerCase()}>.`;
    }

    const tagende = roh.indexOf(">", i);
    if (tagende === -1) return "Ein Skript-Tag wird nicht geschlossen.";
    const attribute = leseAttribute(roh.slice(i + "<script".length, tagende));
    if (typeof attribute === "string") return attribute;

    // Innerhalb eines Skripts gibt es keine Verschachtelung: Das erste
    // </script> beendet es - genau so liest der Browser es auch.
    const schluss = roh.toLowerCase().indexOf("</script>", tagende);
    if (schluss === -1) return "Ein <script> wird nicht mit </script> geschlossen.";

    skripte.push({ attribute, code: roh.slice(tagende + 1, schluss) });
    i = schluss + "</script>".length;
  }

  return { skripte, noscript };
}

/**
 * Prüft einen eingetragenen Schnipsel.
 *
 * Ein leerer Schnipsel ist kein Fehler, sondern „nichts eingebettet“: Das ist
 * der Weg, eine Einbettung wieder loszuwerden.
 */
export function pruefeSchnipsel(roh: string): Pruefung {
  const text = roh.trim();
  if (text === "") return { ok: true, skripte: [], hosts: [], hinweise: [] };
  if (text.length > HOECHSTLAENGE) {
    return {
      ok: false,
      meldung: `Der Schnipsel ist ${text.length} Zeichen lang, erlaubt sind ${HOECHSTLAENGE}.`,
    };
  }
  // Steuerzeichen, die auf dem Weg nach draussen Schaden anrichten: NUL
  // nimmt Postgres in einer text-Spalte nicht an, und die Zeilentrenner
  // U+2028/U+2029 beenden mitten im Code ein JavaScript-Statement.
  const BOESE = [0x00, 0x2028, 0x2029];
  if ([...text].some((z) => BOESE.includes(z.codePointAt(0) ?? 0))) {
    return { ok: false, meldung: "Der Schnipsel enthält unzulässige Steuerzeichen." };
  }

  const zerlegt = zerlege(text);
  if (typeof zerlegt === "string") return { ok: false, meldung: zerlegt };
  if (zerlegt.skripte.length === 0) {
    return { ok: false, meldung: "In dem Schnipsel steht kein <script>." };
  }

  const skripte: Skript[] = [];
  const hosts = new Set<string>();
  const hinweise: string[] = [];
  if (zerlegt.noscript) {
    hinweise.push(
      "Der <noscript>-Teil wurde weggelassen. Ohne JavaScript fragt der Anbieter nicht und misst nicht - und ein eingebetteter Rahmen käme damit an der Prüfung vorbei.",
    );
  }

  for (const [nummer, s] of zerlegt.skripte.entries()) {
    const { src, ...rest } = s.attribute;
    const hatCode = s.code.trim() !== "";

    if (src === true) return { ok: false, meldung: `Skript ${nummer + 1} hat ein „src“ ohne Adresse.` };
    if (src === undefined && !hatCode) {
      return { ok: false, meldung: `Skript ${nummer + 1} ist leer und hat kein „src“.` };
    }
    if (src !== undefined && hatCode) {
      // Der Browser führt in diesem Fall nur die externe Datei aus. Wer Code
      // zwischen die Tags schreibt, erwartet aber, dass er läuft.
      return {
        ok: false,
        meldung: `Skript ${nummer + 1} hat ein „src“ und zusätzlich Code - der Browser würde den Code verwerfen. Bitte in zwei <script> trennen.`,
      };
    }

    if (src !== undefined) {
      let adresse: URL;
      try {
        adresse = new URL(src);
      } catch {
        return {
          ok: false,
          meldung: `„${src}“ ist keine vollständige Adresse. Bitte mit https:// und Host eintragen - auch „//host/…“ nicht.`,
        };
      }
      if (adresse.protocol !== "https:") {
        return { ok: false, meldung: `Skript ${nummer + 1} lädt über „${adresse.protocol}“ statt über https.` };
      }
      hosts.add(adresse.host);
    }

    // **Ausbruch aus dem eigenen Skript.** Der Zerleger schneidet beim ersten
    // `</script>`, aber die HTML-Regeln lassen auch `</script >` als Schluss
    // gelten - und ausgeliefert wird der Schnipsel am Ende in *einem*
    // Skript-Element (`app/skripte.tsx`). Ein solches Zeichenpaar im Code oder
    // in einem Attributwert beendete es dort vorzeitig, und alles Weitere
    // stuende als HTML in der Seite. Also: gar nicht erst annehmen.
    for (const wert of [s.code, ...Object.values(s.attribute).filter((v) => v !== true)]) {
      if (/<\/script/i.test(String(wert))) {
        return {
          ok: false,
          meldung: `Skript ${nummer + 1} enthält „</script" im Inhalt. Das lässt sich nicht sicher ausliefern.`,
        };
      }
    }

    if (/document\.write/i.test(s.code)) {
      hinweise.push(
        `Skript ${nummer + 1} benutzt document.write. Läuft es nach dem Laden der Seite, löscht das die Seite.`,
      );
    }

    skripte.push({ src: src ?? null, code: src === undefined ? s.code : "", attribute: rest });
  }

  return { ok: true, skripte, hosts: [...hosts].sort(), hinweise };
}

/** Die fremden Hosts aller eingebetteten Schnipsel - für die Datenschutzerklärung. */
export function hostsAus(schnipsel: Iterable<string>): readonly string[] {
  const hosts = new Set<string>();
  for (const s of schnipsel) {
    const p = pruefeSchnipsel(s);
    if (p.ok) for (const h of p.hosts) hosts.add(h);
  }
  return [...hosts].sort();
}
