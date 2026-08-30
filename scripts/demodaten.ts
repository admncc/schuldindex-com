/**
 * Erzeugt Demobewertungen für den Testbetrieb.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/demodaten.ts [--anzahl 900] [--schulen 40]
 *
 * Warum überhaupt: Ohne Bewertungen ist das Portal nicht zu beurteilen.
 * Ranglisten brauchen 20 Bewertungen je Schule, ein Profil 10, die Karte
 * bewertete Schulen, die Moderation eine Warteschlange. Wer mit leerer
 * Datenbank testet, sieht überall nur Leerzustände.
 *
 * **Die Daten sind erfunden und als solche gekennzeichnet** (`ist_demo`). Sie
 * lassen sich im Panel unter „Aufbewahrung“ mit einem Klick wieder entfernen,
 * ohne dass eine einzige echte Bewertung in Gefahr gerät.
 *
 * Zwei Dinge, die dabei wichtiger sind, als es klingt:
 *
 *  - **Kein Zufallsrauschen.** Jede Schule bekommt einen eigenen „Charakter“ -
 *    eine gute, eine mittlere, eine schlechte -, und die Antworten streuen um
 *    ihn herum. Gleichverteilter Zufall ergäbe überall denselben Mittelwert von
 *    3, und dann sähe man weder Ranglisten noch Ampelfarben arbeiten.
 *  - **Kein echter Kontakt.** Die Konten tragen erfundene Nummern im Bereich,
 *    der für Beispiele reserviert ist. Verschickt wird an Demokonten nichts;
 *    die Bestätigung ist bereits gesetzt.
 */

import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { FRAGEN, KATEGORIEN, KEINE_ANGABE, type Antwort, type KategorieId } from "../src/domain/fragebogen";
import { bewerte } from "../src/domain/scoring";
import { aktualisiereAggregat } from "../src/db/aggregate";
import { erzeugeEmpfehlungscode } from "../src/domain/empfehlungscode";
import { GEWINNE } from "../src/domain/verlosungsgewinne";

function argument(name: string, standard: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return standard;
  const wert = Number(process.argv[i + 1]);
  return Number.isFinite(wert) && wert > 0 ? Math.floor(wert) : standard;
}

const ANZAHL = argument("anzahl", 900);
const SCHULEN = argument("schulen", 40);

/**
 * `--nachtragen`: nur die Empfehlungen, nicht die Bewertungen.
 *
 * Ein Bestand, der vor den Empfehlungen entstanden ist, hat weder Lose noch
 * Gerätekennungen noch eine einzige Empfehlung - und ihn dafür wegzuwerfen und
 * neu zu würfeln, hiesse, jede Schule im Testbetrieb neu zu bewerten. Mit
 * diesem Schalter wird nur das nachgetragen, was fehlt.
 */
const NACHTRAGEN = process.argv.includes("--nachtragen");

/**
 * Wie viele Bewertungen eine Schule bekommt.
 *
 * Der erste Entwurf verteilte sie über eine quadratische Zufallsverteilung -
 * das sah nach echtem Betrieb aus und war als Testbestand unbrauchbar: Eine
 * Schule bekam 76 Bewertungen, der Schwanz je zwei, und **vier** von 55 Schulen
 * erreichten die Ranglistenschwelle von 20. Da jede der beiden Ranglisten
 * höchstens die Hälfte der infrage kommenden Schulen zeigt, standen am Ende
 * zwei Schulen in der Wertung.
 *
 * Deshalb wird jetzt zugeteilt statt gewürfelt, und zwar so, dass alle drei
 * Zustände des Portals vorkommen, die sich jemand ansehen können muss:
 *
 *  - **ranglistenfähig** (ab 20): der Regelfall im Testbestand,
 *  - **nur Profil** (10 bis 19): Score sichtbar, aber keine Rangliste,
 *  - **zu wenige** (1 bis 9): der Leerzustand, der im echten Betrieb auf
 *    Jahre der häufigste sein wird.
 */
const ANTEIL_RANGLISTE = 0.65;
const ANTEIL_NUR_PROFIL = 0.2;

