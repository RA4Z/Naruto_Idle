/** Isolated browser regression. Start Vite with the two fictitious cloud values below.
 * No real account, saved progress or remote database is used.
 * VITE_SUPABASE_URL=https://loading-test.invalid
 * VITE_SUPABASE_PUBLISHABLE_KEY=test-publishable-key-not-a-credential
 * node --import tsx tools/qa/check-startup.mts http://127.0.0.1:8246
 */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fresh } from "../../src/model.ts";
const base = process.argv[2] || "http://127.0.0.1:8246";
assert.equal(new URL(base).hostname, "127.0.0.1");
const uid = "11111111-1111-4111-8111-111111111111";
const user = { id: uid, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: new Date().toISOString() };
function session(expired: boolean) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -300 : 3600);
  const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: uid, aud: "authenticated", exp, iat: exp - 3600, role: "authenticated" })).toString("base64url") + ".fixture-signature";
  return { access_token: token, refresh_token: "fixture-refresh-only", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const measurements: any[] = [];
try {
  for (const blocking of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(value => localStorage.setItem("sb-loading-test-auth-token", JSON.stringify(value)), session(true));
    const page = await context.newPage();
    let refreshDone = false;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname === "loading-test.invalid") {
        let body: any = {};
        if (url.pathname.endsWith("/token")) { await new Promise(resolve => setTimeout(resolve, 4000)); refreshDone = true; body = session(false); }
        else if (url.pathname.endsWith("player_profiles")) body = { username: "loading_fixture" };
        else if (url.pathname.endsWith("game_saves")) body = { revision: 1 };
        else if (url.pathname.endsWith("/user")) body = user;
        else throw new Error("Unexpected cloud endpoint: " + url.pathname);
        await route.fulfill({ json: body });
      } else if (url.hostname === "127.0.0.1") {
        if (blocking && url.pathname === "/src/cloud/ui.ts") {
          const response = await route.fetch();
          const source = (await response.text()).replace("void refresh().catch((error) => feedback(cloudError(error)));\n}", "await refresh().catch((error) => feedback(cloudError(error)));\n}");
          assert.notEqual(source, await response.text(), "blocking baseline patch must apply");
          await route.fulfill({ response, body: source });
        } else await route.continue();
      } else await route.abort();
    });
    const started = performance.now();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("game-loading")?.hidden && !document.getElementById("app")?.inert);
    const interactiveMs = Math.round(performance.now() - started);
    measurements.push({ scenario: blocking ? "previous-blocking-restoration" : "nonblocking-restoration", injectedTokenRefreshMs: 4000, interactiveMs, tokenRefreshCompletedWhenInteractive: refreshDone });
    if (!blocking) {
      assert.equal(refreshDone, false, "form must work before the remote refresh finishes");
      await page.locator("#auth-email").fill("typed@example.invalid");
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(value => localStorage.setItem("sb-loading-test-auth-token", JSON.stringify(value)), session(false));
  const page = await context.newPage();
  const errors: string[] = [], requests: string[] = [], cloudCalls: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let failMap = false, failedMapRequests = 0;
  const snapshot = fresh("naruto"); snapshot.sound = false;
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "loading-test.invalid") {
      cloudCalls.push(url.pathname);
      let body: any;
      if (url.pathname.endsWith("/user")) body = user;
      else if (url.pathname.endsWith("player_profiles")) body = { username: "loading_fixture" };
      else if (url.pathname.endsWith("game_saves")) body = { revision: 1 };
      else if (url.pathname.includes("/rpc/")) {
        const args = route.request().postDataJSON();
        body = { revision: (args?.p_revision || 0) + 1, serverNow: Date.now(), leaseUntil: Date.now() + 120000, ...(url.pathname.endsWith("game_takeover") ? { snapshot } : {}) };
      } else throw new Error("Unexpected fixture endpoint: " + url.pathname);
      await route.fulfill({ json: body });
    } else if (url.hostname === "127.0.0.1") {
      requests.push(url.pathname);
      if (failMap && url.pathname === "/assets/maps/10001/background.webp") {
        failedMapRequests++; await route.fulfill({ status: 404, body: "Fixture missing required asset" });
      } else await route.continue();
    }
    else await route.abort();
  });
  await page.goto(base);
  await page.locator('[data-action="play"]').waitFor();
  const beforePlay = requests.filter(p => p.startsWith("/assets/") && !p.includes("loading/") && !p.includes("world.webp"));
  assert.equal(beforePlay.length, 0, "warming game code must not fetch maps, catalogs or animation atlases");
  const started = performance.now();
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => document.getElementById("game-loading")?.hidden && !document.getElementById("play")?.hidden && !!document.querySelector("#canvas canvas"), null, { timeout: 45000 });
  assert.deepEqual(errors, []);
  assert.equal(cloudCalls.filter(p => p.endsWith("/user")).length, 1, "entry must validate the account once, not twice");
  await page.screenshot({ path: process.env.STARTUP_SCREENSHOT || "reports/startup-browser.png" });
  measurements.push({ scenario: "real-game-assets-mocked-account", readyMs: Math.round(performance.now() - started), startupAssetRequests: requests.filter(p => p.startsWith("/assets/")).length, userValidations: 1, realAccountChanged: false, pageErrors: errors });
  await page.locator("#maps").click();
  const travelStarted = performance.now();
  await page.locator('[data-map="10005"]').click();
  await page.waitForFunction(() => document.getElementById("game-loading")?.hidden && document.getElementById("world-name")?.textContent?.includes("Floresta"));
  measurements.push({ scenario: "travel-to-forest", readyMs: Math.round(performance.now() - travelStarted), pageErrors: [...errors] });
  assert.deepEqual(errors, []);
  await page.locator("#back").click();
  await page.locator('[data-action="play"]').waitFor();
  failMap = true;
  const failureStarted = performance.now();
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => document.getElementById("game-loading")?.getAttribute("aria-busy") === "false" && !document.getElementById("loading-retry")?.hidden);
  const failureMs = Math.round(performance.now() - failureStarted);
  assert.equal(failedMapRequests, 1, "missing required resources must not silently retry");
  assert.ok(failureMs < 5000, "a known 404 must expose retry immediately");
  measurements.push({ scenario: "missing-required-asset", failureMs, failedMapRequests, retryVisible: true, realAccountChanged: false });
  failMap = false;
  await page.locator("#loading-retry").click();
  await page.waitForFunction(() => document.getElementById("game-loading")?.hidden && !document.getElementById("play")?.hidden && !!document.querySelector("#canvas canvas"));
  measurements.push({ scenario: "retry-after-required-asset-failure", restored: true, realAccountChanged: false });
  await context.close();
  const report = { date: new Date().toISOString(), environment: "Local Vite and isolated Edge; fictitious Supabase, real map/character assets; timings exclude real production latency", measurements };
  await writeFile("reports/startup-performance.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
