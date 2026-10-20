import{chromium}from"@playwright/test";import assert from"node:assert/strict";import{writeFile}from"node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--renderer-process-limit=1","--disable-extensions"]});
const errors=[],missing=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on("pageerror",e=>errors.push(String(e)));page.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!document.getElementById("play").hidden);
 for(const id of["10007","10009"]){
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));
  await page.locator("#maps").click();await page.locator(`[data-map="${id}"]`).click();
  await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,id);
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(k=>JSON.parse(localStorage.getItem("folha-idle-v1")).kills>k,before.kills,{timeout:45000});
  await page.locator("#auto-hunt").click();
  await page.reload();await page.locator("#continue").click();
  await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,id);
  assert.equal(await page.locator("#canvas canvas").count(),1);
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("folha-idle-v1")));assert.ok(after.coins>before.coins);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location==="10001");
  results.push({map:id,productionTravelAndVictory:true,reloadAndLobbyReturn:true,rewardPersisted:true,singleCanvas:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.equal(await page.evaluate(()=>typeof window.__idle),"undefined");
 const report={checkedAt:new Date().toISOString(),results,errors,missing};await writeFile("reports/world-expansion-production-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
}finally{await browser.close();}
