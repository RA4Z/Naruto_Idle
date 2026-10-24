import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("social profiles preserve spelling and friendships enforce participant permissions",async t=>{
  const db=new PGlite();
  const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",c="33333333-3333-4333-8333-333333333333",d="44444444-4444-4444-8444-444444444444";
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const files=(await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort();
    for(const f of files.filter(f=>!f.endsWith("_social_profiles.sql")))await db.exec(await readFile("supabase/migrations/"+f,"utf8"));
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",[a,{username:"RaZ"}]);
    const social=files.find(f=>f.endsWith("_social_profiles.sql"));assert.ok(social);
    await db.exec(await readFile("supabase/migrations/"+social,"utf8"));
    for(const[id,name]of [[b,"SaKuRa"],[c,"Other_Ninja"],[d,null]])
      await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",[id,name?{username:name}:{}]);
    async function as(id,role="authenticated"){
      await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec("set role "+role);
    }
    const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
    const profile=id=>call("select public.social_profile($1) as result",[id]);
    const action=(id,name)=>call("select public.social_friend_action($1,$2) as result",[id,name]);
    const list=()=>call("select public.social_list() as result");
    await t.test("backfill and new accounts preserve case; canonical identity remains unique",async()=>{
      await as(a);const p=await profile(a);assert.equal(p.display_name,"RaZ");assert.equal(p.username,"raz");
      await as(b);assert.equal((await profile(b)).display_name,"SaKuRa");
      await as(d);assert.equal(await call("select public.game_set_username('New_Ninja') as result"),"new_ninja");
      assert.equal((await profile(d)).display_name,"New_Ninja");
      await db.exec("reset role");
      await assert.rejects(db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",["55555555-5555-4555-8555-555555555555",{username:"RAZ"}]),/unique/);
    });
    await t.test("profile exposes only public fields and exact search is case-insensitive",async()=>{
      await as(b);const p=await call("select public.social_search(' RAZ ') as result");
      assert.equal(p.display_name,"RaZ");
      assert.deepEqual(Object.keys(p).sort(),["avatar_id","bio","created_at","display_name","relationship","user_id","username"].sort());
      assert.equal(await call("select public.social_search('missing') as result"),null);
      await as(a);
      const changed=await call("select public.social_update_profile($1,$2,$3) as result",["RAz","Hi <script>world</script>","11000211"]);
      assert.equal(changed.display_name,"RAz");assert.equal(changed.bio,"Hi <script>world</script>");
      await assert.rejects(call("select public.social_update_profile($1,'','11000101') as result",["another"]),/DISPLAY_NAME_INVALID/);
      await assert.rejects(call("select public.social_update_profile('RAz',$1,'11000101') as result",["x".repeat(161)]),/BIO_INVALID/);
      await assert.rejects(call("select public.social_update_profile('RAz','','https://evil.example') as result"),/AVATAR_INVALID/);
    });
    await t.test("requests are unique, reciprocal requests need acceptance and third parties cannot mutate",async()=>{
      await as(a);assert.equal(await action(b,"request"),"outgoing");assert.equal(await action(b,"request"),"outgoing");
      assert.equal((await list()).outgoing.length,1);await assert.rejects(action(b,"accept"),/FRIEND_ACTION_DENIED/);
      await assert.rejects(action(a,"request"),/FRIEND_SELF/);
      await as(c);assert.deepEqual(await list(),{friends:[],incoming:[],outgoing:[]});
      assert.deepEqual((await db.query("select * from public.player_friendships")).rows,[]);
      await assert.rejects(action(a,"accept"),/FRIEND_REQUEST_MISSING/);
      await as(b);assert.equal(await action(a,"request"),"incoming");
      assert.equal((await list()).incoming[0].display_name,"RAz");
      assert.equal(await action(a,"accept"),"friends");assert.equal(await action(a,"accept"),"friends");
      await as(a);assert.equal((await list()).friends[0].user_id,b);
      await as(b);assert.equal((await list()).friends[0].user_id,a);
    });
    await t.test("remove, cancel and decline persist only when authorized",async()=>{
      await as(a);assert.equal(await action(b,"remove"),"none");assert.deepEqual((await list()).friends,[]);
      await action(b,"request");await as(b);await assert.rejects(action(a,"cancel"),/FRIEND_ACTION_DENIED/);
      assert.equal(await action(a,"decline"),"none");
      await as(a);await action(b,"request");await assert.rejects(action(b,"decline"),/FRIEND_ACTION_DENIED/);
      assert.equal(await action(b,"cancel"),"none");assert.equal(await action(b,"cancel"),"none");
      await as(b);assert.deepEqual((await list()).incoming,[]);
    });
    await t.test("direct writes and anonymous RPC access are denied",async()=>{
      await as(a);
      for(const sql of ["update public.player_profiles set display_name='raz'","delete from public.player_friendships",
        `insert into public.player_friendships(user_a,user_b,requester) values('${a}','${b}','${a}')`])
        await assert.rejects(db.exec(sql),/permission denied/);
      assert.equal((await db.query("select * from public.player_profiles")).rows.length,1);
      await as("","anon");
      for(const sql of ["select public.social_profile(null)","select public.social_search('raz')","select public.social_list()",
        `select public.social_friend_action('${a}','request')`,"select public.social_update_profile('raz','','11000101')"])
        await assert.rejects(db.exec(sql),/permission denied/);
    });
    await t.test("deleting an account cascades its friendship records",async()=>{
      await as(a);await action(b,"request");await as(b);await action(a,"accept");
      await db.exec("reset role");await db.query("delete from auth.users where id=$1",[b]);
      assert.equal((await db.query("select count(*)::int as n from public.player_friendships")).rows[0].n,0);
    });
  }finally{await db.close();}
});
