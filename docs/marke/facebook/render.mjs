// Rendert die SVG-Quellen zu PNG und baut eine Vorschau mit den beiden
// Beschnitten von Facebook (Schreibtisch, Telefon). Aufruf: node render.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function png(svg, w, h, out, scale = 1) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${readFileSync(svg, "utf8")}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}
await png("profilbild.svg", 1000, 1000, "profilbild.png");
await png("profilbild-wortmarke.svg", 1000, 1000, "profilbild-wortmarke.png");
await png("titelbild.svg", 1640, 924, "titelbild.png");

// Vorschau: so sieht es auf der Seite aus
const titel = readFileSync("titelbild.png").toString("base64");
const profil = readFileSync("profilbild.png").toString("base64");
const html = `<!doctype html><html><body style="margin:0;background:#f0f2f5;font:14px Inter,system-ui;color:#333;padding:24px">
<h3 style="margin:0 0 8px">Schreibtisch (820×312 sichtbar, Profilbild überlappt unten links)</h3>
<div style="position:relative;width:820px;height:390px">
  <div style="width:820px;height:312px;overflow:hidden;border-radius:8px;position:relative">
    <img src="data:image/png;base64,${titel}" style="width:820px;position:absolute;top:-75px;left:0">
  </div>
  <img src="data:image/png;base64,${profil}" style="position:absolute;left:30px;top:220px;width:168px;height:168px;border-radius:50%;border:4px solid #fff">
</div>
<h3 style="margin:24px 0 8px">Telefon (640×360 sichtbar, Profilbild unten mittig)</h3>
<div style="position:relative;width:640px;height:460px">
  <div style="width:640px;height:360px;overflow:hidden;position:relative">
    <img src="data:image/png;base64,${titel}" style="height:360px;position:absolute;left:-70px;top:0">
  </div>
  <img src="data:image/png;base64,${profil}" style="position:absolute;left:250px;top:280px;width:140px;height:140px;border-radius:50%;border:4px solid #fff">
</div>
</body></html>`;
const p = await b.newPage({ viewport: { width: 900, height: 940 }, deviceScaleFactor: 1 });
await p.setContent(html);
await p.screenshot({ path: "vorschau.png" });
await b.close();
