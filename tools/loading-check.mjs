import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--renderer-process-limit=1"],
});
const errors = [];
const fixture = {
  version: 1,
  character: "naruto",
  level: 5,
  xp: 23,
  upgrades: 2,
  coins: 237,
  inventory: { fragmento: 4 },
  area: 0,
  kills: 0,
  defeats: 0,
  lastSaved: Date.now(),
  sound: false,
  paused: false,
  location: "10001",
  autoHunt: false,
  collection: ["11000101", "11000201", "11000301"],
  partyIds: [],
};
async function pageWithFixture() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript((s) => {
    if (!sessionStorage.getItem("load-fixture")) {
      localStorage.setItem(
        "folha-idle-v1",
        JSON.stringify({ ...s, lastSaved: Date.now() }),
      );
      sessionStorage.setItem("load-fixture", "1");
    }
  }, fixture);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  return { page, context };
}
const ready = (page) =>
  page.waitForFunction(
    () =>
      window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
  );
try {
  const { page, context } = await pageWithFixture();
  await page.route("**/naruto-kid/world/idle_0.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue().catch(() => {});
  });
  await page.goto(base);
  await page.locator("#continue").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.getElementById("continue").disabled,
  );
  const menu = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => new URL(e.name).pathname),
  );
  assert.equal(
    menu.some((url) => /phaser|\/src\/main.ts|entities.json|\.mp3$/.test(url)),
    false,
  );
  await page.evaluate(() => localStorage.removeItem("folha-idle-v1"));
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.locator("#game-loading").waitFor();
  assert.equal(await page.locator("#app").evaluate((e) => e.inert), true);
  await page.screenshot({ path: "reports/loading-screen.png" });
  await ready(page);
  const first = await page.evaluate(() => ({
    snapshot: window.__idle.snapshot(),
    assets: performance
      .getEntriesByType("resource")
      .filter((e) => new URL(e.name).pathname.startsWith("/assets/"))
      .map((e) => ({ url: new URL(e.name).pathname, bytes: e.transferSize })),
  }));
  assert.equal(
    first.assets.some((e) =>
      /\/battle\/|\/effects\/|\.mp3$|entities.json/.test(e.url),
    ),
    false,
  );
  assert.equal(first.snapshot.nativeForeground.masked,true);
  assert.ok(first.assets.some(e=>e.url.endsWith("/native-alpha.png")));
  assert.equal(first.assets.some(e=>/\/foreground\.(png|webp)$/.test(e.url)),false,"WebGL reuses the existing background texture");
  assert.ok(first.assets.length < 50);
  const assetBytes = first.assets.reduce((n, e) => n + e.bytes, 0);
  assert.ok(assetBytes < 6 * 1024 * 1024);
  assert.equal(first.snapshot.hp > 0, true);
  await page.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some((e) => /kakashi.*world\/run_0/.test(e.name)),
  );
  await page.locator("#sound").check();
  await page.locator("#music").check();
  await page.waitForFunction(
    () => window.__idle.snapshot().presentation.musicPlaying,
  );
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      document.getElementById("game-loading").hidden,
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(() => window.__idle.snapshot().kills >= 1, null, {
    timeout: 20000,
  });
  const kills = (await page.evaluate(() => window.__idle.snapshot())).kills;
  await page.locator("#pause").click();
  await page.reload();
  await page.locator("#continue").click();
  await ready(page);
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).mapId,
    "10006",
  );
  await page.locator("#pause").click();
  await page.waitForFunction(
    (previous) => window.__idle.snapshot().kills > previous,
    kills,
    { timeout: 20000 },
  );
  await context.close();

  // A broken required image must produce a retry screen instead of a blank/green world.
  const failed = await pageWithFixture();
  await failed.page.route("**/maps/10001/background.webp", (route) =>
    route.abort(),
  );
  await failed.page.goto(base);
  await failed.page.locator("#continue").click();
  await failed.page.locator("#loading-retry").waitFor({ state: "visible" });
  assert.match(
    await failed.page.locator("#loading-message").innerText(),
    /imagens essenciais/,
  );
  assert.equal(
    (
      await failed.page.evaluate(() =>
        JSON.parse(localStorage.getItem("folha-idle-v1")),
      )
    ).coins,
    fixture.coins,
  );
  await failed.page.unroute("**/maps/10001/background.webp");
  await failed.page.locator("#loading-retry").click();
  await ready(failed.page);
  assert.equal(await failed.page.locator("#canvas canvas").count(), 1);
  await failed.context.close();

  // Cancelling a slow load and selecting a different ninja cannot resurrect the old scene.
  const cancelled = await pageWithFixture();
  await cancelled.page.route(
    "**/naruto-kid/world/idle_0.png",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue().catch(() => {});
    },
  );
  await cancelled.page.goto(base);
  await cancelled.page.locator("#continue").click();
  await cancelled.page.locator("#loading-cancel").click();
  await cancelled.page.locator("#new").click();
  cancelled.page.on("dialog", (dialog) => dialog.accept());
  await cancelled.page.locator('[data-character="sakura"]').click();
  await ready(cancelled.page);
  assert.equal(
    (await cancelled.page.evaluate(() => window.__idle.snapshot())).character,
    "sakura",
  );
  assert.equal(await cancelled.page.locator("#canvas canvas").count(), 1);
  await cancelled.context.close();
  const before = JSON.parse(
    await readFile("reports/loading-before.json", "utf8"),
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    menuDefersEngine: true,
    initialAssetRequests: first.assets.length,
    initialAssetBytes: assetBytes,
    beforeAssetBytes: before.assetBytes,
    reductionPercent: Math.round(100 * (1 - assetBytes / before.assetBytes)),
    noAudioOrCombatBeforeLobby: true,
    deferredResidents: true,
    audioOnDemand: true,
    travelAndVictory: true,
    adventureReloadAndVictory: true,
    loadingScreenBeforeFirstFrame: true,
    requiredImageFailureRetry: true,
    cancelAndRestart: true,
    errors,
  };
  await writeFile(
    "reports/loading-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
