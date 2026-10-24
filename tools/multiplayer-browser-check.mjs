// Local-only end-to-end check. Fake Supabase endpoints, real SDK, backend WebSockets,
// Phaser rendering and two isolated browser accounts. Never deploy this fixture.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {chromium} from "@playwright/test";
import {fresh} from "../src/model.ts";
import {NativeNavigation} from "../src/world/navigation.ts";
import {withSceneGeometry} from "../src/world/scene-geometry.ts";
import {createGameServer} from "../../Naruto Idle Backend/dist/server.js";
import {supabaseAuthenticator} from "../../Naruto Idle Backend/dist/auth.js";

const base="http://127.0.0.1:5196",authBase="http://127.0.0.1:5197",wsBase="ws://127.0.0.1:5198/ws";
const grid=withSceneGeometry("10001",JSON.parse(await readFile("public/assets/maps/10001/navigation.json","utf8")));
const nav=new NativeNavigation(grid),spawnPoint=nav.nearest({x:385,y:260});
assert.ok(spawnPoint);
const users=["naruto","sasuke"].map((character,i)=>{
  const id=`11111111-1111-4111-8111-11111111111${i}`;
  const username="village_"+character;
  const user={id,email:character+"@example.invalid",aud:"authenticated",role:"authenticated",
    created_at:new Date().toISOString(),is_anonymous:false,app_metadata:{provider:"email"},user_metadata:{username}};
  const token="header."+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".fixture";
  const snapshot=fresh(character);
  snapshot.location="10001"; snapshot.paused=false; snapshot.sound=false; snapshot.music=false;
  snapshot.worldPosition={mapId:"10001",...spawnPoint};
  return {user,username,token,snapshot,revision:1,lease:null};
});
const errors=[],results={};
let game,browser,vite;
let debugPages=[];
const auth=createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin",base);
  res.setHeader("Access-Control-Allow-Headers","authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Content-Type","application/json");
  const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try{
    if(req.method==="OPTIONS")return reply(200,{});
    const url=new URL(req.url,authBase);
    let raw="";for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw||"{}");
    const bearer=req.headers.authorization?.replace(/^Bearer /,"");
    let account=users.find(a=>a.token===bearer);
    if(url.pathname==="/auth/v1/token"){
      account=users.find(a=>a.user.email===body.email);
      if(!account||body.password!=="local-test-only")return reply(400,{msg:"Invalid login credentials"});
      return reply(200,{access_token:account.token,refresh_token:"fixture-"+account.username,expires_in:3600,token_type:"bearer",user:account.user});
    }
    if(!account)return reply(401,{message:"Invalid token"});
    if(url.pathname==="/auth/v1/user")return reply(200,account.user);
    if(url.pathname==="/auth/v1/logout")return reply(200,{});
    if(url.pathname==="/rest/v1/player_profiles")return reply(200,[{username:account.username,user_id:account.user.id}]);
    if(url.pathname==="/rest/v1/game_saves")return reply(200,[{user_id:account.user.id,snapshot:account.snapshot,revision:account.revision}]);
    const rpc=url.pathname.split("/").pop();
    if(rpc==="game_takeover"||rpc==="game_open"){
      account.lease=body.p_lease;
    }else if(rpc==="game_commit"){
      if(account.lease!==body.p_lease)return reply(409,{message:"SESSION_LOST"});
      if(account.revision!==body.p_revision)return reply(409,{message:"REVISION_CONFLICT"});
      account.snapshot=body.p_snapshot;account.revision++;
    }else if(rpc==="game_release"){
      account.lease=null;return reply(200,null);
    }else if(rpc!=="game_heartbeat")return reply(404,{message:"Not found"});
    return reply(200,{snapshot:account.snapshot,revision:account.revision,serverNow:Date.now(),leaseUntil:Date.now()+120000});
  }catch{reply(500,{message:"Local fixture failure"});}
});
async function listen(server,port){await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});}
async function untilReady(url){
  const end=Date.now()+30000;
  while(Date.now()<end){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}
  throw new Error("Local server did not start");
}
try{
  await listen(auth,5197);
  const config={port:5198,host:"127.0.0.1",supabaseUrl:authBase,publishableKey:"fixture-public",
    origins:new Set([base]),maps:new Set(["10001"]),maxConnections:10,maxRoomPlayers:20};
  game=createGameServer(config,supabaseAuthenticator(config));await listen(game.http,5198);
  vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5196","--strictPort","--configLoader","runner"],{
    env:{...process.env,VITE_SUPABASE_URL:authBase,VITE_SUPABASE_PUBLISHABLE_KEY:"fixture-public",VITE_MULTIPLAYER_URL:wsBase},
    stdio:["ignore","ignore","pipe"],windowsHide:true,
  });
  vite.stderr.on("data",()=>{});
  await untilReady(base);
  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",
    args:["--disable-extensions","--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({locale:"pt-BR",viewport:{width:1280,height:900}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  debugPages=pages;
  for(const p of pages)p.on("websocket",socket=>socket.on("framereceived",frame=>{try{const m=JSON.parse(String(frame.payload));if(m.type==="error")console.log("WS error "+m.code);}catch{}}));
  for(const page of pages)page.on("pageerror",e=>errors.push(e.message));
  async function login(page,i){
    await page.goto(base);
    await page.locator("#account-access [name=email]").fill(users[i].user.email);
    await page.locator("#account-access [name=password]").fill("local-test-only");
    await page.locator("#account-access button[type=submit]").click();
    await page.locator("[data-action=play]").click();
    await page.waitForFunction(()=>window.__idle?.snapshot()?.multiplayer?.status==="online" && document.getElementById("game-loading").hidden,{},{timeout:90000});
  }
  console.log("Login first player");
  await login(pages[0],0);
  console.log("First player online");
  await login(pages[1],1);
  console.log("Both players online");
  for(const page of pages)await page.waitForFunction(()=>window.__idle.snapshot().multiplayer.players.some(p=>p.visible),{},{timeout:90000});
  const a=await pages[0].evaluate(()=>window.__idle.snapshot());
  const b=await pages[1].evaluate(()=>window.__idle.snapshot());
  assert.equal(a.multiplayer.players[0].username,"village_sasuke");
  assert.equal(a.multiplayer.players[0].characterId,"11000211");
  assert.equal(b.multiplayer.players[0].username,"village_naruto");
  assert.equal(b.multiplayer.players[0].characterId,"11000101");
  results.twoAccountsSeeCorrectCharactersAndNames=true;
  // Walk through the same native navigation used by keyboard and click movement.
  const target=await pages[1].evaluate(()=>{
    const api=window.__idle,nav=api.navigation(),hero=api.snapshot().hero;
    const p=nav.pointsWithin(hero,75).find(p=>Math.hypot(p.x-hero.x,p.y-hero.y)>40 && nav.clear(hero,p));
    if(!p)throw new Error("No movement test target");
    if(!api.walkTo(p))throw new Error("Walk command rejected");
    return p;
  });
  await pages[0].waitForFunction(()=>window.__idle.snapshot().multiplayer.players[0]?.animation?.includes(":world:run_"),{},{timeout:15000});
  results.directionalRunAnimation=true;
  await pages[1].waitForFunction(p=>Math.hypot(window.__idle.snapshot().hero.x-p.x,window.__idle.snapshot().hero.y-p.y)<2,target,{timeout:15000});
  await pages[0].waitForFunction(p=>{const r=window.__idle.snapshot().multiplayer.players[0];return r && Math.hypot(r.x-p.x,r.y-p.y)<3 && r.animation?.includes(":world:idle_");},target,{timeout:15000});
  results.remoteMovementAndIdle=true;
  await pages[0].screenshot({path:"reports/multiplayer-village.png"});
  await pages[1].locator("#back").click();
  await pages[0].waitForFunction(()=>window.__idle.snapshot().multiplayer.players.length===0);
  results.returnToMenuRemovesPlayer=true;
  await pages[1].locator("[data-action=play]").click();
  await pages[0].waitForFunction(()=>window.__idle.snapshot().multiplayer.players.some(p=>p.visible),{},{timeout:90000});
  results.reenterVillageRestoresPlayer=true;
  // Force a network drop, preserving the game scene, then check automatic rejoin.
  await contexts[1].setOffline(true);
  await new Promise(r=>setTimeout(r,500));
  await contexts[1].setOffline(false);
  // Force an actual server socket close; HTTP emulation alone does not always affect WebSocket.

  await game.stop();
  for(const page of pages)await page.waitForFunction(()=>window.__idle.snapshot().multiplayer.players.length===0);
  game=createGameServer(config,supabaseAuthenticator(config));await listen(game.http,5198);
  for(const page of pages)await page.waitForFunction(()=>window.__idle.snapshot().multiplayer.players.some(p=>p.visible),{},{timeout:30000});
  results.serverRestartReconnectsBothPlayers=true;
  // Travel out of the village through the existing UI and verify absence from village.
  await pages[1].locator("#maps").click();
  await pages[1].locator('[data-map="10006"]').click();
  await pages[1].waitForFunction(()=>window.__idle.snapshot().mapId==="10006" && document.getElementById("game-loading").hidden,{},{timeout:90000});
  await pages[0].waitForFunction(()=>window.__idle.snapshot().multiplayer.players.length===0);
  results.travelOutRemovesPlayer=true;
  await pages[1].locator("#return-lobby").click();
  await pages[1].waitForFunction(()=>window.__idle.snapshot().mapId==="10001" && document.getElementById("game-loading").hidden,{},{timeout:90000});
  await pages[0].waitForFunction(()=>window.__idle.snapshot().multiplayer.players.some(p=>p.visible),{},{timeout:30000});
  results.returnToVillageRejoins=true;
  assert.deepEqual(errors,[]);
  results.noBrowserErrors=true;
  await writeFile("reports/multiplayer-village-validation.json",JSON.stringify({date:new Date().toISOString(),environment:"Local simulated Supabase + real WebSocket server + two Chrome contexts",results,limits:["No live Supabase accounts modified","No Render/Vercel deploy","Cosmetic presence; combat and economy are not authoritative"]},null,2)+"\n");
  console.log(JSON.stringify(results));
}catch(error){
  console.log("Browser check failure",String(error),errors);
  for(let i=0;i<debugPages.length;i++){try{console.log(JSON.stringify(await debugPages[i].evaluate(()=>({debug:window.__idle?.snapshot(),status:document.querySelector("[data-multiplayer-status]")?.textContent,loading:document.getElementById("game-loading")?.textContent})),null,2));await debugPages[i].screenshot({path:"reports/multiplayer-failure-"+i+".png"});}catch{}}
  throw error;
}finally{
  await browser?.close();
  if(game)await game.stop();
  vite?.kill();
  await new Promise(r=>auth.close(r));
}
