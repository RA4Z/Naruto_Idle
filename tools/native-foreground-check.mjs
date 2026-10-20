import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const fixture=JSON.parse(await readFile("reports/native-foreground-pixel-validation.json","utf8"));
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],missing=[],results=[];
const forceCanvas=process.env.FORCE_CANVAS==="1";
try {
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
 if(forceCanvas) await page.addInitScript(()=>{
  const context=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:context.call(this,type,...args);};
 });
 page.on("pageerror",e=>errors.push(String(e)));
 page.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>window.__idle?.snapshot()&&document.getElementById("game-loading").hidden);
 for(const map of fixture.maps){
  if((await page.evaluate(()=>window.__idle.snapshot())).mapId!==map.id){
   await page.locator("#maps").click();await page.locator(`[data-map="${map.id}"]`).click();
   await page.waitForFunction(id=>window.__idle.snapshot().mapId===id&&!window.__idle.snapshot().loadingActor,map.id);
  }
  const before=await page.evaluate(()=>window.__idle.snapshot());assert.equal(before.nativeForeground.masked,!forceCanvas);assert.equal(before.party.length,0);assert.equal(before.occlusion.length,0);
  const samples=[];
  for(const p of map.probes){
   const sample=await page.evaluate(p=>window.__idle.probeNativeForeground(p),p);
   assert.equal(sample.native[3],p.rgba[3]);
   // Browser canvas readback unpremultiplies translucent RGB with byte rounding.
   // RGB comes from the existing optimized background in WebGL; alpha stays exact.
   const alpha=p.rgba[3]/255;
   const expected=sample.native.slice(0,3).map((c,i)=>Math.round(c*alpha+[255,0,255][i]*(1-alpha)));
   assert.ok(sample.rendered.slice(0,3).every((c,i)=>Math.abs(c-expected[i])<=5),JSON.stringify({map:map.id,p,sample,expected}));
   samples.push({source:p,rendered:sample.rendered,expected});
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`reports/native-layer-game-${map.id}.png`});
  const after=await page.evaluate(()=>window.__idle.snapshot());assert.ok(after.walkable&&after.enemies.every(e=>e.walkable));
  results.push({map:map.id,renderedAlphaLevels:samples,opaqueCutoutsDisabled:true,singleHero:after.heroSpriteInstances===1,partyEmpty:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={checkedAt:new Date().toISOString(),renderer:forceCanvas?"canvas":"webgl-native-mask",results,errors,missing,policy:"one browser, one Phaser scene, serial maps and real renderer pixel probes"};
 await writeFile(forceCanvas?"reports/native-foreground-canvas-validation.json":"reports/native-foreground-browser-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await browser.close();}
