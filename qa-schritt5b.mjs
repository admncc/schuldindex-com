import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport:{width:390,height:900} });
const p = await ctx.newPage();
await p.goto("http://localhost:3105/bewerten/schule-cranz", { waitUntil:"networkidle" });
for (let s=1;s<=4;s++){
  await p.evaluate(()=>{const n=new Set([...document.querySelectorAll("input[type=radio]")].map(i=>i.name));for(const x of n){const g=document.querySelectorAll(`input[name="${CSS.escape(x)}"]`);if(![...g].some(i=>i.checked))g[Math.min(3,g.length-1)].click();}});
  const w=await p.$("button:has-text('Weiter')"); if(!w)break; await w.click(); await p.waitForTimeout(300);
}
const r = await p.evaluate(()=>{
  const out=[];
  for (const e of document.querySelectorAll("button, .knopf, fieldset, .wahl")) {
    const rc=e.getBoundingClientRect(); const s=getComputedStyle(e);
    if (rc.width > 380) out.push({tag:e.tagName.toLowerCase(), cls:(typeof e.className==="string"?e.className:""), w:Math.round(rc.width), right:Math.round(rc.right), nowrap:s.whiteSpace, txt:e.textContent.replace(/\s+/g," ").trim().slice(0,60)});
  }
  return {sw:document.documentElement.scrollWidth, vw:window.innerWidth, out};
});
console.log("scrollWidth", r.sw, "viewport", r.vw);
for (const x of r.out) console.log(`  ${x.w}px (bis ${x.right}) white-space=${x.nowrap} <${x.tag} class="${x.cls}"> "${x.txt}"`);
await ctx.close(); await b.close();
