// Opt-in live check. Creates only two disposable accounts, sends no emails,
// interacts only between those accounts, and removes both in finally.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {createClient} from "@supabase/supabase-js";
import {freeProject,management} from "./supabase-management.mjs";
if(!process.argv.includes("--create-test-users"))throw new Error("Requires --create-test-users");
const ref=await freeProject();assert.equal(ref,"gxyxlfytcjvvkmrlalrs");
const keys=await management("projects/"+ref+"/api-keys?reveal=true");
const key=keys.find(k=>k.name==="service_role")?.api_key;
assert.ok(key,"Administrative key not available");
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(process.env.VITE_SUPABASE_URL,key,opts);
const accounts=[],sessions=[],results={};let cleanup=true;
const ok=reply=>{if(reply.error)throw new Error("Supabase test operation failed: "+(reply.error.code??reply.error.status??"unknown"));return reply.data;};
try{
  for(let i=0;i<2;i++){
    const displayName="FrIeNd_"+randomBytes(5).toString("hex");
    const email="social-"+randomBytes(12).toString("hex")+"@example.invalid";
    const password=randomBytes(32).toString("base64url");
    const {user}=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:displayName},
      app_metadata:{purpose:"disposable-social-integration-check"}}));
    accounts.push({id:user.id,displayName});
    const c=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,opts);
    sessions.push(c);ok(await c.auth.signInWithPassword({email,password}));
  }
  const[a,b]=sessions,[aa,bb]=accounts;
  const p=ok(await a.rpc("social_profile",{p_user:null}));
  assert.equal(p.display_name,aa.displayName);assert.equal(p.username,aa.displayName.toLowerCase());
  assert.equal("email" in p,false);
  const own=ok(await a.from("player_profiles").select("user_id,display_name"));
  assert.equal(own.length,1);assert.equal(own[0].user_id,aa.id);
  results.displayNameAndOwnProfileRls=true;
  const found=ok(await a.rpc("social_search",{p_username:bb.displayName.toUpperCase()}));
  assert.equal(found.user_id,bb.id);results.exactCaseInsensitiveSearch=true;
  assert.equal(ok(await a.rpc("social_friend_action",{p_target:bb.id,p_action:"request"})),"outgoing");
  assert.equal(ok(await a.rpc("social_friend_action",{p_target:bb.id,p_action:"request"})),"outgoing");
  const denied=await a.rpc("social_friend_action",{p_target:bb.id,p_action:"accept"});
  assert.ok(denied.error && /FRIEND_ACTION_DENIED/.test(denied.error.message));
  assert.equal(ok(await b.rpc("social_list")).incoming[0].user_id,aa.id);
  assert.equal(ok(await b.rpc("social_friend_action",{p_target:aa.id,p_action:"accept"})),"friends");
  assert.equal(ok(await a.rpc("social_list")).friends[0].user_id,bb.id);
  assert.equal(ok(await b.rpc("social_list")).friends[0].user_id,aa.id);
  results.requestAcceptAndMutualLists=true;
  const upper=aa.displayName.toUpperCase();
  const updated=ok(await a.rpc("social_update_profile",{p_display_name:upper,p_bio:"Temporary integration check",p_avatar_id:"11000301"}));
  assert.equal(updated.display_name,upper);
  assert.equal(ok(await b.rpc("social_profile",{p_user:aa.id})).display_name,upper);
  results.profileUpdateAndPublicRead=true;
  assert.equal(ok(await a.rpc("social_friend_action",{p_target:bb.id,p_action:"remove"})),"none");
  assert.equal(ok(await b.rpc("social_list")).friends.length,0);
  results.removeFriend=true;
  const snapshot={version:1,character:"sasuke",activeEntityId:"11000211",level:5,coins:12345,upgrades:2,inventory:{"kunai-reforcada":1,"private-token":1},equipment:{weapon:"kunai-reforcada"},privateMetadata:"never-public"};
  ok(await admin.from("game_saves").insert({user_id:bb.id,snapshot}));
  const inspection=ok(await a.rpc("social_inspect_player",{p_user:bb.id}));
  assert.deepEqual(inspection.character,{id:"11000211",level:5,upgrades:2,equipment:{weapon:"kunai-reforcada"}});
  assert.equal(inspection.profile.user_id,bb.id);
  for(const hidden of ["coins","inventory","private-token","privateMetadata"])assert.equal(JSON.stringify(inspection).includes(hidden),false);
  assert.equal(ok(await a.from("game_saves").select("user_id")).length,0);
  results.publicCharacterInspectionWithoutPrivateSaveAccess=true;
}finally{
  for(const c of sessions)await c.auth.signOut({scope:"local"}).catch(()=>{});
  for(const a of accounts){const r=await admin.auth.admin.deleteUser(a.id);if(r.error)cleanup=false;}
  const report={date:new Date().toISOString(),projectRef:ref,environment:"Live Supabase Auth + social RPCs + RLS",results,cleanup,
    limits:["Only disposable confirmed accounts; no emails sent","No interactions with existing players","Render deployment not performed"]};
  await writeFile("reports/social-live-validation.json",JSON.stringify(report,null,2)+"\n");
  if(!cleanup)throw new Error("Temporary account cleanup failed");
}
console.log(JSON.stringify({results,cleanup}));
