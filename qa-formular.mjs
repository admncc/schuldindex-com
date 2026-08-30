import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [scheme, w] of [["dark",390],["light",1280]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:900}, colorScheme:scheme });
  const p = await ctx.newPage();
  const fehler=[];
  p.on("console", m=>{ if(m.type()==="error"||m.type()==="warning") fehler.push(m.text().slice(0,200)); });
  p.on("pageerror", e=>fehler.push("PAGEERROR "+String(e).slice(0,200)));
  await p.goto("http://localhost:3105/bewerten/grundschule-nuernberg-kopernikusschule", { waitUntil:"networkidle" });
  for (let schritt=1; schritt<=6; schritt++) {
    const kopf = await p.evaluate(()=>document.querySelector(".hinweis, .fortschritt")?.textContent?.trim().slice(0,80) ?? "");
    await p.screenshot({ path:`${OUT}/bewerten-s${schritt}-${w}-${scheme}.png`, fullPage:true });
    const mess = await p.evaluate(()=>({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(`${scheme}@${w} Schritt ${schritt}: "${kopf}" scrollW=${mess.sw} clientW=${mess.cw}${mess.sw>mess.cw+1?"  !! SEITLICHES SCROLLEN":""}`);
    // Alles beantworten: erste Option in jeder Gruppe
    await p.evaluate(()=>{
      const namen = new Set([...document.querySelectorAll("input[type=radio]")].map(i=>i.name));
      for (const n of namen) {
        const g = document.querySelectorAll(`input[name="${CSS.escape(n)}"]`);
        if (![...g].some(i=>i.checked)) g[Math.min(3,g.length-1)].click();
      }
    });
    const weiter = await p.$("button:has-text('Weiter'), button:has-text('Absenden'), button:has-text('Abschicken')");
    if (!weiter) { console.log("   -> kein Weiter-Knopf mehr"); break; }
    const txt = await weiter.evaluate(e=>e.textContent.trim());
    if (/absenden|abschicken/i.test(txt)) { console.log("   letzter Schritt:", txt); break; }
    await weiter.click();
    await p.waitForTimeout(500);
  }
  // Verlosungs-Checkbox-Text auf dem letzten Schritt
  const verl = await p.evaluate(()=>[...document.querySelectorAll("label")].map(l=>l.textContent.replace(/\s+/g," ").trim()).filter(t=>/verlosung/i.test(t)));
  console.log("  Verlosungstext:", JSON.stringify(verl));
  console.log("  Konsole:", fehler.length? fehler.join(" | ") : "sauber");
  await ctx.close();
}
await b.close();
