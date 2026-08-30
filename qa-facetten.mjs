import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport:{width:900,height:900} });
const p = await ctx.newPage();
await p.goto("http://localhost:3105/schulen?q=schule", { waitUntil:"networkidle" });
const t = await p.$$eval(".facette", f=>f.map(x=>x.innerText.replace(/\n/g," | ").slice(0,160)));
console.log("Facetten:", JSON.stringify(t, null, 1));
const box = await p.evaluate(()=>{
  const f=[...document.querySelectorAll(".facette")]; if(!f.length) return null;
  const a=f[0].getBoundingClientRect(), z=f[f.length-1].getBoundingClientRect();
  return { x:Math.round(a.left)-10, y:Math.round(a.top)-10, width:Math.round(Math.max(a.width,z.width))+20, height:Math.round(z.bottom-a.top)+20 };
});
if (box) await p.screenshot({ path:`${OUT}/facetten.png`, clip: box });
// Trendanzeige auf /ranglisten
const p2 = await ctx.newPage();
await p2.goto("http://localhost:3105/ranglisten", { waitUntil:"networkidle" });
const tr = await p2.evaluate(()=>[...document.querySelectorAll("[class*=trend]")].map(e=>({cls:e.className, txt:e.textContent.trim().slice(0,30), aria:e.getAttribute("aria-label"), title:e.getAttribute("title")})));
console.log("\nTrendelemente:", JSON.stringify(tr.slice(0,10), null, 1));
await ctx.close(); await b.close();
