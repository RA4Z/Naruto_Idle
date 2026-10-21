import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("cloud SQL enforces RLS, create-only import, exclusive lease, receipt retries and expired writer fencing", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(
      await readFile(
        "supabase/migrations/202610210001_cloud_progress.sql",
        "utf8",
      ),
    );
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222";
    const lease = "33333333-3333-4333-8333-333333333333",
      otherLease = "44444444-4444-4444-8444-444444444444";
    const request = "55555555-5555-4555-8555-555555555555";
    await db.query("insert into auth.users values ($1),($2)", [a, b]);
    async function asUser(id) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    async function call(name, args, casts) {
      const placeholders = args
        .map((_, i) => `$${i + 1}::${casts[i]}`)
        .join(",");
      return (
        await db.query(`select public.${name}(${placeholders}) as result`, args)
      ).rows[0].result;
    }
    await asUser(a);
    const snapshot = {
      version: 1,
      character: "sasuke",
      level: 1,
      coins: 10,
      inventory: {},
      lastSaved: 0,
    };
    let claimed = await call(
      "game_claim",
      [lease, snapshot],
      ["uuid", "jsonb"],
    );
    assert.equal(claimed.revision, 1);
    assert.ok(claimed.snapshot.lastSaved > 0);
    assert.equal(claimed.snapshot.coins, 10);
    await assert.rejects(
      db.exec("update public.game_saves set snapshot = '{}'"),
      /permission denied/i,
    );
    await assert.rejects(
      call("game_claim", [otherLease, snapshot], ["uuid", "jsonb"]),
      /SESSION_BUSY/,
    );
    claimed = await call(
      "game_claim",
      [lease, { ...snapshot, coins: 999 }],
      ["uuid", "jsonb"],
    );
    assert.equal(
      claimed.snapshot.coins,
      10,
      "import cannot replace a cloud save",
    );
    const args = [lease, 1, request, { ...snapshot, coins: 20 }];
    const committed = await call("game_commit", args, [
      "uuid",
      "bigint",
      "uuid",
      "jsonb",
    ]);
    assert.equal(committed.revision, 2);
    const retry = await call("game_commit", args, [
      "uuid",
      "bigint",
      "uuid",
      "jsonb",
    ]);
    assert.equal(retry.revision, 2);
    await assert.rejects(
      call(
        "game_commit",
        [lease, 1, otherLease, snapshot],
        ["uuid", "bigint", "uuid", "jsonb"],
      ),
      /REVISION_CONFLICT/,
    );
    await assert.rejects(
      call(
        "game_commit",
        [lease, 1, request, snapshot],
        ["uuid", "bigint", "uuid", "jsonb"],
      ),
      /REQUEST_MISMATCH/,
    );
    await asUser(b);
    assert.equal(
      (await db.query("select * from public.game_saves")).rows.length,
      0,
    );
    await assert.rejects(
      call("game_claim", [otherLease, null], ["uuid", "jsonb"]),
      /SAVE_MISSING/,
    );
    await call("game_release", [lease], ["uuid"]); // Cannot release another account.
    await asUser(a);
    await assert.rejects(
      call("game_claim", [otherLease, null], ["uuid", "jsonb"]),
      /SESSION_BUSY/,
    );
    await db.exec(
      "reset role; update public.game_saves set lease_until = now()-interval '1 second'",
    );
    await asUser(a);
    await assert.rejects(
      call("game_heartbeat", [lease], ["uuid"]),
      /SESSION_LOST/,
    );
    await assert.rejects(
      call("game_commit", args, ["uuid", "bigint", "uuid", "jsonb"]),
      /SESSION_LOST/,
    );
    await call("game_claim", [otherLease, null], ["uuid", "jsonb"]);
    await assert.rejects(
      call(
        "game_commit",
        [lease, 2, lease, snapshot],
        ["uuid", "bigint", "uuid", "jsonb"],
      ),
      /SESSION_LOST/,
    );
    await call("game_release", [otherLease], ["uuid"]);
    await asUser(b);
    await assert.rejects(
      call("game_claim", [lease, { version: 1 }], ["uuid", "jsonb"]),
      /snapshot_shape/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select * from public.game_saves"),
      /permission denied/,
    );
    await assert.rejects(
      call("game_claim", [lease, snapshot], ["uuid", "jsonb"]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
