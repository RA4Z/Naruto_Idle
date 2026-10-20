import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],missing=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on("pageerror",e=>errors.push(String(e)));page.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>window.__idle?.snapshot()&&document.getElementById("game-loading").hidden);
 for(const id of ["10007","10009"]){
  await page.locator("#maps").click();await page.locator(`[data-map="${id}"]`).click();
  await page.waitForFunction(id=>window.__idle.snapshot().mapId===id&&!window.__idle.snapshot().loadingActor,id);
  const beforeSave=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
  const before=await page.evaluate(()=>window.__idle.snapshot());assert.equal(before.enemies.length,6);assert.ok(before.walkable);assert.ok(before.nativeForeground.masked);assert.equal(before.party.length,0);
  await page.waitForTimeout(1700);
  const moved=await page.evaluate(()=>window.__idle.snapshot());
  assert.ok(moved.enemies.some((m,i)=>Math.hypot(m.x-before.enemies[i].x,m.y-before.enemies[i].y)>1),"enemies actually patrol");
  const target=await page.evaluate(()=>{const s=window.__idle.snapshot(),n=window.__idle.navigation();return n.pointsWithin(s.hero,60).find(p=>Math.hypot(p.x-s.hero.x,p.y-s.hero.y)>30&&n.clear(s.hero,p)&&s.enemies.every(e=>Math.hypot(e.x-p.x,e.y-p.y)>45));});assert.ok(target);
  await page.evaluate(p=>window.__idle.walkTo(p),target);
  await page.waitForFunction(p=>Math.hypot(window.__idle.snapshot().hero.x-p.x,window.__idle.snapshot().hero.y-p.y)<1,target,{timeout:12000});
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(k=>window.__idle.snapshot().kills>k,before.kills,{timeout:45000});
  await page.locator("#auto-hunt").click();await page.waitForFunction(()=>window.__idle.snapshot().phase==="explorando",null,{timeout:30000});
  const reward=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
  assert.ok(reward.coins>beforeSave.coins,"victory grants real currency");
  assert.ok(reward.level>beforeSave.level||reward.xp>beforeSave.xp,"victory advances active character");
  const won=await page.evaluate(()=>window.__idle.snapshot());assert.equal(won.heroSpriteInstances,1);assert.ok(won.enemies.every(e=>e.walkable));
  await page.screenshot({path:`reports/world-expansion-${id}.png`});
  await page.reload();await page.locator("#continue").click();
  await page.waitForFunction(id=>window.__idle?.snapshot().mapId===id&&document.getElementById("game-loading").hidden,id);
  const restored=await page.evaluate(()=>window.__idle.snapshot());assert.equal(restored.kills,won.kills);assert.equal(restored.heroSpriteInstances,1);
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));assert.ok(save.visitedMaps.includes(id));
  await page.locator("#return-lobby").click();await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10001"&&!window.__idle.snapshot().loadingActor);
  results.push({map:id,nativeRegion:id==="10007"?2:0,sixPatrollingEnemies:true,manualWalk:true,victoryAndLoot:true,reloadPreservesMapAndProgress:true,returnToLobby:true,partyEmpty:true,singleHero:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const report={checkedAt:new Date().toISOString(),results,errors,missing,policy:"one browser, one game scene, sequential maps"};
 await writeFile("reports/world-expansion-browser-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({completed:results,errors,missing,failure:String(error)}));throw error;}
finally{await browser.close();}
