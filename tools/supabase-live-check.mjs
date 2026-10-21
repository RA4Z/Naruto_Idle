// Opt-in integration check against the real project. Creates only two disposable
// Auth users, sends no emails, and deletes both users and their saves in finally.
// Run with Node's TypeScript loader, like tools/cloud-fixture.mjs.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { freeProject, management } from "./supabase-management.mjs";
import { fresh } from "../src/model.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
import { CloudSync } from "../src/cloud/sync.ts";

if (!process.argv.includes("--create-test-users"))
  throw new Error("Requires --create-test-users: creates and removes two temporary accounts.");
const ref = await freeProject();
assert.equal(ref, "gxyxlfytcjvvkmrlalrs", "Unexpected integration-test project");
const url = `https://${ref}.supabase.co`;
assert.equal(process.env.VITE_SUPABASE_URL, url);
const keys = await management(`projects/${ref}/api-keys?reveal=true`);
const migrations = await management(`projects/${ref}/database/migrations`);
const authConfig = await management(`projects/${ref}/config/auth`);
const privateKey = keys.find((k) => k.name === "service_role")?.api_key;
assert.ok(privateKey, "Administrative test key unavailable");
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const admin = createClient(url, privateKey, options);
const client = () => createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const users = [], clients = [];
const report = {
  date: new Date().toISOString(), projectRef: ref, environment: "live Supabase Auth + PostgREST + PostgreSQL",
  plan: "free", migrations: migrations.map((m) => ({ version: m.version, name: m.name })),
  auth: { confirmationEnabled: authConfig.mailer_autoconfirm === false,
    smtpConfigured: !!authConfig.smtp_host, siteUrl: authConfig.site_url },
  results: {}, cleanup: false,
  limits: ["Temporary users are confirmed through Admin API; no signup/confirmation/recovery emails tested.",
    "Independent SDK sessions, not two physical devices or rendered browser gameplay.",
    "Lease expiry covered locally, not by waiting 120 seconds in this live check.",
    "No frontend deploy performed; PvE snapshots remain client_unverified."],
};
let stage = "create temporary users";
function ok(reply) {
  assert.ok(!reply.error, `Supabase operation failed at ${stage}: ${reply.error?.code || reply.error?.status || "unknown"}`);
  return reply.data;
}
function gateway(c) {
  const call = async (name, args) => {
    const reply = await c.rpc(name, args);
    if (reply.error) throw new Error(reply.error.message);
    return reply.data;
  };
  return {
    claim: (lease, snapshot) => call("game_claim", { p_lease: lease, p_snapshot: snapshot ?? null }),
    commit: (lease, revision, request, snapshot) => call("game_commit", {
      p_lease: lease, p_revision: revision, p_request: request, p_snapshot: snapshot,
    }),
    heartbeat: (lease) => call("game_heartbeat", { p_lease: lease }),
    release: (lease) => call("game_release", { p_lease: lease }),
  };
}
try {
  const credentials = [];
  for (let i = 0; i < 2; i++) {
    const email = `naruto-live-${randomUUID()}@example.invalid`;
    const password = randomBytes(32).toString("base64url");
    const data = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { purpose: "disposable-supabase-integration-check" } }));
    users.push(data.user.id);
    credentials.push({ email, password });
  }
  stage = "password login";
  const a = client(), b = client(), second = client(), guest = client();
  clients.push(a, b, second, guest);
  ok(await a.auth.signInWithPassword(credentials[0]));
  ok(await b.auth.signInWithPassword(credentials[1]));
  ok(await second.auth.signInWithPassword(credentials[0]));
  report.results.passwordLoginTwoAccounts = true;
  stage = "create cloud save";
  const initial = cloudSnapshot({ ...fresh("sasuke"), coins: 37, inventory: { "kunai-treino": 1 } });
  const sync = new CloudSync(gateway(a));
  const opened = await sync.open(initial);
  assert.equal(opened.snapshot.coins, 37);
  assert.deepEqual(opened.snapshot.characterProgress, initial.characterProgress);
  const lease = randomUUID();
  stage = "exclusive session";
  await assert.rejects(gateway(second).claim(lease), /SESSION_BUSY/);
  report.results.secondSessionBlocked = true;
  stage = "row isolation";
  assert.deepEqual(ok(await b.from("game_saves").select("revision").eq("user_id", users[0])), []);
  assert.ok((await guest.from("game_saves").select("revision").eq("user_id", users[0])).error);
  assert.ok((await guest.rpc("game_claim", { p_lease: lease })).error);
  const owned = ok(await a.from("game_saves").select("provenance,revision").eq("user_id", users[0]).single());
  assert.equal(owned.provenance, "client_unverified");
  for (const attempt of [
    () => a.from("game_saves").update({ revision: 999 }).eq("user_id", users[0]),
    () => a.from("game_saves").delete().eq("user_id", users[0]),
    () => b.from("game_saves").insert({ user_id: users[1], snapshot: initial }),
  ]) assert.ok((await attempt()).error, "Direct write must be denied");
  report.results.rlsAndDirectWrites = true;
  stage = "cloud synchronization";
  const next = { ...opened.snapshot, coins: 62 };
  sync.queue(next);
  await sync.flush();
  await sync.flush(); // Heartbeat path.
  await sync.close();
  const replacement = await gateway(second).claim(lease, { ...initial, coins: 999 });
  assert.equal(replacement.snapshot.coins, 62, "Import must not replace a remote save");
  assert.deepEqual(cloudSnapshot(replacement.snapshot).characterProgress, initial.characterProgress);
  report.results.syncHeartbeatReleaseResumeAndCreateOnlyImport = true;
  stage = "idempotent commit";
  const request = randomUUID();
  const payload = { ...replacement.snapshot, coins: 81 };
  const g = gateway(second);
  const receipt = await g.commit(lease, replacement.revision, request, payload);
  const retry = await g.commit(lease, replacement.revision, request, payload);
  assert.equal(retry.revision, receipt.revision);
  await assert.rejects(g.commit(lease, replacement.revision, request, { ...payload, coins: 82 }), /REQUEST_MISMATCH/);
  await assert.rejects(g.commit(lease, replacement.revision, randomUUID(), payload), /REVISION_CONFLICT/);
  await assert.rejects(g.commit(randomUUID(), receipt.revision, randomUUID(), payload), /SESSION_LOST/);
  await g.release(lease);
  report.results.idempotencyAndStaleWriterProtection = true;
  stage = "second account save";
  const bg = gateway(b), blease = randomUUID();
  const bs = await bg.claim(blease, fresh("sakura"));
  assert.equal(bs.snapshot.character, "sakura");
  assert.deepEqual(ok(await a.from("game_saves").select("revision").eq("user_id", users[1])), []);
  await bg.release(blease);
  report.results.independentAccountProgress = true;
} catch {
  report.failedStage = stage;
  process.exitCode = 1;
} finally {
  let clean = true;
  for (const c of clients) await c.auth.signOut({ scope: "local" }).catch(() => {});
  for (const id of users) {
    try {
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error) clean = false;
      else {
        const check = await admin.from("game_saves").select("user_id").eq("user_id", id);
        if (check.error || check.data.length) clean = false;
      }
    } catch { clean = false; }
  }
  report.cleanup = clean;
  if (!clean) process.exitCode = 1;
  await writeFile("reports/supabase-live-validation.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
