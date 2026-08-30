import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/shots2";
import fs from "node:fs"; fs.mkdirSync(OUT,{recursive:true});
const BASE="http://localhost:3107";
const S="grundschule-nuernberg-kopernikusschule";
const SEITEN=[["start","/"],["schulen","/schulen"],["schulen-filter","/schulen?q=schule&bundesland=BY&schulart=grundschule"],
 ["karte","/karte"],["ranglisten","/ranglisten"],["schule",`/schule/${S}`],["bewerten",`/bewerten/${S}`],
 ["verlosung","/verlosung"],["lp1","/lp1"],["ueber","/ueber"],["datenschutz","/datenschutz"],["impressum","/impressum"],
 ["nutzungsbedingungen","/nutzungsbedingungen"],["schulsupport","/schulsupport/anfordern"],["anmelden","/konto/anmelden"],["inhalt-melden","/inhalt-melden"]];

const messe=()=>{const de=document.documentElement,vw=window.innerWidth,raus=[];
 for(const e of document.querySelectorAll("body *")){const r=e.getBoundingClientRect();
  if(r.width===0&&r.height===0)continue;
  if(r.right>vw+1||r.left<-1){let p=e.parentElement,ok=false;
   while(p){const s=getComputedStyle(p);if((s.overflowX==="auto"||s.overflowX==="scroll")&&p.scrollWidth>p.clientWidth+1){ok=true;break;}p=p.parentElement;}
   if(ok)continue;
   raus.push(`<${e.tagName.toLowerCase()} class="${(typeof e.className==="string"?e.className:"").slice(0,40)}"> w=${Math.round(r.width)} bis ${Math.round(r.right)} "${(e.textContent||"").replace(/\s+/g," ").trim().slice(0,45)}"`);}}
 return {sw:de.scrollWidth,cw:de.clientWidth,raus:raus.slice(0,5)};};