/**
 * Ein fester Zufall.
 *
 * Zwei Läufe mit denselben Argumenten ergeben dieselben Daten. Das ist beim
 * Testen mehr wert, als es klingt: Wenn eine Rangliste seltsam aussieht, soll
 * sie nach dem nächsten Lauf noch genauso seltsam aussehen.
 */
function zufallsfolge(saat: string): () => number {
  let zustand = parseInt(createHash("sha256").update(saat).digest("hex").slice(0, 8), 16);
  return () => {
    // xorshift32 - reicht für Testdaten und braucht keine Abhängigkeit.
    zustand ^= zustand << 13;
    zustand ^= zustand >>> 17;
    zustand ^= zustand << 5;
    return ((zustand >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Normalverteilte Streuung um einen Mittelwert, auf 1–5 begrenzt. */
function umMittel(zufall: () => number, mittel: number, streuung: number): 1 | 2 | 3 | 4 | 5 {
  const summe = zufall() + zufall() + zufall() - 1.5;
  const wert = Math.round(mittel + summe * streuung * 2);
  return Math.min(5, Math.max(1, wert)) as 1 | 2 | 3 | 4 | 5;
}

const ROLLEN = ["schueler_ab_16", "schueler_unter_16", "eltern", "lehrkraft", "ehemalig"] as const;

const FREITEXTE: Readonly<Record<KategorieId, readonly string[]>> = {
  A: [
    "Auf dem Pausenhof ist meistens jemand von den Lehrkräften da, das hilft.",
    "In den Umkleiden gibt es öfter Ärger, da schaut niemand hin.",
    "Seit dem Streitschlichterprogramm ist es deutlich ruhiger geworden.",
  ],
  B: [
    "Der Unterricht fällt oft aus und wird selten nachgeholt.",
    "In den Naturwissenschaften wird viel experimentiert, das macht Spaß.",
    "Rückmeldungen zu Arbeiten kommen sehr spät.",
  ],
  C: [
    "Das WLAN funktioniert in der Hälfte der Räume nicht.",
    "Die Bibliothek ist gut ausgestattet und lange offen.",
    "Die Toiletten sind ein Dauerthema.",
  ],
  D: [
    "Auf E-Mails an das Sekretariat kommt zuverlässig eine Antwort.",
    "Entscheidungen werden getroffen, ohne dass jemand erklärt, warum.",
  ],
  E: [
    "Mülltrennung gibt es, wird aber kaum beachtet.",
    "Die Schulgarten-AG ist richtig gut.",
  ],
  F: [
    "Es gibt viele AGs, auch am Nachmittag.",
    "Ausflüge finden selten statt.",
  ],
};

/**
 * Verteilt das Kontingent auf die Schulen.
 *
 * Zuerst bekommt jede Schule ihre Untergrenze - 20, 10 oder 1 -, damit die drei
 * Zustände auch wirklich eintreten. Was übrig bleibt, geht an die
 * ranglistenfähigen, damit die Zahlen dort nicht alle gleich aussehen.
 *
 * Reicht das Kontingent nicht für alle Schulen, bekommen die hinteren nichts;
 * der Aufrufer erfährt das über die Summe, die zurückkommt.
 */
function teileZu(schulen: number, kontingent: number): number[] {
  const zufall = zufallsfolge("verteilung-v2");
  const zuteilung: number[] = [];

  const bisRangliste = Math.round(schulen * ANTEIL_RANGLISTE);
  const bisProfil = bisRangliste + Math.round(schulen * ANTEIL_NUR_PROFIL);

  let vergeben = 0;
  for (let i = 0; i < schulen; i++) {
    // 24 statt 20 für die ranglistenfähigen: Ein Teil der Bewertungen landet in
    // der Moderationswarteschlange und zählt noch nicht mit. Mit 20 als Basis
    // rutschten drei von 26 Schulen wieder unter die Schwelle.
    const grundwert =
      i < bisRangliste
        ? 24
        : i < bisProfil
          ? 11 + Math.floor(zufall() * 8)
          : 1 + Math.floor(zufall() * 8);
    if (vergeben + grundwert > kontingent) {
      zuteilung.push(0);
      continue;
    }
    zuteilung.push(grundwert);
    vergeben += grundwert;
  }

  // Der Rest geht an die ranglistenfähigen Schulen, in ungleichen Portionen -
  // sonst hätte jede exakt 20 und die Rangliste wäre ein Gleichstand.
  let rest = kontingent - vergeben;
  let i = 0;
  while (rest > 0 && bisRangliste > 0) {
    const stelle = i % bisRangliste;
    if ((zuteilung[stelle] ?? 0) > 0) {
      const portion = Math.min(rest, 1 + Math.floor(zufall() * 6));
      zuteilung[stelle] = (zuteilung[stelle] ?? 0) + portion;
      rest -= portion;
    }
    i += 1;
    if (i > kontingent * 4) break;
  }

  return zuteilung;
}

interface Schulcharakter {
  readonly id: string;
  readonly mittel: number;
  readonly streuung: number;
}

/** Was von einer erzeugten Bewertung für die Empfehlungen gebraucht wird. */
interface Angelegt {
  readonly kontoId: string;
  readonly bewertungId: string;
  readonly geraet: string;
  readonly teilnahme: boolean;
  readonly freigegeben: boolean;
}

/**
 * Empfehlungen, Codes und Gerätekennungen.
 *
 * Ohne diesen Schritt sind `empfehlungen`, `konten.empfehlungscode` und die
 * Super- und Mega-Ziehung im Testbestand leer, und die drei Bereiche, die
 * daraus leben - der Empfehlungsbereich der Moderation, der Verlosungsbereich
 * und der eigene Bereich der bewertenden Person - zeigen nur Nullen. Genau das
 * war der Befund aus der QA: Der neue Code war gegen echte Daten ungeprüft.
 *
 * Gebaut wird eine Verteilung, in der jeder Fall einmal vorkommt, den die
 * Auswertung unterscheiden muss:
 *
 *  - **ein Konto über der Mega-Schwelle**, damit die dritte Ziehung nicht
 *    dauerhaft „keine Teilnahmen" meldet,
 *  - **eine Handvoll mit mehreren Empfehlungen** und ein langer Schwanz mit
 *    genau einer - so sieht Werbung aus, wenn sie echt ist,
 *  - **einige aus demselben Browser**. Die zählen nicht und müssen trotzdem
 *    dastehen: Der Bereich markiert sie rot, und eine Markierung, die im
 *    Testbestand nie erscheint, ist ungeprüft.
 *  - **einige mit gehaltener Bewertung** der geworbenen Person. Die zählen
 *    ebenfalls nicht - „geworben" und „zählend" sind zwei Zahlen, und dass sie
 *    auseinandergehen, muss sich ansehen lassen.
 */
async function erzeugeEmpfehlungen(
  sql: postgres.Sql,
  angelegt: readonly Angelegt[],
  zufall: () => number,
): Promise<void> {
  // Werben kann nur, wer selbst eine veröffentlichte, teilnehmende Bewertung
  // hat - dieselbe Bedingung wie in `teilnahmen`.
  const werber = angelegt.filter((a) => a.freigegeben && a.teilnahme);
  // Geworben werden kann jeder, der noch nicht wirbt. Ein Konto kann nur
  // einmal geworben worden sein; das hält die Datenbank fest, und hier hält es
  // diese Menge fest.
  const offen = angelegt.filter((a) => !werber.slice(0, 40).includes(a));

  if (werber.length < 5 || offen.length < 20) {
    console.error("Zu wenige teilnehmende Bewertungen für Empfehlungen - übersprungen.");
    return;
  }

  // Zwei Töpfe: Für die Mega-Schwelle zählen nur veröffentlichte Bewertungen,
  // und wenn die geworbenen Konten quer durch den Bestand gegriffen werden,
  // fallen vierzehn Prozent davon in die Warteschlange - der eine Werber, der
  // über die Hundert kommen soll, landete so bei achtzig.
  const veroeffentlicht = offen.filter((a) => a.freigegeben);
  const uebrige = offen.filter((a) => !a.freigegeben);
  let ausVeroeffentlicht = 0;
  let ausUebrigen = 0;

  /** Ein Konto aus dem verlangten Topf; leert er sich, kommt der andere dran. */
  const nimm = (nurVeroeffentlicht: boolean): Angelegt | undefined => {
    if (nurVeroeffentlicht) return veroeffentlicht[ausVeroeffentlicht++];
    // Jede fünfte aus dem Topf der gehaltenen Bewertungen, damit „geworben" und
    // „zählend" auseinandergehen. Nicht mehr: Zuerst stand hier „erst die
    // gehaltenen, dann der Rest", und weil es davon über hundert gibt, hatten
    // alle Werber ausser dem ersten am Ende null zählende Empfehlungen - die
    // Super-Ziehung stand auf null, also genau da, wo sie vorher schon stand.
    const gehalten = zufall() < 0.2 && ausUebrigen < uebrige.length;
    return gehalten ? uebrige[ausUebrigen++] : veroeffentlicht[ausVeroeffentlicht++];
  };

  /** Die Empfehlungen eines Werbers, mit Zeitpunkt im gewünschten Monat. */
  const paare: { werber: Angelegt; geworben: Angelegt; tage: number; selbesGeraet: boolean }[] = [];

  /**
   * Wie viele Personen je Werber. Der erste kommt über die Mega-Schwelle, die
   * nächsten vier deutlich über die Super-Schwelle, der Rest hat eine oder zwei.
   */
  const mengen = [
    GEWINNE.mega.mindestEmpfehlungen + 8,
    14, 9, 6, 4,
    ...Array.from({ length: 25 }, () => 1 + Math.floor(zufall() * 2)),
  ];

  /** Der abgelaufene Monat - dorthin blickt die Moderation beim Ziehen. */
  const imVormonat = (): number => 32 + Math.floor(zufall() * 26);

  for (const [i, menge] of mengen.entries()) {
    const wer = werber[i];
    if (wer === undefined) break;
    // Der erste Werber ist der für die Mega-Ziehung: Seine Empfehlungen liegen
    // vollständig im Vormonat und vollständig auf veröffentlichten Bewertungen.
    // Über zwei Monate verteilt käme er in keinem der beiden über die Schwelle,
    // und die dritte Ziehung meldete auf Dauer „keine Teilnahmen".
    const fuerMega = i === 0;

    for (let n = 0; n < menge; n++) {
      const geworben = nimm(fuerMega);
      if (geworben === undefined) break;
      if (geworben.kontoId === wer.kontoId) continue;
      // Jede zwölfte Empfehlung kommt aus demselben Browser wie die des
      // Werbers - der Fall, den die Abwehr herausrechnet. Beim Mega-Werber
      // nicht: Eine einzige davon nähme ihm alle Lose auf einmal.
      const selbesGeraet = !fuerMega && n > 0 && zufall() < 0.08;
      paare.push({
        werber: wer,
        geworben,
        // Schwerpunkt im Vormonat, ein Teil im laufenden - sonst stünde der
        // eigene Bereich der bewertenden Person auf null.
        tage: fuerMega || zufall() < 0.75 ? imVormonat() : Math.floor(zufall() * 26),
        selbesGeraet,
      });
    }
  }

  if (paare.length === 0) return;

  // Erst die Codes: Ohne Code kein Link, und der Bereich zeigt ihn an.
  const codes = new Map<string, string>();
  for (const { werber: w } of paare) {
    if (codes.has(w.kontoId)) continue;
    codes.set(w.kontoId, erzeugeEmpfehlungscode());
  }
  for (const [kontoId, code] of codes) {
    await sql`update konten set empfehlungscode = ${code} where id = ${kontoId}`;
  }

  for (const paar of paare) {
    if (paar.selbesGeraet) {
      await sql`
        update bewertungen set geraet_hash = ${paar.werber.geraet} where id = ${paar.geworben.bewertungId}
      `;
    }
    await sql`
      insert into empfehlungen (werber_konto_id, geworbenes_konto_id, bewertung_id, erstellt_am)
      values (${paar.werber.kontoId}, ${paar.geworben.kontoId}, ${paar.geworben.bewertungId},
              now() - ${`${paar.tage} days`}::interval)
      on conflict (geworbenes_konto_id) do nothing
    `;
  }

  const [stand] = await sql<{ gesamt: number; zaehlend: number; werber: number }[]>`
    select count(*)::int as gesamt,
           count(*) filter (where b.status = 'freigegeben')::int as zaehlend,
           count(distinct e.werber_konto_id)::int as werber
    from empfehlungen e
    left join bewertungen b on b.id = e.bewertung_id
  `;
  console.error(
    `${stand?.gesamt} Empfehlungen von ${stand?.werber} Konten ` +
      `(${stand?.zaehlend} mit veröffentlichter Bewertung).`,
  );
}

/**
 * Ergänzt einen bestehenden Demobestand um Lose, Gerätekennungen und
 * Empfehlungen.
 *
 * Angefasst wird ausschliesslich, was `ist_demo` trägt - dieselbe Grenze wie
 * beim Löschen. Eine echte Bewertung bekommt hier unter keinen Umständen ein
 * Los angeheftet, das ihre Verfasserin nicht angekreuzt hat.
 *
 * Die Zuteilung hängt an der Bewertungskennung und nicht am Zufall: Ein zweiter
 * Lauf setzt dieselben Lose wie der erste, statt bei jedem Aufruf ein anderes
 * Drittel des Bestands in die Verlosung zu schieben.
 */
async function trageNach(sql: postgres.Sql, zufall: () => number): Promise<void> {
  const lose = await sql`
    update bewertungen set verlosung_teilnahme = true
    where ist_demo
      and not verlosung_teilnahme
      and rolle in ('schueler_unter_16', 'schueler_ab_16')
      and ('x' || substr(md5(id::text), 1, 8))::bit(32)::bigint % 100 < 72
  `;

  const geraete = await sql`
    update bewertungen set geraet_hash = encode(sha256(id::text::bytea), 'hex')
    where ist_demo and geraet_hash is null
  `;

  console.error(`${lose.count} Lose gesetzt, ${geraete.count} Gerätekennungen nachgetragen.`);

  const zeilen = await sql<
    { konto_id: string; id: string; geraet_hash: string; teilnahme: boolean; status: string }[]
  >`
    select b.konto_id, b.id, b.geraet_hash, b.verlosung_teilnahme as teilnahme, b.status::text
    from bewertungen b
    where b.ist_demo
      and not exists (select 1 from empfehlungen e where e.geworbenes_konto_id = b.konto_id)
    order by md5(b.id::text)
  `;

  await erzeugeEmpfehlungen(
    sql,
    zeilen.map((z) => ({
      kontoId: z.konto_id,
      bewertungId: z.id,
      geraet: z.geraet_hash,
      teilnahme: z.teilnahme,
      freigegeben: z.status === "freigegeben",
    })),
    zufall,
  );
}

async function main(): Promise<void> {
  const sql = postgres(process.env["DATABASE_URL"] ?? "", { onnotice: () => {} });
  const zufall = zufallsfolge("schulindex-demo-v1");

  try {
    const vorhanden = await sql<{ n: number }[]>`select count(*)::int as n from bewertungen where ist_demo`;

    if (NACHTRAGEN) {
      if ((vorhanden[0]?.n ?? 0) === 0) {
        console.error("Keine Demobewertungen vorhanden - erst ohne --nachtragen erzeugen.");
        return;
      }
      await trageNach(sql, zufall);
      return;
    }

    if ((vorhanden[0]?.n ?? 0) > 0) {
      console.error(
        `Es liegen bereits ${vorhanden[0]!.n} Demobewertungen vor. Erst löschen (Panel → Aufbewahrung), dann neu erzeugen.`,
      );
      return;
    }

    // Schulen mit Koordinate zuerst - nur die erscheinen auf der Karte -, aber
    // nicht ausschließlich: Auf einem Server, dessen Nachgeocodierung noch nicht
    // gelaufen ist, gäbe es sonst kaum Schulen und alle Bewertungen landeten auf
    // einer Handvoll davon.
    const schulen = await sql<{ id: string; name: string }[]>`
      select id, name from schulen
      where ist_aktiv
      order by (lat is null), md5(id::text)
      limit ${SCHULEN}
    `;
    if (schulen.length === 0) {
      console.error("Keine Schulen in der Datenbank. Erst importieren (scripts/importiere.ts).");
      return;
    }

    const charaktere: Schulcharakter[] = schulen.map((s) => ({
      id: s.id,
      // Von 2,2 bis 4,4: gute, mittelmäßige und schwache Schulen nebeneinander,
      // damit Ranglisten und Ampelfarben etwas zu zeigen haben.
      mittel: 2.2 + zufall() * 2.2,
      streuung: 0.4 + zufall() * 0.5,
    }));

    const zuteilung = teileZu(charaktere.length, ANZAHL);
    const gesamt = zuteilung.reduce((n, z) => n + z, 0);
    const ranglistenfaehig = zuteilung.filter((n) => n >= 20).length;
    console.error(
      `${charaktere.length} Schulen, ${gesamt} Bewertungen werden erzeugt ` +
        `(${ranglistenfaehig} Schulen über der Ranglistenschwelle) …`,
    );

    // Reihenfolge: Schule für Schule, aber die Zeitpunkte streuen ohnehin über
    // 400 Tage - für die Aggregation zählt nichts davon.
    let erzeugt = 0;
    const angelegt: Angelegt[] = [];
    for (let index = 0; index < charaktere.length; index++) {
      const schule = charaktere[index]!;
      for (let n = 0; n < (zuteilung[index] ?? 0); n++) {
      const rolle = ROLLEN[Math.floor(zufall() * ROLLEN.length)]!;

      const antworten: Record<string, Antwort> = {};
      for (const frage of FRAGEN) {
        const pflicht = ["A", "B", "C"].includes(frage.kategorie);
        // Optionale Kategorien beantwortet nur ein Teil - genau der Fall, für
        // den die Aggregation je Kategorie mittelt statt Gesamtscores.
        if (!pflicht && zufall() > 0.45) continue;
        if (zufall() < 0.04) {
          antworten[frage.id] = KEINE_ANGABE;
          continue;
        }
        antworten[frage.id] =
          frage.teilbereich === "aggression"
            ? // Häufigkeitsfragen laufen andersherum: An einer guten Schule wird
              // selten gemobbt, der Rohwert ist also niedrig.
              umMittel(zufall, 6 - schule.mittel, schule.streuung)
            : umMittel(zufall, schule.mittel, schule.streuung);
      }

      const freitexte: Record<string, string> = {};
      for (const k of KATEGORIEN) {
        const texte = FREITEXTE[k.id];
        if (zufall() < 0.35 && texte.length > 0) {
          freitexte[k.id] = texte[Math.floor(zufall() * texte.length)]!;
        }
      }

      const scores = bewerte(antworten);
      const tageZurueck = Math.floor(zufall() * 400);
      // Die meisten freigegeben, ein Rest in der Warteschlange - sonst hat die
      // Moderation nichts zu tun und der Ablauf lässt sich nicht ansehen.
      const los = zufall();
      const status = los < 0.86 ? "freigegeben" : los < 0.94 ? "in_pruefung_betrug" : "in_pruefung_geo";
      const klassenstufe = rolle.startsWith("schueler") ? 5 + Math.floor(zufall() * 9) : null;
      // Die Verlosung steht nur Schülerinnen und Schülern offen - so steht es
      // in der Prüfbedingung an der Tabelle. Von denen kreuzt es der grössere
      // Teil an, aber nicht alle: Ein Bestand, in dem jedes Los gezogen ist,
      // zeigt den Fall nicht, um den es beim Ziehen geht.
      const teilnahme = rolle.startsWith("schueler") && zufall() < 0.72;
      // Die Gerätekennung ist im Betrieb ein HMAC. Was hier steht, muss nur
      // dieselbe Form haben und sich zwischen Konten unterscheiden - verglichen
      // wird sie ausschliesslich mit sich selbst.
      const geraet = createHash("sha256").update(`geraet-${erzeugt}-${zufall()}`).digest("hex");

      // Die Kennungen wandern aus der Transaktion heraus: Aus ihnen entstehen
      // gleich die Empfehlungen, und die brauchen fertige, sichtbare Zeilen.
      const merker = { kontoId: "", bewertungId: "" };
      await sql.begin(async (tx: postgres.TransactionSql) => {
        const [konto] = await tx<{ id: string }[]>`
          insert into konten (kontakt_chiffre, kontakt_hash, kontaktart, verifiziert_am, erstellt_am, ist_demo)
          values (decode('00', 'hex'), ${`demo-${randomUUID()}`}, 'sms',
                  now() - ${`${tageZurueck} days`}::interval,
                  now() - ${`${tageZurueck} days`}::interval, true)
          returning id
        `;

        const [bewertung] = await tx<{ id: string }[]>`
          insert into bewertungen (
            schule_id, konto_id, rolle, klassenstufe, status,
            datenschutz_einwilligung_am, eltern_einwilligung_am, einwilligung_fassung,
            geo_entfernung_km, geo_unbekannt, erstellt_am, aktualisiert_am,
            moderiert_am, verlosung_teilnahme, geraet_hash, ist_demo
          ) values (
            ${schule.id}, ${konto!.id}, ${rolle}::rolle, ${klassenstufe}, ${status}::bewertungsstatus,
            now() - ${`${tageZurueck} days`}::interval,
            ${rolle === "schueler_unter_16" ? tx`now() - ${`${tageZurueck} days`}::interval` : null},
            'v1', ${Math.round(zufall() * 40)}, false,
            now() - ${`${tageZurueck} days`}::interval,
            now() - ${`${tageZurueck} days`}::interval,
            ${status === "freigegeben" ? tx`now() - ${`${tageZurueck} days`}::interval` : null},
            ${teilnahme}, ${geraet}, true
          )
          returning id
        `;

        const kategorie = (id: string) => scores.kategorien.find((k) => k.kategorie === id)?.score ?? null;
        await tx`
          insert into bewertung_versionen (
            bewertung_id, version, antworten, freitexte,
            score_a, score_b, score_c, score_d, score_e, score_f,
            aggressionsindex, gesamtscore, erstellt_am
          ) values (
            ${bewertung!.id}, 1, ${tx.json(antworten as never)}, ${tx.json(freitexte as never)},
            ${kategorie("A")}, ${kategorie("B")}, ${kategorie("C")},
            ${kategorie("D")}, ${kategorie("E")}, ${kategorie("F")},
            ${scores.aggression?.index ?? null}, ${scores.gesamtscore},
            now() - ${`${tageZurueck} days`}::interval
          )
        `;

        merker.kontoId = konto!.id;
        merker.bewertungId = bewertung!.id;
      });

      angelegt.push({
        kontoId: merker.kontoId,
        bewertungId: merker.bewertungId,
        geraet,
        teilnahme,
        freigegeben: status === "freigegeben",
      });

      erzeugt += 1;
      if (erzeugt % 100 === 0) console.error(`  ${erzeugt} …`);
      }
    }

    console.error("Aggregate werden neu gerechnet …");
    for (const schule of schulen) await aktualisiereAggregat(schule.id);

    console.error("Empfehlungen werden angelegt …");
    await erzeugeEmpfehlungen(sql, angelegt, zufall);

    const [lage] = await sql<{ freigegeben: number; wartend: number; schulen: number }[]>`
      select count(*) filter (where status = 'freigegeben')::int as freigegeben,
             count(*) filter (where status in ('in_pruefung_geo', 'in_pruefung_betrug'))::int as wartend,
             count(distinct schule_id)::int as schulen
      from bewertungen where ist_demo
    `;
    console.error(
      `Fertig: ${erzeugt} Demobewertungen über ${lage?.schulen} Schulen ` +
        `(${lage?.freigegeben} freigegeben, ${lage?.wartend} in der Warteschlange).`,
    );
    console.error("Entfernen im Panel unter Aufbewahrung → Demodaten.");
  } finally {
    await sql.end();
  }
}

await main();
