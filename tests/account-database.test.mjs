import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("account profiles enforce unique canonical usernames, own-account access and the journey gate", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    for (const migration of ["20261021205949_cloud_progress", "20261021211745_player_accounts", "20261021215614_cloud_only_progress"])
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
    const lease = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [a, {username:"Player_One"}]);
    await db.query("insert into auth.users(id) values ($1)", [b]);
    assert.equal((await db.query("select username from public.player_profiles where user_id=$1", [a])).rows[0].username, "player_one");
    async function asUser(id, role = "authenticated") {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec(`set role ${role}`);
    }
    await asUser(b);
    await assert.rejects(db.query("select public.game_claim($1)", [lease]), /PROFILE_REQUIRED/);
    assert.deepEqual((await db.query("select * from public.player_profiles")).rows, []);
    await assert.rejects(db.query("select public.game_set_username($1)", ["PLAYER_ONE"]), /USERNAME_TAKEN/);
    for (const value of ["ab", "1ninja", "bad name", "ábc", "x".repeat(21), null])
      await assert.rejects(db.query("select public.game_set_username($1)", [value]), /USERNAME_INVALID/);
    assert.equal((await db.query("select public.game_set_username(' Player_Two ') as name")).rows[0].name, "player_two");
    assert.equal((await db.query("select public.game_set_username('different') as name")).rows[0].name, "player_two", "Username remains stable");
    await assert.rejects(db.query("select public.game_claim($1)", [lease]), /SAVE_MISSING/, "Profile gate now passed");
    for (const sql of ["update public.player_profiles set username='changed'", "delete from public.player_profiles", `insert into public.player_profiles values ('${a}', 'fake', now())`])
      await assert.rejects(db.exec(sql), /permission denied/);
    await asUser("", "anon");
    await assert.rejects(db.exec("select * from public.player_profiles"), /permission denied/);
    await assert.rejects(db.exec("select public.game_set_username('guest')"), /permission denied/);
    assert.equal((await db.query("select public.game_username_available('PLAYER_ONE') as available")).rows[0].available, false);
    assert.equal((await db.query("select public.game_username_available('new_ninja') as available")).rows[0].available, true);
    await db.exec("reset role");
    await assert.rejects(db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [lease, { username: "PLAYER_ONE" }]), /unique/);
    assert.equal((await db.query("select * from auth.users where id=$1", [lease])).rows.length, 0, "Duplicate registration is atomic");
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [{username:"hacked"}, a]);
    assert.equal((await db.query("select username from public.player_profiles where user_id=$1", [a])).rows[0].username, "player_one");
    await db.query("delete from auth.users where id=$1", [a]);
    assert.equal((await db.query("select * from public.player_profiles where user_id=$1", [a])).rows.length, 0);
  } finally { await db.close(); }
});
