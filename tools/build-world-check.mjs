// Execute the emitted production bundle without starting another HTTP server.
// Browser routes serve dist bytes; API/backend deployment is outside this check.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,sep,extname} from "node:path";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const root=resolve("dist"),ids=(process.env.MAP_IDS||"30008,300131").split(",");
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],missing=[],results=[];
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".json":"application/json",".xml":"application/xml",".mp3":"audio/mpeg"};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 if(process.env.CHECK_UI==="1") await page.addInitScript(()=>{
  window.__productionAudioStarts=[];
  const original=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){
   if(this.buffer?.duration>0.05)window.__productionAudioStarts.push(this.buffer.duration);
   return original.apply(this,args);
  };
 });
 page.on("pageerror",error=>errors.push(String(error)));
 await page.route(base+"/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith("/api/"))return route.abort();
  const path=resolve(root,decodeURIComponent(url.pathname).slice(1)||"index.html");
  if(!path.startsWith(root+sep))return route.abort();
  try{const body=await readFile(path);await route.fulfill({status:200,contentType:mime[extname(path)]||"application/octet-stream",body});}
  catch(error){missing.push(url.pathname);await route.fulfill({status:404,body:"Not in production build"});}
 });
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!!document.querySelector("#canvas canvas"));
 assert.equal(await page.evaluate(()=>typeof window.__idle),"undefined","production diagnostics must stay disabled");
 let uiFeedback;
 if(process.env.CHECK_UI==="1"){
  const allMaps=JSON.parse(await readFile("dist/assets/maps/index.json","utf8")).maps;
  for(const map of allMaps.filter(map=>map.id!=="10001")){
   await page.locator("#maps").click();await page.locator('[data-map="'+map.id+'"]').click();
   await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,map.id);
  }
  await page.reload();await page.locator("#continue").click();
  await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!!document.querySelector("#canvas canvas"));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")).visitedMaps.length),allMaps.length);
  await page.locator("#sound").check();
  // Playback readiness is verified through actual WebAudio starts, without enabling dev hooks.
  await page.waitForTimeout(1300);
  await page.locator("#progression").click();
  await page.waitForFunction(()=>window.__productionAudioStarts.length>=1);
  await page.waitForTimeout(100);
  await page.locator(".progression-panel [data-close]").click();
  await page.waitForFunction(()=>window.__productionAudioStarts.length>=2);
  const clickAndCloseStarts=await page.evaluate(()=>window.__productionAudioStarts.length);
  await page.locator("#sound").uncheck();
  await page.locator("#progression").click();await page.locator(".progression-panel [data-close]").click();
  assert.equal(await page.evaluate(()=>window.__productionAudioStarts.length),clickAndCloseStarts);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location==="10001");
  uiFeedback={compiledClickAndClosePlayAudio:true,mutePreventsNewAudio:true,allVisitedMapsReload:allMaps.length,devHooksAbsent:true};
 }
 for(const id of ids){
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
  await page.locator("#maps").click();await page.locator('[data-map="'+id+'"]').click();
  await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,id);
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(k=>JSON.parse(localStorage.getItem("folha-idle-v1")).kills>k,before.kills,{timeout:45000});
  await page.locator("#auto-hunt").click();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
  assert.ok(after.coins>before.coins);assert.ok(after.level>before.level||after.xp>before.xp);
  await page.screenshot({path:"reports/build-world-"+id+".png"});
  await page.reload();await page.locator("#continue").click();
  await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,id);
  assert.equal(await page.locator("#canvas canvas").count(),1);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location==="10001");
  results.push({id,productionTravel:true,victoryAndPersistedLoot:true,reload:true,lobbyReturn:true,singleCanvas:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={checkedAt:new Date().toISOString(),mode:"compiled dist bundle via local browser interception; no extra server",backendServerTestedThisBatch:false,uiFeedback,results,errors,missing};
 await writeFile("reports/"+(process.env.REPORT_FILE||"forest-bridge-build-browser-validation.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await browser.close();}
