// Local-only end-to-end check. Fake Supabase endpoints, real SDK, backend WebSockets,
// Phaser rendering and two isolated browser accounts. Never deploy this fixture.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {readFile,writeFile,readdir} from "node:fs/promises";
import {chromium} from "@playwright/test";
import {PGlite} from "@electric-sql/pglite";
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
  const displayName=i===0?"Village_Naruto":"Village_Sasuke";
  const user={id,email:character+"@example.invalid",aud:"authenticated",role:"authenticated",
    created_at:new Date().toISOString(),is_anonymous:false,app_metadata:{provider:"email"},user_metadata:{username}};
  const token="header."+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".fixture";
  const snapshot=fresh(character);
  snapshot.location="10001"; snapshot.paused=false; snapshot.sound=false; snapshot.music=false;
  snapshot.worldPosition={mapId:"10001",...spawnPoint};
  return {user,username,displayName,token,snapshot,revision:1,lease:null};
});
const errors=[],results={};
let game,browser,vite;
let debugPages=[];
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort())
  await db.exec(await readFile("supabase/migrations/"+file,"utf8"));
for(const a of users){
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",[a.user.id,{username:a.displayName}]);
  await db.query("insert into public.game_saves(user_id,snapshot) values($1,$2)",[a.user.id,a.snapshot]);
}
let tail=Promise.resolve();
const auth=createServer((req,res)=>{ tail=tail.then(async()=>{
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
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[account.user.id]);
    await db.exec("set role authenticated");
    if(url.pathname==="/rest/v1/player_profiles")return reply(200,(await db.query("select user_id,username,display_name from public.player_profiles where user_id=$1",[account.user.id])).rows);
    if(url.pathname==="/rest/v1/game_saves")return reply(200,(await db.query("select user_id,snapshot,revision from public.game_saves where user_id=$1",[account.user.id])).rows);
    const rpc=url.pathname.split("/").pop();
    if(!["game_takeover","game_open","game_commit","game_release","game_heartbeat","social_profile","social_list","social_search","social_update_profile","social_friend_action","social_inspect_player"].includes(rpc))
      return reply(404,{message:"Not found"});
    const args=Object.entries(body);
    if(args.some(([k])=>!/^p_[a-z_]+$/.test(k)))return reply(400,{message:"Invalid argument"});
    try{
      const q="select public."+rpc+"("+args.map(([k],i)=>k+"=>$"+(i+1)).join(",")+") as result";
      const r=await db.query(q,args.map(([,v])=>v));
      return reply(200,r.rows[0]?.result??null);
    }catch(error){return reply(400,{message:error.message});}
  }catch(error){reply(500,{message:"Local fixture failure"});}
  });
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
  assert.equal((await pages[0].evaluate(()=>window.__idle.snapshot().npcs)).length,0);
  assert.equal((await pages[1].evaluate(()=>window.__idle.snapshot().npcs)).length,0);
  results.removedKakashiAndHinata=true;
  assert.equal(await pages[0].evaluate(()=>window.__idle.snapshot().multiplayer.players[0].displayName),"Village_Sasuke");
  results.originalCapitalizationInVillage=true;
  await pages[0].locator("#social").click();
  await pages[0].locator("[data-social-own]").click();
  await pages[0].locator('[data-social-edit] [name=displayName]').fill("ViLlAgE_NaRuTo");
  const bio='<img src=x onerror="window.__bioXss=true">';
  await pages[0].locator('[data-social-edit] [name=bio]').fill(bio);
  await pages[0].locator('[data-social-edit] [name=avatar]').selectOption("11000301");
  await pages[0].locator('[data-social-edit] button[type=submit]').click();
  await pages[0].waitForFunction(()=>document.querySelector(".social-profile-heading h3")?.textContent==="ViLlAgE_NaRuTo");
  await pages[1].waitForFunction(()=>window.__idle.snapshot().multiplayer.players[0]?.displayName==="ViLlAgE_NaRuTo");
  assert.equal(await pages[0].locator(".social-bio").textContent(),bio);
  assert.equal(await pages[0].evaluate(()=>!!window.__bioXss),false);
  results.editCaseBioAvatarAndEscapeMarkup=true;
  await pages[0].locator("#social-search-name").fill("VILLAGE_SASUKE");
  await pages[0].locator("[data-social-search] button[type=submit]").click();
  await pages[0].getByRole("button",{name:"Adicionar amigo",exact:true}).click();
  await pages[0].getByRole("button",{name:"Cancelar pedido",exact:true}).waitFor();
  results.searchAndSendFriendRequest=true;
  await pages[1].locator("#social").click();
  await pages[1].locator('[data-social-tab=requests]').click();
  await pages[1].getByRole("button",{name:"Aceitar",exact:true}).click();
  await pages[1].locator('[data-social-tab=friends]').click();
  await pages[1].locator(".social-name").filter({hasText:"ViLlAgE_NaRuTo"}).waitFor();
  await pages[0].locator('[data-social-refresh]').click();
  await pages[0].locator('[data-social-tab=friends]').click();
  await pages[0].locator(".social-name").filter({hasText:"Village_Sasuke"}).waitFor();
  results.acceptAndMutualFriendLists=true;
  await pages[0].screenshot({path:"reports/social-friends-desktop.png"});
  await pages[1].setViewportSize({width:390,height:844});
  await pages[1].screenshot({path:"reports/social-friends-mobile.png"});
  const width=await pages[1].locator(".social-panel").evaluate(e=>e.getBoundingClientRect().width);
  assert.ok(width<=390);
  results.mobileDialogFitsViewport=true;
  await pages[0].reload();
  await pages[0].locator("[data-action=play]").click();
  await pages[0].waitForFunction(()=>window.__idle?.snapshot()?.multiplayer?.status==="online",{},{timeout:90000});
  await pages[0].locator("#social").click();
  await pages[0].locator(".social-name").filter({hasText:"Village_Sasuke"}).waitFor();
  results.friendshipSurvivesReload=true;
  await pages[0].locator("[data-social-own]").click();
  await pages[0].waitForFunction(()=>document.querySelector(".social-profile-heading h3")?.textContent==="ViLlAgE_NaRuTo");
  assert.equal(await pages[0].locator('[data-social-edit] [name=avatar]').inputValue(),"11000301");
  assert.equal(await pages[0].locator('[data-social-edit] [name=bio]').inputValue(),bio);
  results.profileSurvivesReload=true;
  await pages[0].locator('[data-social-tab=friends]').click();
  await pages[0].getByRole("button",{name:"Remover amigo",exact:true}).click();
  await pages[0].getByRole("button",{name:"Remover amigo",exact:true}).click();
  await pages[0].getByText("Sua lista está vazia.",{exact:false}).waitFor();
  await pages[1].locator('[data-social-refresh]').click();
  await pages[1].getByText("Sua lista está vazia.",{exact:false}).waitFor();
  results.removeFriendUpdatesBothAccounts=true;
  await pages[0].locator('[data-social-tab=nearby]').click();
  await pages[0].locator(".social-name").filter({hasText:"Village_Sasuke"}).click();
  await pages[0].getByRole("button",{name:"Adicionar amigo",exact:true}).waitFor();
  results.openNearbyPlayerProfile=true;
  assert.deepEqual(errors,[]);
  results.noBrowserErrors=true;
  await writeFile("reports/social-validation.json",JSON.stringify({date:new Date().toISOString(),environment:"Local Auth fixture + real PGlite social SQL + real WebSocket server + two Chrome contexts",results,limits:["No live Supabase accounts modified","No Render/Vercel deploy","Cosmetic presence; combat and economy are not authoritative"]},null,2)+"\n");
  console.log(JSON.stringify(results));
}catch(error){
  console.log("Browser check failure",String(error),errors);
  for(let i=0;i<debugPages.length;i++){try{console.log(JSON.stringify(await debugPages[i].evaluate(()=>({debug:window.__idle?.snapshot(),status:document.querySelector("[data-multiplayer-status]")?.textContent,loading:document.getElementById("game-loading")?.textContent})),null,2));await debugPages[i].screenshot({path:"reports/social-failure-"+i+".png"});}catch{}}
  throw error;
}finally{
  await browser?.close();
  if(game)await game.stop();
  vite?.kill();
  await new Promise(r=>auth.close(r));
  await db.close();
}
