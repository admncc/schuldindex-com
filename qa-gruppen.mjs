import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
for (const pf of ["/konto/anmelden","/bewerten/grundschule-nuernberg-kopernikusschule","/inhalt-melden","/schulsupport/anfordern","/schulen","/karte"]) {
  const p = await ctx.newPage();
  await p.goto("http://localhost:3105"+pf, { waitUntil:"networkidle" });
  const r = await p.evaluate(() => {
    const gruppen = {};
    for (const i of document.querySelectorAll("input[type=radio], input[type=checkbox]")) {
      const n = i.name || "(ohne name)";
      gruppen[n] = gruppen[n] || { anzahl: 0, typ: i.type, fieldset: null, legende: null, rolle: null, beschriftet: null };
      gruppen[n].anzahl++;
      const fs = i.closest("fieldset");
      gruppen[n].fieldset = !!fs;
      gruppen[n].legende = fs ? (fs.querySelector("legend")?.textContent.trim().slice(0,40) ?? "OHNE LEGENDE") : null;
      const rg = i.closest("[role=radiogroup],[role=group]");
      gruppen[n].rolle = rg ? (rg.getAttribute("aria-label") || rg.getAttribute("aria-labelledby") || "role ohne Name") : null;
    }
    return gruppen;
  });
  console.log(`\n### ${pf}`);
  for (const [n,g] of Object.entries(r)) {
    const ok = g.anzahl === 1 || g.fieldset || g.rolle;
    console.log(`  ${ok?"ok ":"!! "}${g.typ} name="${n}" x${g.anzahl} fieldset=${g.fieldset} legende=${g.legende} rolle=${g.rolle}`);
  }
  await p.close();
}
await ctx.close(); await b.close();
