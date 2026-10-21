import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base=process.env.BASE_URL||"http://127.0.0.1:5178";
const production=process.env.PRODUCTION==="1";
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--disable-extensions","--renderer-process-limit=1"]});
const errors=[],requests=[],results=[];
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on("pageerror",error=>errors.push(String(error)));
 page.on("request",request=>{if(/\.mp3(?:\?|$)/.test(request.url()))requests.push(new URL(request.url()).pathname);});
 await page.goto(base);await page.locator("#new").click();await page.locator('[data-character="naruto"]').click();
 await page.waitForFunction(()=>document.getElementById("game-loading").hidden&&!!document.querySelector("#canvas canvas"));
 assert.equal(requests.length,0,"no optional audio requested while disabled");
 const index=JSON.parse(await readFile("public/assets/audio/scenes/index.json","utf8"));
 const decoded=[];
 // Each source is streamed and released before inspecting the next one.
 for (const url of Object.keys(index.files)) {
  const metadata=await page.evaluate(url=>new Promise((resolve,reject)=>{
   const audio=new Audio();audio.preload="metadata";
   const timer=setTimeout(()=>{audio.pause();audio.removeAttribute("src");audio.load();reject(new Error("audio timeout "+url));},12000);
   audio.onloadedmetadata=async()=>{
    try {await audio.play(); const duration=audio.duration;
     audio.pause();audio.onloadedmetadata=null;audio.removeAttribute("src");audio.load();clearTimeout(timer);resolve({duration});}
    catch(error){clearTimeout(timer);reject(error);}
   };audio.onerror=()=>{clearTimeout(timer);reject(new Error("decode failed "+url));};audio.src=url;audio.load();
  }),url);
  assert.ok(Number.isFinite(metadata.duration)&&metadata.duration>0);decoded.push({url,...metadata});
 }
 requests.length=0;
 await page.locator("#sound").check();await page.locator("#music").check();
 const snapshot=async()=>page.evaluate(()=>window.__idle?.snapshot().presentation);
 if(!production) {
  await page.waitForFunction(()=>window.__idle.snapshot().presentation.musicPlaying);
  assert.equal((await snapshot()).musicUrl,"/assets/audio/music/main.mp3");
 }
 for(const id of ["10005","10006","10008","10007","10009"]){
  await page.locator("#maps").click();await page.locator('[data-map="'+id+'"]').click();
  await page.waitForFunction(id=>document.getElementById("game-loading").hidden&&JSON.parse(localStorage.getItem("folha-idle-v1")).location===id,id);
  if(!production){
   await page.waitForFunction(id=>{const s=window.__idle.snapshot();return s.mapId===id&&s.presentation.musicPlaying&&s.presentation.environmentPlaying;},id);
   const state=await snapshot();assert.equal(state.sourceSceneId,index.maps[id].sceneId);
   assert.ok(index.maps[id].tracks.includes(state.musicUrl));assert.equal(state.environmentUrl,index.maps[id].environment);assert.equal(state.activeElements,2);
   await page.locator("#pause").click();
   await page.waitForFunction(()=>!window.__idle.snapshot().presentation.musicPlaying&&!window.__idle.snapshot().presentation.environmentPlaying);
   await page.locator("#pause").click();
   await page.waitForFunction(()=>window.__idle.snapshot().presentation.musicPlaying&&window.__idle.snapshot().presentation.environmentPlaying);
   await page.locator("#music").uncheck();await page.waitForFunction(()=>!window.__idle.snapshot().presentation.musicPlaying&&window.__idle.snapshot().presentation.environmentPlaying);
   await page.locator("#music").check();await page.waitForFunction(()=>window.__idle.snapshot().presentation.musicPlaying);
   results.push({map:id,sourceSceneId:state.sourceSceneId,correctTracks:true,pauseResume:true,independentPreferences:true,boundedElements:2});
  } else {
   await page.waitForTimeout(700);
   assert.ok(requests.some(url=>index.maps[id].tracks.includes(url)));
   assert.ok(requests.includes(index.maps[id].environment));
   results.push({map:id,originalAudioRequested:true});
  }
 }
 if(!production){
  await page.route("**/assets/audio/scenes/adv05.mp3",route=>route.abort());
  await page.locator("#maps").click();await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(()=>window.__idle.snapshot().mapId==="10006"&&document.getElementById("game-loading").hidden);
  await page.waitForFunction(()=>window.__idle.snapshot().presentation.failedTracks===1);
  await page.waitForFunction(()=>window.__idle.snapshot().presentation.environmentPlaying);
  await page.unroute("**/assets/audio/scenes/adv05.mp3");
  await page.locator("#music").uncheck();await page.locator("#music").check();
  await page.waitForFunction(()=>window.__idle.snapshot().presentation.musicPlaying);
 }
 await page.locator("#sound").uncheck();
 if(!production)assert.equal((await snapshot()).activeElements,0);
 // /admin preview is authenticated and never preloads the album.
 await page.close(); // Release the game before opening the admin preview.
 const admin=await browser.newPage();
 await admin.goto(base+"/admin");
 await admin.locator('input[type="password"]').fill("admin");await admin.getByRole("button",{name:"Entrar",exact:true}).click();
 await admin.getByRole("button",{name:"Sons e músicas",exact:true}).click();
 await admin.locator("[data-scene-audio]").first().waitFor();
 assert.equal(await admin.locator("[data-scene-audio]").count(),11);
 assert.equal(await admin.locator("[data-scene-audio] audio").evaluateAll(list=>list.every(a=>a.preload==="none")),true);
 assert.deepEqual(errors,[]);
 const report={checkedAt:new Date().toISOString(),production,decoded,results,noAudioBeforeOptIn:true,optionalFailureDoesNotBlockTravel:production ? "not-run" : true,authenticatedAdminTracks:11,errors};
 await writeFile("reports/scene-audio-"+(production?"production":"browser")+"-validation.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
} finally {await browser.close();}
