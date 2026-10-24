import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("public character inspection projects only active character and valid equipped items", async (t) => {
  const db = new PGlite(),
    a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    for (const f of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)",
      [a, { username: "Viewer" }, b, { username: "Target" }],
    );
    const save = {
      version: 1,
      activeEntityId: "11000211",
      character: "sasuke",
      level: 5,
      upgrades: 2,
      coins: 99999,
      xp: 77,
      inventory: {
        "kunai-reforcada": 1,
        "colete-shinobi": 1,
        "scroll-shinobi-3": 1,
        "private-drop": 999,
      },
      equipment: {
        weapon: "kunai-reforcada",
        armor: "colete-shinobi",
        scroll: "scroll-shinobi-3",
        charm: "private-drop",
        headband: "kunai-reforcada",
        unknown: "secret",
      },
      characterProgress: {
        11000101: { level: 99, equipment: { weapon: "private-other" } },
      },
      secret: "private-metadata",
    };
    await db.query(
      "insert into public.game_saves(user_id,snapshot) values($1,$2)",
      [b, save],
    );
    async function as(id, role = "authenticated") {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role " + role);
    }
    async function inspect(id) {
      return (
        await db.query("select public.social_inspect_player($1) as result", [
          id,
        ])
      ).rows[0].result;
    }
    await as(a);
    await t.test(
      "projection shows target active character, level and valid slots",
      async () => {
        const data = await inspect(b);
        assert.equal(data.profile.display_name, "Target");
        assert.deepEqual(data.character, {
          id: "11000211",
          level: 5,
          upgrades: 2,
          equipment: { weapon: "kunai-reforcada", armor: "colete-shinobi" },
        });
        assert.deepEqual(Object.keys(data).sort(), ["character", "profile"]);
        const encoded = JSON.stringify(data);
        for (const hidden of [
          "private-drop",
          "private-other",
          "private-metadata",
          "coins",
          "inventory",
          "characterProgress",
        ])
          assert.equal(encoded.includes(hidden), false);
        assert.equal(
          (await db.query("select * from public.game_saves")).rows.length,
          0,
          "Direct cross-account save read remains forbidden",
        );
      },
    );
    await t.test(
      "missing saves have a profile without fabricated character progress",
      async () => {
        const data = await inspect(a);
        assert.equal(data.character, null);
        assert.equal((await inspect(null)).profile.user_id, a);
      },
    );
    await t.test(
      "legacy active identity and malformed equipment remain safe",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update public.game_saves set snapshot=$1 where user_id=$2",
          [
            {
              version: 1,
              character: "sakura",
              level: 1.2,
              coins: 0,
              upgrades: 999999999,
              equipment: [],
              inventory: {},
            },
            b,
          ],
        );
        await as(a);
        assert.deepEqual((await inspect(b)).character, {
          id: "11000301",
          level: 1,
          upgrades: 0,
          equipment: {},
        });
        await db.exec("reset role");
        await db.query(
          "update public.game_saves set snapshot=$1 where user_id=$2",
          [
            {
              version: 1,
              character: "naruto",
              activeEntityId: "https://evil",
              level: 1,
              coins: 0,
              inventory: {},
            },
            b,
          ],
        );
        await as(a);
        assert.equal((await inspect(b)).character, null);
      },
    );
    await t.test("anonymous callers cannot inspect players", async () => {
      await as("", "anon");
      await assert.rejects(inspect(b), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
