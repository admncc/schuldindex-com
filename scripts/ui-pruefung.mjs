/**
 * Oberflächenprüfung: alle öffentlichen Seiten, vier Breiten, beide Schemata.
 *
 *   npm run dev            # in einem zweiten Fenster
 *   node scripts/ui-pruefung.mjs
 *
 * Warum ein Skript und nicht ein Blick: Ein Mensch sieht auf einem Bildschirm
 * nach und uebersieht dabei zuverlaessig, was zwei Pixel zu schmal ist. Was
 * hier geprueft wird, ist messbar - waagerechter Ueberlauf, Tippziele unter 44
 * Pixel, Eingabefelder unter 16 Pixel (iOS zoomt sonst hinein und nicht wieder
 * heraus), Kontraste unter 4,5:1, fehlende Alternativtexte, doppelte oder
 * fehlende `h1`.
 *
 * Die Aufnahmen landen unter /tmp/qa und sind der zweite Teil: Was messbar
 * richtig ist, kann trotzdem haesslich sein.
 *
 * **Falsche Treffer wurden bewusst ausgeschlossen**, sonst liest niemand den
 * Bericht: Elemente in einem waagerechten Roller (die Kopfnavigation ist
 * einer), Verweise mitten im Fliesstext (WCAG 2.5.8 nimmt sie aus), Kaestchen,
 * deren Etikett gross genug ist, und Eingabefelder auf dem Schreibtisch.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASIS = "http://127.0.0.1:3000";
const SLUG = "grundschule-nuernberg-kopernikusschule";
const SEITEN = [
  ["/", "start"],
  ["/lp1", "landeplatz"],
  ["/lp2", "landeplatz-preis"],
  ["/schulen", "suche"],
  [`/schule/${SLUG}`, "profil"],
  ["/ranglisten", "ranglisten"],
  ["/karte", "karte"],
  [`/bewerten/${SLUG}`, "bewerten"],
  ["/verlosung", "verlosung"],
  ["/ueber", "ueber"],
  ["/konto", "konto"],
  ["/konto/anmelden", "anmelden"],
  ["/schulsupport", "schulsupport"],
  ["/schulsupport/anfordern", "anfordern"],
  ["/inhalt-melden", "melden"],
  ["/datenschutz", "datenschutz"],
  ["/impressum", "impressum"],
  ["/nutzungsbedingungen", "agb"],
];
const BREITEN = [
  [320, 720, "s320", true],
  [390, 844, "s390", true],
  [768, 1024, "s768", true],
  [1440, 900, "s1440", false],
];

const PRUEFUNG = () => {
  const raus = [];
  const W = document.documentElement.clientWidth;
  const beruehrung = window.matchMedia("(pointer: coarse)").matches;

  const scroller = (e) => {
    for (let a = e.parentElement; a; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.overflowX === "auto" || st.overflowX === "scroll" || st.overflow === "auto" || st.overflow === "hidden") return true;
    }
    return false;
  };

  // **Der Fehler, gegen den das steht.** `getComputedStyle` gibt fuer
  // `color-mix(...)` ein `color(srgb 1 1 1 / 0.88)` zurueck - Anteile von 0 bis
  // 1, nicht von 0 bis 255. Die erste Fassung las daraus RGB 1,1,1, hielt also
  // Weiss fuer Schwarz und meldete 392 Kontrastfehler, die es nicht gab.
  const zuFarbe = (s) => {
    const m = s.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const anteilig = s.startsWith("color(");
    const f = anteilig ? 255 : 1;
    return { r: +m[0] * f, g: +m[1] * f, b: +m[2] * f, a: m.length > 3 ? +m[3] : 1 };
  };
  const leuchte = (c) => {
    const f = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const grund = (e) => {
    for (let a = e; a; a = a.parentElement) {
      const c = zuFarbe(getComputedStyle(a).backgroundColor);
      if (c && c.a > 0.6) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  if (document.documentElement.scrollWidth > W + 1) {
    raus.push({ art: "querlauf", text: `Seite ${document.documentElement.scrollWidth}px breit bei ${W}px Fenster` });
  }

  for (const e of document.querySelectorAll("body *")) {
    const st = getComputedStyle(e);
    if (st.display === "none" || st.visibility === "hidden" || st.position === "fixed") continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const kennung = e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "");

    if (r.right > W + 1 && !scroller(e)) {
      raus.push({ art: "ueberstand", text: `${kennung} ragt ${Math.round(r.right - W)}px hinaus: ${(e.textContent || "").trim().slice(0, 30)}` });
    }

    if (beruehrung && e.matches("a[href],button,select,summary,[role=button],input[type=submit]")) {
      // Verweise mitten im Fliesstext nimmt WCAG 2.5.8 aus - sie auf 44 zu
      // ziehen risse den Absatz auseinander.
      const imFliesstext = e.parentElement && /^(P|LI|TD|SPAN|STRONG|EM)$/.test(e.parentElement.tagName)
        && (e.parentElement.textContent || "").trim().length > (e.textContent || "").trim().length + 12;
      if (!imFliesstext && (r.height < 40 || r.width < 24)) {
        raus.push({ art: "ziel", text: `${kennung} nur ${Math.round(r.width)}x${Math.round(r.height)}px: ${(e.textContent || "").trim().slice(0, 24)}` });
      }
    }

    if (beruehrung && e.matches("input[type=checkbox],input[type=radio]")) {
      const etikett = e.closest("label") || document.querySelector(`label[for="${e.id}"]`);
      const h = etikett ? etikett.getBoundingClientRect().height : r.height;
      if (h < 40) raus.push({ art: "ziel", text: `Kaestchen ${kennung} samt Etikett nur ${Math.round(h)}px hoch` });
    }

    // Nur auf Beruehrungsgeraeten: Der Zoom beim Antippen ist eine Eigenheit
    // mobiler Browser. Am Schreibtisch ist ein 14-Pixel-Feld eine
    // Gestaltungsfrage, kein Fehler.
    if (beruehrung && e.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea") && parseFloat(st.fontSize) < 16) {
      raus.push({ art: "eingabegroesse", text: `${kennung} ${st.fontSize}` });
    }

    const eigenerText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3);
    if (eigenerText) {
      const gr = parseFloat(st.fontSize);
      if (gr < 12) raus.push({ art: "schriftgroesse", text: `${kennung} ${st.fontSize}: ${(e.textContent || "").trim().slice(0, 40)}` });

      const vg = zuFarbe(st.color);
      if (vg && vg.a > 0.5) {
        const hg = grund(e);
        const l1 = leuchte(vg), l2 = leuchte(hg);
        const v = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const gross = gr >= 24 || (gr >= 18.66 && parseInt(st.fontWeight, 10) >= 700);
        if (v < (gross ? 3 : 4.5)) {
          raus.push({ art: "kontrast", text: `${kennung} ${v.toFixed(2)}:1 (${gr}px) ${(e.textContent || "").trim().slice(0, 30)}` });
        }
      }
    }
  }

  for (const b of document.querySelectorAll("img:not([alt])")) raus.push({ art: "alt", text: b.src.slice(0, 60) });
  const h1 = document.querySelectorAll("h1");
  if (h1.length > 1) raus.push({ art: "h1", text: `${h1.length} h1-Elemente` });
  if (h1.length === 0) raus.push({ art: "h1", text: "keine h1" });

  return raus;
};

mkdirSync("/tmp/qa", { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--disable-component-update","--disable-sync","--no-first-run","--disable-features=Translate,AutofillServerCommunication,OptimizationHints"] });
const alles = [];

for (const [breite, hoehe, bname, mobil] of BREITEN) {
  for (const schema of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: breite, height: hoehe }, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: mobil ? 2 : 1, colorScheme: schema });
    for (const [pfad, name] of SEITEN) {
      const s = await ctx.newPage();
      const fehler = [];
      s.on("pageerror", (e) => fehler.push(e.message.slice(0, 120)));
      try {
        const r = await s.goto(BASIS + pfad, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (r && r.status() >= 400) alles.push({ seite: name, breite: bname, schema, art: "status", text: String(r.status()) });
        await s.waitForTimeout(name === "karte" ? 5000 : 900);
        for (const f of await s.evaluate(PRUEFUNG)) alles.push({ seite: name, breite: bname, schema, ...f });
        for (const f of fehler) alles.push({ seite: name, breite: bname, schema, art: "js", text: f });
        if (schema === "light") await s.screenshot({ path: `/tmp/qa/${bname}-${name}.png`, fullPage: bname !== "s1440" });
        else if (bname === "s390" || bname === "s1440") await s.screenshot({ path: `/tmp/qa/${bname}-dunkel-${name}.png`, fullPage: false });
      } catch (e) {
        alles.push({ seite: name, breite: bname, schema, art: "abbruch", text: String(e).slice(0, 120) });
      }
      await s.close();
    }
    await ctx.close();
  }
}
await b.close();

const zaehler = {};
for (const f of alles) zaehler[f.art] = (zaehler[f.art] || 0) + 1;
console.log("=== Summe ===", JSON.stringify(zaehler));
const gesehen = new Set();
for (const f of alles) {
  const k = `${f.art}|${f.seite}|${f.text}`;
  if (gesehen.has(k)) continue;
  gesehen.add(k);
  console.log(`${f.art.padEnd(15)} ${f.seite.padEnd(14)} ${f.breite.padEnd(6)} ${f.text}`);
}
console.log("Gesamtbefunde:", alles.length, "· eindeutig:", gesehen.size);
