// Local integration fixture ONLY. Fake Auth + real migration in embedded Postgres.
// Never deploy this server; it accepts a documented test password, not real JWTs.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fresh } from "../src/model.ts";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
await db.exec(
  await readFile("supabase/migrations/202610210001_cloud_progress.sql", "utf8"),
);
await db.exec(await readFile("supabase/migrations/202610210002_player_accounts.sql", "utf8"));
const id = "11111111-1111-4111-8111-111111111111";
await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [id, {username:"fixture_ninja"}]);
const initial = fresh("sasuke");
initial.coins = 500;
await db.query(
  "insert into public.game_saves(user_id,snapshot) values ($1,$2)",
  [id, initial],
);
const user = {
  id,
  email: "cloud-test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {username:"fixture_ninja"},
};
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url"),
  "fixture",
].join(".");
let tail = Promise.resolve();
const server = createServer((req, res) => {
  tail = tail
    .then(async () => {
      res.setHeader("Access-Control-Allow-Origin", "http://localhost:5194");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Content-Type", "application/json");
      const send = (code, data) => {
        res.statusCode = code;
        res.end(JSON.stringify(data));
      };
      if (req.method === "OPTIONS") return send(200, {});
      const url = new URL(req.url, "http://127.0.0.1:5195");
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || "{}");
      if (url.pathname === "/auth/v1/token") {
        if (
          body.grant_type !== "refresh_token" &&
          url.searchParams.get("grant_type") !== "refresh_token" &&
          (body.email !== user.email || body.password !== "local-test-only")
        )
          return send(400, { msg: "Invalid login credentials" });
        return send(200, {
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      }
      if (url.pathname === "/auth/v1/user") return send(200, user);
      if (url.pathname === "/auth/v1/logout") return send(200, {});
      if (url.pathname === "/diagnostics") {
        await db.exec("reset role");
        return send(
          200,
          (
            await db.query(
              "select revision,snapshot,lease_id,lease_until from public.game_saves",
            )
          ).rows,
        );
      }
      if (req.headers.authorization !== `Bearer ${token}`)
        return send(401, { message: "AUTH_REQUIRED" });
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
      if (url.pathname === "/rest/v1/game_saves")
        return send(
          200,
          (await db.query("select revision,updated_at from public.game_saves"))
            .rows,
        );
      if (url.pathname === "/rest/v1/player_profiles")
        return send(200, (await db.query("select username from public.player_profiles")).rows);
      const funcs = {
        game_claim: ["p_lease", "p_snapshot"],
        game_commit: ["p_lease", "p_revision", "p_request", "p_snapshot"],
        game_heartbeat: ["p_lease"],
        game_release: ["p_lease"],
        game_set_username: ["p_username"],
        game_username_available: ["p_username"],
      };
      const name = url.pathname.split("/").at(-1),
        fields = funcs[name];
      if (!fields) return send(404, {});
      try {
        const casts = {
          p_lease: "uuid",
          p_revision: "bigint",
          p_request: "uuid",
          p_snapshot: "jsonb",
          p_username: "text",
        };
        const args = fields.map((f) => body[f] ?? null),
          params = fields.map((f, i) => `$${i + 1}::${casts[f]}`).join(",");
        return send(
          200,
          (await db.query(`select public.${name}(${params}) as result`, args))
            .rows[0].result,
        );
      } catch (error) {
        return send(400, { message: error.message, code: "P0001" });
      }
    })
    .catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end("{}");
    });
});
server.listen(5195, "127.0.0.1", () =>
  console.log(
    "Local cloud fixture ready on 5195. Test account: cloud-test@example.invalid / local-test-only.",
  ),
);
const stop = () =>
  server.close(() => void db.close().then(() => process.exit()));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
