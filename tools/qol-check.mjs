import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  results = {};
async function ready(page) {
  await page.waitForFunction(
    () =>
      window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
    null,
    { timeout: 30000 },
  );
}
async function menu(page) {
  await page.goto(base);
  await page.locator("#continue").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.getElementById("continue").disabled,
  );
}
async function fixture(page) {
  await page.evaluate(() =>
    localStorage.setItem(
      "folha-idle-v1",
      JSON.stringify({
        version: 1,
        character: "naruto",
        level: 5,
        xp: 17,
        coins: 600,
        inventory: { "kunai-treino": 1, fragmento: 6 },
        equipment: { weapon: "kunai-treino" },
        area: 0,
        upgrades: 2,
        kills: 0,
        defeats: 0,
        lastSaved: Date.now(),
        sound: false,
        paused: false,
        location: "10001",
        autoHunt: false,
        partyIds: [],
        questClaims: [],
        visitedMaps: ["10001"],
      }),
    ),
  );
}
async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("folha-idle-v1")));
}
try {
  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1280, height: 960 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await menu(page);
  await fixture(page);
  await page.locator("#continue").click();
  await ready(page);
  const other = await context.newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await menu(other);
  await other.locator("#continue").click();
  await other.waitForFunction(() =>
    document
      .getElementById("loading-message")
      .textContent.includes("outra aba"),
  );
  assert.equal(await other.locator("canvas").count(), 0);
  const before = await saved(page);
  assert.equal(before.coins, 600);
  assert.equal(before.xp, 17);
  await other.locator("#loading-cancel").click();
  await page.locator("#back").click();
  await page.waitForFunction(() => !document.querySelector("#canvas canvas"));
  await other.locator("#continue").click();
  await ready(other);
  assert.equal((await saved(other)).xp, 17);
  await other.close();
  await page.locator("#continue").click();
  await ready(page);
  results.nativeLock =
    "blocked second tab, released on menu/close, progress preserved";
  console.log("Native lock passed");
  const lifecycle = await context.newCDPSession(page);
  const beforeFreeze = await saved(page);
  await lifecycle.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await lifecycle.send("Page.setWebLifecycleState", { state: "active" });
  await page.bringToFront();
  await ready(page);
  assert.equal((await saved(page)).coins, beforeFreeze.coins);
  await lifecycle.detach();
  results.freezeResume = true;

  await page.locator("#library").click();
  assert.equal(await page.locator(".active-character").count(), 1);
  await page.locator('[data-favorite-character="11000211"]').click();
  await page.locator(".progression-panel input[type=checkbox]").check();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-character-id]").length === 1,
  );
  assert.equal(
    await page.locator("[data-character-id]").getAttribute("data-character-id"),
    "11000211",
  );
  await page.locator(".progression-panel input[type=checkbox]").uncheck();
  await page.locator("[data-owned-search]").fill("11000211");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-character-id]").length === 1,
  );
  await page.locator("[data-open-archive]").click();
  await page.locator(".entity-library input[type=search]").fill("11000211");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-entity]").length === 1,
  );
  await page.locator(".entity-library [data-close]").click();
  await page.locator("#progression").click();
  await page.locator('[data-tab="shop"]').click();
  assert.equal(await page.locator("[data-comparison]").count(), 4);
  assert.match(
    await page.locator('[data-comparison="kunai-treino"]').innerText(),
    /Ataque 0/,
  );
  await page.locator(".progression-panel [data-close]").click();
  results.collectionAndGear = true;

  await page.locator(".accessibility-control").click();
  await page.locator('[data-preference="textSize"]').fill("130");
  await page.locator('[data-preference="voiceVolume"]').fill("0.25");
  await page.locator('[data-preference="musicVolume"]').fill("0.5");
  await page.locator('[data-preference="ambienceVolume"]').fill("0.75");
  await page.locator('[data-preference="reducedEffects"]').check();
  assert.equal(
    await page.evaluate(() => document.documentElement.style.fontSize),
    "130%",
  );
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("folha-idle-preferences")).voiceVolume,
    ),
    0.25,
  );
  await page.locator(".preferences-panel button").click();
  await page.locator("#maps").click();
  await page.locator("[data-map-search]").fill("10006");
  await page.waitForFunction(
    () => document.querySelectorAll(".map-card").length === 1,
  );
  await page.locator('[data-favorite-map="10006"]').click();
  assert.match(
    await page.locator('[data-difficulty="10006"]').innerText(),
    /seu nível 5/,
  );
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle?.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("folha-idle-preferences")).lastMap,
    ),
    "10006",
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(() => window.__idle.snapshot().kills > 0, null, {
    timeout: 45000,
  });
  assert.match(await page.locator("#session").innerText(), /XP\/min/);
  assert.ok((await page.locator("#hunt-status").innerText()).length > 0);
  if (await page.evaluate(() => window.__idle.snapshot().autoHunt))
    await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "explorando",
  );
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10001" &&
      !window.__idle.snapshot().loadingActor,
  );
  results.travelAndHunt = true;
  console.log("Collection, equipment, preferences and hunt passed");

  // Exercise real browser WebGL context loss/restoration, then forced Canvas fallback.
  const checkpoint = await saved(page);
  await page.evaluate(() => {
    const canvas = document.querySelector("#canvas canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WebGL loss extension unavailable");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 500);
  });
  await page.waitForFunction(
    () => !document.getElementById("game-loading").hidden,
  );
  await ready(page);
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  let restored = await saved(page);
  assert.equal(restored.coins, checkpoint.coins);
  assert.deepEqual(restored.characterProgress, checkpoint.characterProgress);
  await page.evaluate(() => {
    const canvas = document.querySelector("#canvas canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    gl.getExtension("WEBGL_lose_context").loseContext();
  });
  await page.waitForFunction(
    () => !document.getElementById("game-loading").hidden,
  );
  await ready(page);
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector("#canvas canvas").getContext("2d"),
    ),
    true,
  );
  restored = await saved(page);
  assert.equal(restored.coins, checkpoint.coins);
  results.graphicsRecovery =
    "real context restored and timeout rebuilt in Canvas, one canvas, progress retained";
  await page.screenshot({ path: "reports/qol-game.png" });
  await page.locator("#back").click();
  await page.waitForFunction(() => !document.querySelector("#canvas canvas"));
  await context.close();

  const fallback = await browser.newContext({ locale: "en-US" });
  await fallback.addInitScript(() =>
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    }),
  );
  const a = await fallback.newPage();
  a.on("pageerror", (e) => errors.push(e.message));
  await menu(a);
  await fixture(a);
  await a.locator("#continue").click();
  await ready(a);
  await a.locator("[data-language]").selectOption("es");
  await ready(a);
  await a.locator("[data-language]").selectOption("en");
  await ready(a);
  assert.equal((await saved(a)).coins, 600);
  results.lanLanguageResume = true;
  const b = await fallback.newPage();
  b.on("pageerror", (e) => errors.push(e.message));
  await menu(b);
  await b.locator("#continue").click();
  await b.waitForFunction(() =>
    document
      .getElementById("loading-message")
      .textContent.includes("another tab"),
  );
  await b.locator("#loading-cancel").click();
  // Expire the crashed/suspended owner's lease, then let the second tab claim it.
  await a.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.open("folha-idle-journey", 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("lease", "readwrite"),
          store = tx.objectStore("lease");
        const get = store.get("active");
        get.onsuccess = () =>
          store.put({ ...get.result, until: Date.now() - 1 }, "active");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await b.locator("#continue").click();
  await ready(b);
  await a.waitForFunction(
    () =>
      document.getElementById("play").hidden &&
      !document.querySelector("#canvas canvas"),
  );
  assert.equal((await saved(b)).xp, 17);
  assert.equal((await saved(b)).coins, 600);
  await b.locator("#back").click();
  await b.waitForFunction(() => !document.querySelector("#canvas canvas"));
  await fallback.close();
  results.insecureLanLease =
    "atomic claim, competing tab denied, expired owner fenced and stopped";
  assert.deepEqual(errors, []);
  await writeFile(
    "reports/qol-validation.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error("Browser errors:", errors);
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      console.error(
        await page
          .evaluate(() => ({
            url: location.href,
            loading: document.getElementById("game-loading")?.innerText,
            visible: !document.getElementById("game-loading")?.hidden,
            canvases: document.querySelectorAll("canvas").length,
            idle: !!window.__idle,
            menuHidden: document.getElementById("menu")?.hidden,
            toast: document.getElementById("toast")?.textContent,
            snapshot: (() => {
              try {
                return window.__idle?.snapshot();
              } catch (e) {
                return e.message;
              }
            })(),
          }))
          .catch(() => ({})),
      );
      await page
        .screenshot({ path: "reports/qol-failure.png" })
        .catch(() => {});
    }
  throw error;
} finally {
  await browser.close();
}
