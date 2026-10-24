import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("cloud-only creation uses server defaults and disables all legacy JSON imports", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ["20261021205949_cloud_progress", "20261021211745_player_accounts", "20261021215614_cloud_only_progress"])
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    const uid = "11111111-1111-4111-8111-111111111111", lease = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [uid,{username:"new_player"}]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.game_claim($1,$2)",[lease,{version:1,coins:999999}]), /IMPORT_DISABLED/);
    await assert.rejects(db.query("select public.game_open($1,'invalid')",[lease]), /INVALID_CHARACTER/);
    await assert.rejects(db.query("select public.game_open($1)",[lease]), /SAVE_MISSING/);
    const created = (await db.query("select public.game_open($1,'sasuke') as reply",[lease])).rows[0].reply;
    assert.equal(created.snapshot.character,"sasuke");
    assert.equal(created.snapshot.activeEntityId,"11000211");
    assert.equal(created.snapshot.coins,0);
    assert.equal(created.snapshot.level,1);
    assert.deepEqual(created.snapshot.inventory,{});
    assert.equal(Object.keys(created.snapshot.characterProgress).length,3);
    const repeated = (await db.query("select public.game_open($1,'naruto') as reply",[lease])).rows[0].reply;
    assert.deepEqual(repeated.snapshot,created.snapshot,"Existing progress is preserved");
    assert.equal((await db.query("select public.game_claim($1) as reply",[lease])).rows[0].reply.snapshot.character,"sasuke");
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.game_open($1,'naruto')",[lease]), /permission denied/);
  } finally { await db.close(); }
});
