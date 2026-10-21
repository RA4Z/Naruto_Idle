import{chromium}from"@playwright/test";import assert from"node:assert/strict";import{readFile,writeFile}from"node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const maps=JSON.parse(await readFile("public/assets/maps/index.json","utf8")).maps;
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],requests=[],decoded=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(/\.mp3$/.test(r.url()))requests.push(r.url());});
 await page.addInitScript(()=>{window.__voices=[];setInterval(()=>{const s=window.__idle?.snapshot();if(s)window.__voices.push(s.presentation.shortVoices);},250);});
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>window.__idle&&document.getElementById("game-loading").hidden);
 // Regression: a legitimate journey with five or more visited maps must reload.
 for(const map of maps.filter(m=>m.id!=="10001")){
  await page.locator("#maps").click();await page.locator('[data-map="'+map.id+'"]').click();
  await page.waitForFunction(id=>window.__idle.snapshot().mapId===id&&document.getElementById("game-loading").hidden,map.id);
 }
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));assert.equal(saved.visitedMaps.length,maps.length);
 await page.reload();await page.locator("#continue").click();
 await page.waitForFunction(()=>window.__idle&&document.getElementById("game-loading").hidden);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")).visitedMaps.length),maps.length);
 assert.equal(requests.length,0,"silent preference must not download UI cues");
 await page.locator("#return-lobby").click();await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10001"&&!window.__idle.snapshot().loadingActor);
 await page.locator("#sound").check();await page.waitForFunction(()=>window.__idle.snapshot().audioReady);
 const index=JSON.parse(await readFile("public/assets/audio/ui/index.json","utf8"));
 for(const [event,cue] of Object.entries(index.events)){
  for(const clip of cue.clips){
   const duration=await page.evaluate(url=>new Promise((resolve,reject)=>{
    const a=new Audio();a.preload="metadata";const timer=setTimeout(()=>reject(new Error("decode timeout")),10000);
    a.onloadedmetadata=async()=>{try{await a.play();const d=a.duration;a.pause();a.onloadedmetadata=null;a.removeAttribute("src");a.load();clearTimeout(timer);resolve(d);}catch(e){clearTimeout(timer);reject(e);}};
    a.onerror=()=>{clearTimeout(timer);reject(new Error("decode "+url));};a.src=url;a.load();
   }),clip.url);
   assert.ok(duration>0&&Number.isFinite(duration));decoded.push({event,url:clip.url,duration});
  }
 }
 await page.locator("#progression").click();await page.waitForFunction(()=>window.__idle.snapshot().presentation.cuesPlayed.click>=1);
 await page.waitForTimeout(100);await page.locator(".progression-panel [data-close]").click();
 await page.waitForFunction(()=>window.__idle.snapshot().presentation.cuesPlayed.close>=1);
 await page.locator("#maps").click();await page.locator('[data-map="10006"]').click();
 await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10006"&&!window.__idle.snapshot().loadingActor);
 await page.locator("#auto-hunt").click();
 await page.waitForFunction(()=>window.__idle.snapshot().phase==="iniciando combate");
 await page.evaluate(()=>window.__idle.setHp(1));
 await page.waitForFunction(()=>window.__idle.snapshot().presentation.cuesPlayed.defeat===1);
 await page.waitForFunction(()=>window.__idle.snapshot().kills>=4&&window.__idle.snapshot().presentation.cuesPlayed.levelUp>=1,null,{timeout:90000});
 await page.locator("#auto-hunt").click();
 await page.waitForFunction(()=>window.__idle.snapshot().phase==="explorando",null,{timeout:15000});
 const cues=await page.evaluate(()=>window.__idle.snapshot().presentation.cuesPlayed);
 assert.equal(cues.battleStart||0,0);assert.equal(cues.victory||0,0);assert.equal(cues.defeat||0,0);assert.equal(cues.levelUp,1);
 assert.equal(await page.evaluate(()=>window.__idle.snapshot().heroSpriteInstances),1);
 const maxVoices=await page.evaluate(()=>Math.max(0,...window.__voices));assert.ok(maxVoices<=4);
 await page.locator("#sound").uncheck();const before=await page.evaluate(()=>window.__idle.snapshot().presentation.cuesPlayed);
 await page.locator("#progression").click();await page.locator(".progression-panel [data-close]").click();
 assert.deepEqual(await page.evaluate(()=>window.__idle.snapshot().presentation.cuesPlayed),before);
 assert.deepEqual(errors,[]);
 const report={checkedAt:new Date().toISOString(),decoded,cues,maxShortVoices:maxVoices,allEightVisitedMapsReload:true,maps:maps.length,silentPreferenceDefersAudio:true,mutingStopsNewCues:true,controlledDefeatUsingExistingDevSetHp:true,levelAndVictoryFromRealLocalHunt:true,singlePage:true,errors};
 await writeFile("reports/ui-audio-browser-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await browser.close();}
