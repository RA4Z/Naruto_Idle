// Local-only end-to-end check. Fake Supabase endpoints, real SDK, backend WebSockets,
// Phaser rendering and two isolated browser accounts. Never deploy this fixture.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { fresh } from "../src/model.ts";
import { NativeNavigation } from "../src/world/navigation.ts";
import { withSceneGeometry } from "../src/world/scene-geometry.ts";
import { createGameServer } from "../../Naruto Idle Backend/dist/server.js";
import { supabaseAuthenticator } from "../../Naruto Idle Backend/dist/auth.js";

const base = "http://127.0.0.1:5196",
  authBase = "http://127.0.0.1:5197",
  wsBase = "ws://127.0.0.1:5198/ws";
const grid = withSceneGeometry(
  "10001",
  JSON.parse(
    await readFile("public/assets/maps/10001/navigation.json", "utf8"),
  ),
);
const nav = new NativeNavigation(grid),
  spawnPoint = nav.nearest({ x: 385, y: 260 });
assert.ok(spawnPoint);
const users = ["naruto", "sasuke"].map((character, i) => {
  const id = `11111111-1111-4111-8111-11111111111${i}`;
  const username = "village_" + character;
  const displayName = i === 0 ? "Village_Naruto" : "Village_Sasuke";
  const user = {
    id,
    email: character + "@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
    is_anonymous: false,
    app_metadata: { provider: "email" },
    user_metadata: { username },
  };
  const token =
    "header." +
    Buffer.from(
      JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url") +
    ".fixture";
  const snapshot = fresh(character);
  snapshot.level = 5;
  snapshot.upgrades = 2;
  snapshot.inventory = { "kunai-reforcada": 1, "colete-shinobi": 1 };
  snapshot.equipment = { weapon: "kunai-reforcada", armor: "colete-shinobi" };
  snapshot.location = "10001";
  snapshot.paused = false;
  snapshot.sound = false;
  snapshot.music = false;
  snapshot.worldPosition = { mapId: "10001", ...spawnPoint };
  return {
    user,
    username,
    displayName,
    token,
    snapshot,
    revision: 1,
    lease: null,
  };
});
const errors = [],
  results = {};
let game, browser, vite;
let debugPages = [];
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
for (const a of users) {
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [a.user.id, { username: a.displayName }],
  );
  await db.query(
    "insert into public.game_saves(user_id,snapshot) values($1,$2)",
    [a.user.id, a.snapshot],
  );
}
let tail = Promise.resolve();
const auth = createServer((req, res) => {
  tail = tail.then(async () => {
    res.setHeader("Access-Control-Allow-Origin", base);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    const reply = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "OPTIONS") return reply(200, {});
      const url = new URL(req.url, authBase);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || "{}");
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      let account = users.find((a) => a.token === bearer);
      if (url.pathname === "/auth/v1/token") {
        account = users.find((a) => a.user.email === body.email);
        if (!account || body.password !== "local-test-only")
          return reply(400, { msg: "Invalid login credentials" });
        return reply(200, {
          access_token: account.token,
          refresh_token: "fixture-" + account.username,
          expires_in: 3600,
          token_type: "bearer",
          user: account.user,
        });
      }
      if (!account) return reply(401, { message: "Invalid token" });
      if (url.pathname === "/auth/v1/user") return reply(200, account.user);
      if (url.pathname === "/auth/v1/logout") return reply(200, {});
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        account.user.id,
      ]);
      await db.exec("set role authenticated");
      if (url.pathname === "/rest/v1/player_profiles")
        return reply(
          200,
          (
            await db.query(
              "select user_id,username,display_name from public.player_profiles where user_id=$1",
              [account.user.id],
            )
          ).rows,
        );
      if (url.pathname === "/rest/v1/game_saves")
        return reply(
          200,
          (
            await db.query(
              "select user_id,snapshot,revision from public.game_saves where user_id=$1",
              [account.user.id],
            )
          ).rows,
        );
      const rpc = url.pathname.split("/").pop();
      if (
        ![
          "game_takeover",
          "game_open",
          "game_commit",
          "game_release",
          "game_heartbeat",
          "social_profile",
          "social_list",
          "social_search",
          "social_update_profile",
          "social_friend_action",
          "social_inspect_player",
        ].includes(rpc)
      )
        return reply(404, { message: "Not found" });
      const args = Object.entries(body);
      if (args.some(([k]) => !/^p_[a-z_]+$/.test(k)))
        return reply(400, { message: "Invalid argument" });
      try {
        const q =
          "select public." +
          rpc +
          "(" +
          args.map(([k], i) => k + "=>$" + (i + 1)).join(",") +
          ") as result";
        const r = await db.query(
          q,
          args.map(([, v]) => v),
        );
        return reply(200, r.rows[0]?.result ?? null);
      } catch (error) {
        return reply(400, { message: error.message });
      }
    } catch (error) {
      reply(500, { message: "Local fixture failure" });
    }
  });
});
async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}
async function untilReady(url) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Local server did not start");
}
try {
  await listen(auth, 5197);
  const config = {
    port: 5198,
    host: "127.0.0.1",
    supabaseUrl: authBase,
    publishableKey: "fixture-public",
    origins: new Set([base]),
    maps: new Set(["10001"]),
    maxConnections: 10,
    maxRoomPlayers: 20,
  };
  game = createGameServer(config, supabaseAuthenticator(config));
  await listen(game.http, 5198);
  vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5196",
      "--strictPort",
      "--configLoader",
      "runner",
    ],
    {
      env: {
        ...process.env,
        VITE_SUPABASE_URL: authBase,
        VITE_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
        VITE_MULTIPLAYER_URL: wsBase,
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  vite.stderr.on("data", () => {});
  await untilReady(base);
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: [
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        locale: "pt-BR",
        viewport: { width: 1280, height: 900 },
      }),
    ),
  );
  for (const c of [contexts[0]])
    await c.addInitScript(() =>
      Object.defineProperty(window, "documentPictureInPicture", {
        value: undefined,
      }),
    );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  debugPages = pages;
  for (const p of pages)
    p.on("websocket", (socket) =>
      socket.on("framereceived", (frame) => {
        try {
          const m = JSON.parse(String(frame.payload));
          if (m.type === "error") console.log("WS error " + m.code);
        } catch {}
      }),
    );
  for (const page of pages) page.on("pageerror", (e) => errors.push(e.message));
  async function login(page, i) {
    await page.goto(base);
    await page
      .locator("#account-access [name=email]")
      .fill(users[i].user.email);
    await page
      .locator("#account-access [name=password]")
      .fill("local-test-only");
    await page.locator("#account-access button[type=submit]").click();
    await page.locator("[data-action=play]").click();
    await page.waitForFunction(
      () =>
        window.__idle?.snapshot()?.multiplayer?.status === "online" &&
        document.getElementById("game-loading").hidden,
      {},
      { timeout: 90000 },
    );
  }
  console.log("Login first player");
  await login(pages[0], 0);
  console.log("First player online");
  await login(pages[1], 1);
  console.log("Both players online");
  for (const page of pages)
    await page.waitForFunction(
      () => window.__idle.snapshot().multiplayer.players.some((p) => p.visible),
      {},
      { timeout: 90000 },
    );
  assert.equal(
    (await pages[0].evaluate(() => window.__idle.snapshot().npcs)).length,
    0,
  );
  assert.equal(
    (await pages[1].evaluate(() => window.__idle.snapshot().npcs)).length,
    0,
  );
  results.removedKakashiAndHinata = true;
  assert.equal(
    await pages[0].evaluate(
      () => window.__idle.snapshot().multiplayer.players[0].displayName,
    ),
    "Village_Sasuke",
  );
  results.originalCapitalizationInVillage = true;

  const a = pages[0],
    b = pages[1];
  await a.waitForFunction(() =>
    document.querySelector(".minimap-online")?.textContent.includes("2 online"),
  );
  assert.equal(await a.locator("#play aside,#hud-legacy").count(), 0);
  assert.equal(
    await a.locator(".world-minimap").evaluate((e) => e.tagName),
    "DIV",
  );
  assert.equal(
    await a.locator(".world-minimap summary,.world-minimap details").count(),
    0,
  );
  const location = await a.locator(".minimap-location").textContent();
  assert.equal(location, "Vila da Folha");
  async function layout(page, width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      const mm = document.querySelector(".world-minimap"),
        canvas = document.querySelector("#canvas>canvas");
      return {
        canvas: box(canvas),
        minimap: box(mm),
        round: getComputedStyle(mm).borderRadius,
        name: box(document.querySelector(".minimap-location")),
        online: box(document.querySelector(".minimap-online")),
        north: box(mm.querySelector("text")),
        buttons: [...document.querySelectorAll(".hud-shortcut")].map(box),
        hero: box(document.querySelector(".hud-hero")),
        screen: { w: innerWidth, h: innerHeight },
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.ok(
      Math.abs(d.canvas.w - width) < 2 && Math.abs(d.canvas.h - height) < 2,
    );
    assert.equal(d.round, "50%");
    assert.equal(d.minimap.w, d.minimap.h);
    assert.ok(d.name.y >= d.minimap.y && d.name.bottom < d.minimap.bottom);
    assert.ok(
      d.online.y > d.minimap.y && d.online.bottom <= d.minimap.bottom + 1,
    );
    assert.ok(d.scroll <= width);
    for (const r of d.buttons)
      assert.ok(r.x >= 0 && r.right <= width && r.y >= 0 && r.bottom <= height);
    for (let i = 1; i < d.buttons.length; i++)
      assert.ok(d.buttons[i].x >= d.buttons[i - 1].right - 1);
    assert.ok(d.hero.right <= d.minimap.x || d.hero.y >= d.minimap.bottom);
    await page.screenshot({ path: "reports/hud-" + width + ".png" });
  }
  await layout(a, 1280, 900);
  await layout(a, 1024, 768);
  await layout(a, 390, 844);
  await layout(a, 320, 740);
  results.fullMapAndResponsiveHud = true;
  results.circularMinimapWithInternalLocationAndPresence = true;
  await a.setViewportSize({ width: 1280, height: 900 });
  const icons = await a.locator(".hud-shortcut img").evaluateAll((imgs) =>
    imgs.map((i) => ({
      source: i.getAttribute("src"),
      loaded: i.complete && i.naturalWidth > 0,
    })),
  );
  assert.equal(icons.length, 7);
  assert.ok(
    icons.every((i) => i.loaded && i.source.startsWith("/assets/hud/")),
  );
  results.extractedNativeIconsLoaded = true;
  await a.locator("#hud-shop").click();
  await a.locator(".progression-panel[open] .gear-layout.is-shop").waitFor();
  await a.screenshot({ path: "reports/hud-window.png" });
  await a.locator(".progression-panel [data-close]").click();
  await a.locator("#library").click();
  await a.locator(".progression-panel[open] .gear-character-grid").waitFor();
  await a.locator(".progression-panel [data-close]").click();
  await a.locator("#progression").click();
  await a.waitForFunction(() =>
    document
      .querySelector(".progression-panel [data-tab=quests]")
      ?.classList.contains("active"),
  );
  await a.locator(".progression-panel [data-close]").click();
  await a.locator("#social").click();
  await a.locator(".social-panel[open]").waitFor();
  await a.locator("[data-social-close]").click();
  await a.locator("#arena").click();
  await a.locator(".arena-panel[open]").waitFor();
  await a.locator(".arena-panel [data-close]").click();
  results.topShortcutsOpenTheirOwnScreens = true;
  await a.locator("#hud-hero").click();
  await a.locator("#hud-details[open] #account-progress").waitFor();
  await a.locator("#hud-details .hud-dialog-heading button").click();
  await a.locator("#hud-options").click();
  await a.locator("#hud-settings[open] [data-language]").waitFor();
  await a.locator("#sound").check();
  assert.equal(await a.locator("#sound").isChecked(), true);
  await a.locator("#sound").uncheck();
  await a.locator("#hud-settings .hud-dialog-heading button").click();
  await a.locator("#hud-options").click();
  await a
    .locator("#hud-settings .hud-utilities button")
    .filter({ hasText: "Acessibilidade" })
    .click();
  await a.locator(".preferences-panel[open]").waitFor();
  await a.locator(".preferences-panel button").last().click();
  assert.equal(await a.locator("#cloud-status").count(), 1);
  await a.evaluate(() =>
    window.dispatchEvent(new CustomEvent("cloud-state", { detail: "retry" })),
  );
  await a.locator(".hud-cloud-warning:not([hidden])").waitFor();
  await a.evaluate(() =>
    window.dispatchEvent(new CustomEvent("cloud-state", { detail: "saved" })),
  );
  await a.locator(".hud-cloud-warning").waitFor({ state: "hidden" });
  results.syncFailuresRemainVisibleWithoutPermanentStatusPanel = true;
  results.statsAudioLanguageAndAccessibilityRemainAccessible = true;
  await a.locator("#hud-options").click();
  await a.locator("#mini-window").click();
  await a.locator(".mini-help[open]").waitFor();
  await a.locator("[data-mini-internal]").click();
  await a
    .locator(".mini-window:not([hidden]) #canvas .world-minimap svg")
    .waitFor();
  assert.equal(await a.locator("#canvas .game-hud").count(), 1);
  const miniLayout = await a.locator("#canvas").evaluate((host) => {
    const m = host.querySelector(".world-minimap").getBoundingClientRect(),
      r = host.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      minimap: { x: m.x, y: m.y, right: m.right, bottom: m.bottom },
      buttons: [...host.querySelectorAll(".hud-shortcut")].map((b) => {
        const q = b.getBoundingClientRect();
        return { x: q.x, y: q.y, right: q.right, bottom: q.bottom };
      }),
    };
  });
  console.log("Floating HUD geometry", JSON.stringify(miniLayout));
  await a.screenshot({ path: "reports/hud-floating-window.png" });
  await a.locator("#social").click();
  await a.locator(".social-panel[open]").waitFor();
  await a.locator("[data-social-close]").click();
  assert.equal(await a.locator("#play>#canvas").count(), 1);
  assert.equal(
    await a.evaluate(() => window.__idle.snapshot().heroSpriteInstances),
    1,
  );
  results.floatingWindowMovesAndRestoresSameHudAndCanvas = true;
  await b.locator("#hud-options").click();
  await b.locator("#mini-window").click();
  await b.waitForFunction(
    () =>
      window.documentPictureInPicture?.window?.document.querySelector(
        "#canvas canvas",
      ),
    {},
    { timeout: 15000 },
  );
  await b.waitForTimeout(1100);
  const native = await b.evaluate(() => {
    const doc = window.documentPictureInPicture.window.document;
    return {
      hud: doc.querySelectorAll(".game-hud").length,
      map: doc.querySelectorAll(".world-minimap").length,
      feedback: [
        "travel-reason",
        "skill-reason",
        "hunt-status",
        "combat-targets",
      ].map((id) => doc.querySelectorAll("#" + id).length),
      name: doc.querySelector(".hud-name").textContent,
    };
  });
  assert.equal(native.hud, 1);
  assert.equal(native.map, 1);
  assert.equal(native.name, "Sasuke");
  assert.deepEqual(native.feedback, [1, 1, 1, 1]);
  await b.evaluate(() =>
    window.documentPictureInPicture.window.document
      .querySelector("#social")
      .click(),
  );
  await b.locator(".social-panel[open]").waitFor();
  await b.locator("[data-social-close]").click();
  assert.equal(await b.locator("#play>#canvas").count(), 1);
  results.nativeSeparateWindowKeepsControlsAndRestores = true;
  await layout(a, 1280, 900);
  await a.locator(".world-minimap svg").focus();
  await a.keyboard.press("Home");
  await a.keyboard.press("Enter");
  await a.waitForFunction(
    () =>
      document.querySelector(".world-minimap .sr-only")?.textContent.length > 0,
  );
  results.minimapKeyboardNavigationPreserved = true;
  await a.locator("#maps").click();
  await a.locator("[data-map='10006']").click();
  await a.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      document.querySelectorAll("dialog[open]").length === 0,
    {},
    { timeout: 90000 },
  );
  await a.waitForFunction(() =>
    document
      .querySelector(".minimap-online")
      ?.textContent.includes("Área individual"),
  );
  await a.locator("#auto-hunt").waitFor();
  await a.locator("#pause").click();
  await a.waitForFunction(() => window.__idle.snapshot().paused);
  await a.locator("#pause").click();
  await a.waitForFunction(() => !window.__idle.snapshot().paused);
  await a.screenshot({ path: "reports/hud-adventure.png" });
  await a.locator("#return-lobby").click();
  await a.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10001" &&
      window.__idle.snapshot().multiplayer.status === "online",
    {},
    { timeout: 90000 },
  );
  await a.waitForFunction(() =>
    document.querySelector(".minimap-online").textContent.includes("2 online"),
  );
  results.travelCombatControlsAndPresenceScope = true;
  await b.locator("#hud-options").click();
  await b.locator("#back").click();
  await a.waitForFunction(() =>
    document.querySelector(".minimap-online").textContent.includes("1 online"),
  );
  assert.equal(await b.locator("#menu").isVisible(), true);
  results.playerCountUpdatesOnLeaveAndMenuRestores = true;
  assert.deepEqual(errors, []);
  results.noBrowserErrors = true;
  await writeFile(
    "reports/hud-validation.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          "Local PGlite + Auth fixture + WebSocket + two Chrome contexts",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results));
} catch (error) {
  console.log("Browser check failure", String(error), errors);
  for (let i = 0; i < debugPages.length; i++) {
    try {
      console.log(
        JSON.stringify(
          await debugPages[i].evaluate(() => ({
            debug: window.__idle?.snapshot(),
            status: document.querySelector("[data-multiplayer-status]")
              ?.textContent,
            loading: document.getElementById("game-loading")?.textContent,
          })),
          null,
          2,
        ),
      );
      await debugPages[i].screenshot({
        path: "reports/social-failure-" + i + ".png",
      });
    } catch {}
  }
  throw error;
} finally {
  await browser?.close();
  if (game) await game.stop();
  vite?.kill();
  await new Promise((r) => auth.close(r));
  await db.close();
}
