import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [scheme,w] of [["light",390],["dark",390],["light",768],["dark",1280]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:900}, colorScheme:scheme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3105/schule/grundschule-nuernberg-kopernikusschule", { waitUntil:"networkidle" });
  await p.click("details.fragedetails summary");
  await p.waitForTimeout(300);
  const r = await p.evaluate(()=>{
    const d = document.querySelector("details.fragedetails[open]");
    const zeilen = [...d.querySelectorAll(".fragewertung")].map(z=>{
      const t=z.querySelector(".titel"), bal=z.querySelector(".kategoriebalken"), zahl=z.querySelector(".zahl"), an=z.querySelector(".anzahl");
      const rc=(e)=>e?{l:Math.round(e.getBoundingClientRect().left),r:Math.round(e.getBoundingClientRect().right),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)}:null;
      const beschnitten = t ? (t.scrollWidth > t.clientWidth+1 || t.scrollHeight > t.clientHeight+1) : false;
      return { text:t?.textContent.slice(0,45), titel:rc(t), balken:rc(bal), zahl:rc(zahl), anzahl:rc(an), beschnitten, zahlTxt: zahl?.textContent, anTxt: an?.textContent };
    });
    return { vw: window.innerWidth, zeilen: zeilen.slice(0,4), n: zeilen.length,
             ueberlappung: zeilen.filter(z=>z.titel&&z.zahl&&z.titel.r>z.zahl.l&&Math.abs(z.titel.l-z.zahl.l)>2).length };
  });
  console.log(`\n=== ${scheme} @${w} (${r.n} Zeilen) ===`);
  for (const z of r.zeilen) console.log(`  "${z.text}" titel=${JSON.stringify(z.titel)} beschnitten=${z.beschnitten} zahl=${z.zahlTxt}@${z.zahl?.l} anzahl="${z.anTxt}"@${z.anzahl?.l}`);
  await p.locator("details.fragedetails[open]").screenshot({ path:`${OUT}/fragen-${scheme}-${w}.png` });
  await ctx.close();
}
await b.close();