const kontrast=()=>{const p=(c)=>{if(!c||c==="transparent")return[0,0,0,0];const m=c.match(/-?[\d.]+(e-?\d+)?/g);if(!m)return null;let v=m.map(Number);if(/^color\(/.test(c))v=[v[0]*255,v[1]*255,v[2]*255,v.length>3?v[3]:1];return v;};
 const lum=([r,g,b])=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
 const rat=(a,b)=>{const L1=lum(a),L2=lum(b);return(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);};
 const mix=(f,b,a)=>f.map((v,i)=>v*a+b[i]*(1-a));
 const bgOf=(e)=>{let n=e,st=[];while(n){const s=getComputedStyle(n),c=p(s.backgroundColor),a=c&&c.length===4?c[3]:1;
  if(c&&a>0)st.push([[c[0],c[1],c[2]],a]);if(c&&a>=0.99)break;n=n.parentElement;}
  let o=[255,255,255];for(let i=st.length-1;i>=0;i--)o=mix(st[i][0],o,st[i][1]);return o;};
 const res=[],seen=new Set();
 for(const e of document.querySelectorAll("body *")){
  const d=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(" ");
  if(!d)continue;const r=e.getBoundingClientRect();if(r.width===0||r.height===0)continue;
  const s=getComputedStyle(e);if(s.visibility==="hidden"||s.opacity==="0")continue;
  if(s.webkitTextFillColor&&s.webkitTextFillColor.includes("rgba(0, 0, 0, 0)"))continue;
  const fr=p(s.color);if(!fr)continue;const bg=bgOf(e);let fg=[fr[0],fr[1],fr[2]];const fa=fr.length===4?fr[3]:1;
  if(fa<1)fg=mix(fg,bg,fa);
  const px=parseFloat(s.fontSize),fw=parseInt(s.fontWeight)||400,gr=px>=24||(px>=18.66&&fw>=700),need=gr?3:4.5;
  const k=rat(fg,bg);
  if(k<need-0.02){const key=e.className+s.color+d.slice(0,15);if(seen.has(key))continue;seen.add(key);
   res.push(`${Math.round(k*100)/100}:1 (noetig ${need}) ${px}px/${fw} ${s.color} auf rgb(${bg.map(Math.round).join(",")}) <${e.tagName.toLowerCase()} class="${(typeof e.className==="string"?e.className:"").slice(0,35)}"> "${d.slice(0,45)}"`);}}
 return res;};

const a11y=()=>{const sicht=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !(r.width===0&&r.height===0)&&s.visibility!=="hidden";};
 const txt=(e)=>(e.textContent||"").replace(/\s+/g," ").trim();
 const nm=(e)=>{if(e.getAttribute("aria-label"))return e.getAttribute("aria-label");
  const lb=e.getAttribute("aria-labelledby");if(lb){const t=lb.split(/\s+/).map(i=>document.getElementById(i)).filter(Boolean).map(txt).join(" ");if(t)return t;}
  if(e.id){const l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`);if(l&&txt(l))return txt(l);}
  if(e.closest("label")&&txt(e.closest("label")))return txt(e.closest("label"));
  if(e.getAttribute("title"))return e.getAttribute("title");
  if(e.tagName==="INPUT"&&["submit","button","reset"].includes(e.type))return e.value;
  const t=txt(e);if(t)return t;const i=e.querySelector("img[alt]");return i&&i.alt?i.alt:"";};
 const o={felder:[],knoepfe:[],sprung:[],h1:0,gruppen:[],doppelt:[]};
 for(const e of document.querySelectorAll("input,select,textarea")){if(e.type==="hidden"||!sicht(e))continue;if(!nm(e).trim())o.felder.push(e.outerHTML.slice(0,80));}
 for(const e of document.querySelectorAll("button,a,[role=button]")){if(!sicht(e))continue;if(!nm(e).trim())o.knoepfe.push(e.outerHTML.slice(0,80));}
 const hs=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(sicht);let v=0;
 for(const h of hs){const l=+h.tagName[1];if(l===1)o.h1++;if(v&&l>v+1)o.sprung.push(`h${v} -> ${h.tagName} "${txt(h).slice(0,40)}"`);v=l;}
 const g={};for(const i of document.querySelectorAll("input[type=radio],input[type=checkbox]")){const n=i.name||"?";g[n]=g[n]||{n:0,fs:false};g[n].n++;g[n].fs=!!i.closest("fieldset")||!!i.closest("[role=radiogroup],[role=group]");}
 for(const [k,x] of Object.entries(g))if(x.n>1&&!x.fs)o.gruppen.push(`${k} x${x.n} ohne fieldset/legend`);
 const ids={};for(const e of document.querySelectorAll("[id]"))ids[e.id]=(ids[e.id]||0)+1;
 o.doppelt=Object.entries(ids).filter(([,n])=>n>1).map(([i,n])=>`${i} x${n}`);
 return o;};

const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const konsole=[], overflow=[], kontraste=[], a11yF=[];
for(const scheme of ["light","dark"]) for(const w of [390,768,1280]){
 const ctx=await br.newContext({viewport:{width:w,height:900},colorScheme:scheme,locale:"de-DE"});
 for(const [n,pf] of SEITEN){
  const p=await ctx.newPage(); const logs=[];
  p.on("console",m=>{if(m.type()==="error"||m.type()==="warning")logs.push(`[${m.type()}] ${m.text().slice(0,180)}`);});
  p.on("pageerror",e=>logs.push(`[pageerror] ${String(e).slice(0,180)}`));
  await p.goto(BASE+pf,{waitUntil:"networkidle"});
  await p.evaluate(()=>document.querySelectorAll("details").forEach(d=>d.open=true));
  await p.waitForTimeout(150);
  const m=await p.evaluate(messe);
  if(m.sw>m.cw+1||m.raus.length) overflow.push(`${n} @${w} ${scheme}: scrollW=${m.sw} clientW=${m.cw}\n     ${m.raus.join("\n     ")}`);
  const k=await p.evaluate(kontrast); for(const x of k) kontraste.push(`${n} @${w} ${scheme}: ${x}`);
  if(w===1280&&scheme==="light"){const a=await p.evaluate(a11y);
   const pr=[];if(a.felder.length)pr.push("Feld ohne Label: "+a.felder.join(" ; "));
   if(a.knoepfe.length)pr.push("ohne Namen: "+a.knoepfe.join(" ; "));
   if(a.sprung.length)pr.push("Ueberschriftensprung: "+a.sprung.join(" ; "));
   if(a.h1!==1)pr.push("h1-Anzahl "+a.h1);
   if(a.gruppen.length)pr.push("Gruppe ohne fieldset: "+a.gruppen.join(" ; "));
   if(a.doppelt.length)pr.push("doppelte ids: "+a.doppelt.join(", "));
   if(pr.length)a11yF.push(`${n}: ${pr.join(" | ")}`);}
  if(logs.length)konsole.push(`${n} @${w} ${scheme}: ${logs.join(" | ")}`);
  await p.screenshot({path:`${OUT}/${n}__${w}__${scheme}.png`,fullPage:true});
  await p.close();
 }
 await ctx.close();
}
await br.close();
const zeig=(t,a)=>{console.log(`\n===== ${t} (${a.length}) =====`); a.forEach(x=>console.log("  "+x));};
zeig("SEITLICHES SCROLLEN / UEBERLAUF",overflow);
zeig("KONTRAST",[...new Set(kontraste)]);
zeig("ZUGAENGLICHKEIT",a11yF);
zeig("KONSOLE",konsole);
