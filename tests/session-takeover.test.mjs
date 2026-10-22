import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("takeover preserves committed progress, immediately fences former owner and isolates accounts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of [
      "202610210001_cloud_progress",
      "202610210002_player_accounts",
      "202610210003_cloud_only_progress",
      "202610220001_session_takeover",
    ])
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222";
    const old = "33333333-3333-4333-8333-333333333333",
      next = "44444444-4444-4444-8444-444444444444";
    const receipt = "55555555-5555-4555-8555-555555555555";
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values ($1,$3),($2,$4)",
      [a, b, { username: "player_a" }, { username: "player_b" }],
    );
    async function user(id) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    async function open(lease, character = null) {
      return (
        await db.query("select public.game_takeover($1,$2) as reply", [
          lease,
          character,
        ])
      ).rows[0].reply;
    }
    await user(a);
    const first = await open(old, "sasuke");
    await db.query("select public.game_commit($1,$2,$3,$4)", [
      old,
      first.revision,
      receipt,
      { ...first.snapshot, coins: 42 },
    ]);
    const taken = await open(next, "naruto");
    assert.equal(taken.snapshot.coins, 42);
    assert.equal(taken.snapshot.character, "sasuke");
    assert.equal(taken.revision, first.revision + 1);
    await assert.rejects(
      db.query("select public.game_heartbeat($1)", [old]),
      /SESSION_LOST/,
    );
    await assert.rejects(
      db.query("select public.game_commit($1,$2,$3,$4)", [
        old,
        taken.revision,
        old,
        { ...taken.snapshot, coins: 999 },
      ]),
      /SESSION_LOST/,
    );
    await db.query("select public.game_release($1)", [old]);
    await db.query("select public.game_heartbeat($1)", [next]);
    await assert.rejects(open(old, "invalid"), /INVALID_CHARACTER/);
    await db.query("select public.game_heartbeat($1)", [next]); // Failure rolled back takeover.
    await user(b);
    await assert.rejects(open(old), /SAVE_MISSING/);
    await open(old, "sakura");
    await user(a);
    await db.query("select public.game_heartbeat($1)", [next]);
    const back = await open(old);
    assert.equal(back.snapshot.coins, 42);
    await assert.rejects(
      db.query("select public.game_heartbeat($1)", [next]),
      /SESSION_LOST/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(open(next), /permission denied/);
  } finally {
    await db.close();
  }
});
