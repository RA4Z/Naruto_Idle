import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const presentation = JSON.parse(await readFile("public/assets/presentation.json", "utf8"));
const ids = (process.env.MODEL_IDS || "19000101,19000201,19004301,19002301").split(",");
const models = {};
for (const id of ids) models[id] = JSON.parse(await readFile("public"+presentation.entityAudio[id].url, "utf8"));
const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors = [], missing = [], fights = [], decoded = [];
let maxVoices = 0, fixture, currentPage;
try {
 let page = await browser.newPage({viewport:{width:1280,height:900}});
 const observe = async page => {
  currentPage=page;
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => {if(response.status()>=400 && !response.url().includes("/api/admin/session"))missing.push(response.url());});
  await page.addInitScript(() => {
   window.__actorStarts = [];
   const original = HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play = function(...args) {
    const result = original.apply(this,args), url = this.src;
    result.then(()=>window.__actorStarts.push({url,time:performance.now()})).catch(()=>{});
    return result;
   };
  });
 };
 await observe(page);
 await page.goto(base); await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>window.__idle?.snapshot() && document.getElementById("game-loading").hidden);
 assert.deepEqual(await page.evaluate(()=>window.__idle.snapshot().presentation.entityAudio.actors),[]);
 await page.locator("#sound").check(); await page.waitForFunction(()=>window.__idle.snapshot().audioReady);
 // Decode every recovered/reused clip serially through the browser's real MP3 decoder.
 const urls=[...new Set(Object.values(models).flatMap(m=>Object.values(m.sounds).flatMap(s=>s.clips.map(c=>c.url))))];
 for (const url of process.env.SKIP_DECODE ? [] : urls) {
  const result=await page.evaluate(async url=>{
   const audio=new Audio(); audio.preload="metadata";
   try{
    const metadata=new Promise((resolve,reject)=>{audio.onloadedmetadata=resolve;audio.onerror=()=>reject(new Error("MP3 decode failed "+url));});
    audio.src=url;audio.load();await metadata;await audio.play();
    await new Promise(resolve=>setTimeout(resolve,25));
    return {url,duration:audio.duration,playing:!audio.paused};
   }finally{audio.pause();audio.removeAttribute("src");audio.load();}
  },url);
  assert.ok(result.duration>0 && Number.isFinite(result.duration) && result.playing);decoded.push(result);
 }
 await page.locator("#maps").click();await page.locator('[data-map="10020"]').click();
 await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10020"&&!window.__idle.snapshot().loadingActor);
 for (const id of ids) {
  await page.locator("#library").click();await page.locator("[data-collection]").selectOption("all");await page.getByRole("searchbox",{name:"Buscar personagem"}).fill(id);
  await page.locator('[data-entity="'+id+'"]').getByRole("button",{name:"Enfrentar",exact:true}).click();
  await page.waitForFunction(id=>window.__idle.snapshot().presentation.entityAudio.ready.includes(id)&&!window.__idle.snapshot().loadingActor,id);
  const before=await page.evaluate(()=>({snapshot:window.__idle.snapshot(),at:window.__actorStarts.length}));
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(id=>{
   const s=window.__idle.snapshot(),a=s.presentation.entityAudio;
   return a.lastPlayed?.id===id && a.lastPlayed.action==="A_1hit" && a.lastPlayed.owner==="enemy";
  },id,{timeout:45000});
  const attacked=await page.evaluate(()=>window.__idle.snapshot());
  maxVoices=Math.max(maxVoices,attacked.presentation.shortVoices);
  await page.waitForFunction(k=>window.__idle.snapshot().kills>k,before.snapshot.kills,{timeout:45000});
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(id=>{
   const a=window.__idle.snapshot().presentation.entityAudio;
   return a.lastPlayed?.id===id&&a.lastPlayed.action==="C_dead";
  },id,{timeout:10000});
  await page.waitForTimeout(150);
  const after=await page.evaluate(()=>({snapshot:window.__idle.snapshot(),starts:window.__actorStarts}));
  maxVoices=Math.max(maxVoices,after.snapshot.presentation.shortVoices);
  const death=models[id].actions.C_dead[0].sound;
  const nativeAttackIds=new Set(models[id].actions.A_1hit.map(e=>e.sound));
  const starts=after.starts.slice(before.at).map(row=>new URL(row.url).pathname);
  assert.ok(starts.some(url=>Object.values(models[id].sounds).flatMap(s=>s.clips).some(c=>c.url===url)),"native actor MP3 actually played");
  assert.ok(starts.some(url=>url.startsWith("/assets/audio/sfx/"+death+"/")),"native death voice actually played");
  assert.equal(after.snapshot.presentation.entityAudio.failures,0);
  assert.equal(after.snapshot.heroSpriteInstances,1);
  await page.waitForFunction(()=>window.__idle.snapshot().phase==="explorando",null,{timeout:30000});
  fights.push({id,attackObserved:attacked.presentation.entityAudio.lastPlayed,deathSound:death,attackPackages:[...nativeAttackIds],actualNativePlayback:true,singleHero:true});
 }
 await page.locator("#return-lobby").click();
 await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10001"&&!window.__idle.snapshot().loadingActor);
 const clear=await page.evaluate(()=>window.__idle.snapshot().presentation.entityAudio);
 assert.equal(clear.voices,0);assert.equal(clear.pending,0);assert.deepEqual(clear.ready,[]);
 // Prepare an owned generic model using real domain selection, in an isolated test save.
 fixture=await page.evaluate(async()=>{
  const {fresh}=await import("/src/model.ts");
  const {selectCharacter}=await import("/src/progression/character-progress.ts");
  const save=fresh("naruto");save.collection.push("19000101");selectCharacter(save,"19000101");
  save.location="10020";save.visitedMaps.push("10020");save.sound=true;save.soundVolume=.4;
  return save;
 });
 await page.close();
 page=await browser.newPage({viewport:{width:1280,height:900}});await observe(page);
 await page.addInitScript(save=>localStorage.setItem("folha-idle-v1",JSON.stringify(save)),fixture);
 await page.goto(base);await page.locator("#continue").click();
 await page.waitForFunction(()=>window.__idle?.snapshot().presentation.entityAudio.ready.includes("19000101"));
 await page.locator("#auto-hunt").click();
 await page.waitForFunction(()=>{
  const a=window.__idle.snapshot().presentation.entityAudio;
  return a.lastPlayed?.id==="19000101"&&a.lastPlayed.owner==="hero"&&a.lastPlayed.action==="A_1hit";
 },null,{timeout:45000});
 const generic=await page.evaluate(()=>({snapshot:window.__idle.snapshot(),starts:window.__actorStarts}));
 assert.equal(generic.snapshot.heroSpriteInstances,1);assert.equal(generic.snapshot.presentation.entityAudio.failures,0);
 await page.locator("#sound").uncheck();
 const mute=await page.evaluate(()=>window.__idle.snapshot().presentation.entityAudio);
 assert.equal(mute.voices,0);assert.equal(mute.pending,0);assert.deepEqual(mute.ready,[]);
 await page.close();
 // Admin reuses this browser, after the game page is closed.
 page=await browser.newPage();page.on("pageerror",error=>errors.push(String(error)));
 await page.goto(base+"/admin");await page.locator('input[name="password"]').fill("admin");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 await page.locator('[data-section="sounds"]').click();
 await page.waitForSelector("[data-entity-audio]");
 assert.equal(await page.locator("[data-entity-audio]").count(),4);
 const card=page.locator('[data-entity-audio="19000101"]');
 assert.equal(await card.locator("audio").count(),0);
 await card.getByRole("button",{name:"Carregar sons deste modelo"}).click();
 await card.locator("audio").first().waitFor();
 assert.ok(await card.locator("audio").count()>0);
 await page.close();assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.ok(maxVoices<=4);
 const report={checkedAt:new Date().toISOString(),decodedFiles:decoded.length,decoded,fights,sharedVoiceLimit:maxVoices,travelReleases:true,muteReleases:true,genericHeroNativeAudio:true,adminLazyPreviews:true,errors,missing,policy:"one browser, one page at a time, serial clips and fights"};
 await writeFile("reports/entity-audio-browser-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({...report,decoded:undefined}));
}catch(error){const state=await currentPage?.evaluate(()=>({snapshot:window.__idle?.snapshot(),starts:window.__actorStarts?.slice(-12)})).catch(()=>null);console.error(JSON.stringify({fights,decoded:decoded.length,errors,missing,state,failure:String(error)}));throw error;}
finally{await browser.close();}
