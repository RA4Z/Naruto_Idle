// Run with node --import tsx. Serve emitted bytes through one browser page;
// this exercises the real production bundle, without starting another server.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fresh } from "../src/model.ts";
import { selectCharacter } from "../src/progression/character-progress.ts";
const base=process.env.BASE_URL||"http://127.0.0.1:5178", root=resolve("dist");
const fixture=fresh("naruto");fixture.collection.push("19000101");selectCharacter(fixture,"19000101");
fixture.location="10020";fixture.visitedMaps.push("10020");fixture.enemyId="19000201";fixture.sound=true;fixture.soundVolume=.4;
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],missing=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.addInitScript(save=>{
  if(!localStorage.getItem("folha-idle-v1"))localStorage.setItem("folha-idle-v1",JSON.stringify(save));
  window.__nativeMediaStarts=[];
  const original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
   const promise=original.apply(this,args),url=this.src;
   promise.then(()=>window.__nativeMediaStarts.push(url)).catch(()=>{});
   return promise;
  };
 },fixture);
 page.on("pageerror",error=>errors.push(String(error)));
 const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".json":"application/json",".xml":"application/xml",".mp3":"audio/mpeg"};
 await page.route(base+"/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith("/api/"))return route.abort();
  const path=resolve(root,decodeURIComponent(url.pathname).slice(1)||"index.html");
  if(!path.startsWith(root+sep))return route.abort();
  try{await route.fulfill({status:200,contentType:mime[extname(path)]||"application/octet-stream",body:await readFile(path)});}
  catch{missing.push(url.pathname);await route.fulfill({status:404,body:"Missing production file"});}
 });
 await page.goto(base);await page.locator("#continue").click();
 await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!!document.querySelector("#canvas canvas"));
 assert.equal(await page.evaluate(()=>typeof window.__idle),"undefined");
 await page.locator("#auto-hunt").click();
 await page.waitForFunction(()=>window.__nativeMediaStarts.some(url=>/\/sfx\/(92|88)\//.test(url)),null,{timeout:45000});
 await page.waitForFunction(()=>window.__nativeMediaStarts.some(url=>/\/sfx\/(589|93)\//.test(url)),null,{timeout:45000});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem("folha-idle-v1")).kills>0,null,{timeout:45000});
 await page.locator("#auto-hunt").click();await page.locator("#sound").uncheck();await page.waitForTimeout(500);
 const starts=await page.evaluate(()=>window.__nativeMediaStarts.map(url=>new URL(url).pathname));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
 assert.equal(saved.activeEntityId,"19000101");assert.ok(saved.kills>0);
 await page.reload();await page.locator("#continue").click();
 await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!!document.querySelector("#canvas canvas"));
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
 assert.equal(restored.activeEntityId,saved.activeEntityId);assert.equal(restored.kills,saved.kills);assert.equal(restored.sound,false);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={checkedAt:new Date().toISOString(),productionBundle:true,debugHooksAbsent:true,nativeHeroAndEnemyPlayback:true,actualMediaStarts:starts,realVictory:true,kills:saved.kills,reloadPreservesProgressAndMute:true,errors,missing,policy:"one browser/page; intercepted dist; no extra server; backend not retested"};
 await writeFile("reports/entity-audio-production-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await browser.close();}
