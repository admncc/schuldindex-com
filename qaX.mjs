import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots3";
import fs from "node:fs"; fs.mkdirSync(OUT,{recursive:true});
const B="http://localhost:3109", S="grundschule-nuernberg-kopernikusschule";
const SEITEN=[["start","/"],["schulen","/schulen?q=schule"],["karte","/karte"],["ranglisten","/ranglisten"],
 ["schule",`/schule/${S}`],["bewerten",`/bewerten/${S}`],["verlosung","/verlosung"],["lp1","/lp1"],["ueber","/ueber"],
 ["datenschutz","/datenschutz"],["impressum","/impressum"],["nutzungsbedingungen","/nutzungsbedingungen"],
 ["schulsupport","/schulsupport/anfordern"],["anmelden","/konto/anmelden"],["inhalt-melden","/inhalt-melden"]];
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const funde=[];
for(const scheme of ["light","dark"]) for(const w of [390,768,1280]){
 const ctx=await br.newContext({viewport:{width:w,height:900},colorScheme:scheme,locale:"de-DE"});
 for(const [n,pf] of SEITEN){
  const p=await ctx.newPage(); const logs=[];
  p.on("console",m=>{if(m.type()==="error"||m.type()==="warning")logs.push(m.text().slice(0,150));});
  p.on("pageerror",e=>logs.push("pageerror "+String(e).slice(0,150)));
  await p.goto(B+pf,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.querySelectorAll("details").forEach(d=>d.open=true));
  await p.waitForTimeout(150);
  const m=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  if(m.sw>m.cw+1) funde.push(`UEBERLAUF ${n} @${w} ${scheme}: ${m.sw}>${m.cw}`);
  if(logs.length) funde.push(`KONSOLE ${n} @${w} ${scheme}: ${logs.join(" | ")}`);
  if(n==="schule"&&w===390) await p.screenshot({path:`${OUT}/schule-${scheme}-390.png`,fullPage:true});
  await p.close();
 }
 await ctx.close();
}
await br.close();
console.log(funde.length?funde.join("\n"):"keine Ueberlaeufe, keine Konsolenmeldungen");
