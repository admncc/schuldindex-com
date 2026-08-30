import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const scheme of ["light","dark"]) for (const w of [320,390,412,768,1280]) {
  const ctx = await b.newContext({ viewport:{width:w,height:900}, colorScheme:scheme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3105/bewerten/grundschule-nuernberg-kopernikusschule", { waitUntil:"networkidle" });
  for (let s=1;s<=4;s++) {
    await p.evaluate(()=>{
      const namen = new Set([...document.querySelectorAll("input[type=radio]")].map(i=>i.name));
      for (const n of namen) { const g=document.querySelectorAll(`input[name="${CSS.escape(n)}"]`); if(![...g].some(i=>i.checked)) g[Math.min(3,g.length-1)].click(); }
    });
    const wt = await p.$("button:has-text('Weiter')");
    if (!wt) break;
    await wt.click(); await p.waitForTimeout(350);
  }
  const r = await p.evaluate(()=>{
    const de=document.documentElement, vw=window.innerWidth, raus=[];
    for (const e of document.querySelectorAll("body *")) {
      const r=e.getBoundingClientRect();
      if (r.width===0&&r.height===0) continue;
      if (r.right>vw+1||r.left<-1) {
        let pnt=e.parentElement, gewollt=false;
        while(pnt){const s=getComputedStyle(pnt); if((s.overflowX==="auto"||s.overflowX==="scroll")&&pnt.scrollWidth>pnt.clientWidth+1){gewollt=true;break;} pnt=pnt.parentElement;}
        if(gewollt) continue;
        raus.push({tag:e.tagName.toLowerCase(), cls:(typeof e.className==="string"?e.className:"").slice(0,45), l:Math.round(r.left), rr:Math.round(r.right), w:Math.round(r.width), txt:(e.textContent||"").replace(/\s+/g," ").trim().slice(0,50)});
      }
    }
    const ueber = document.querySelector("fieldset legend")?.textContent?.trim().slice(0,50);
    return {sw:de.scrollWidth, cw:de.clientWidth, raus:raus.slice(0,8), ueber};
  });
  const bad = r.sw > r.cw+1;
  console.log(`${scheme} @${w}: legende="${r.ueber}" scrollW=${r.sw} clientW=${r.cw} ${bad?"!! SEITLICH":"ok"}`);
  for (const x of r.raus) console.log(`    <${x.tag} class="${x.cls}"> left=${x.l} right=${x.rr} w=${x.w} "${x.txt}"`);
  if (bad) await p.screenshot({path:`${OUT}/bewerten-schritt5-${scheme}-${w}.png`, fullPage:true});
  await ctx.close();
}
await b.close();
