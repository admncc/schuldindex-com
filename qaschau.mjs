import { chromium } from "playwright";
const S = "/tmp/claude-0/-home-user-schuldindex-com/a60c1028-a867-5cf3-9d84-5f27393681ce/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("FEHLER", String(e).slice(0, 140)));
await p.goto("http://127.0.0.1:3100/moderation/anmelden", { waitUntil: "networkidle" });
await p.fill("#kennung", "qa-schau");
await p.fill("#passwort", "Birke-Garten-Insel-Salbei-5489");
await p.click("button.knopf");
await p.waitForTimeout(1500);
console.log("nach Anmeldung:", p.url());
for (const [name, url] of [["panel-empfehlungen", "/moderation/empfehlungen"], ["panel-verlosung", "/moderation/verlosung"]]) {
  const a = await p.goto("http://127.0.0.1:3100" + url, { waitUntil: "networkidle" });
  console.log(name, a.status());
  await p.screenshot({ path: S + name + ".png", fullPage: true });
}
await b.close();
