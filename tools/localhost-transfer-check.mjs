import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.LAN_TEST_URL || "http://10.1.43.80:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: null });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("transfer-fixture")) return;
    const receiving = location.hostname === "localhost";
    localStorage.setItem(
      "folha-idle-v1",
      JSON.stringify({
        version: 1,
        character: receiving ? "sakura" : "naruto",
        level: receiving ? 3 : 8,
        xp: 31,
        upgrades: 4,
        coins: 237,
        inventory: { "kunai-treino": 1, fragmento: 12 },
        equipment: { weapon: "kunai-treino" },
        area: 0,
        kills: 9,
        defeats: 2,
        lastSaved: Date.now(),
        sound: false,
        paused: false,
        location: "10001",
        autoHunt: false,
        partyIds: ["11000201"],
        questClaims: ["first-victory"],
        visitedMaps: ["10001", "10006"],
        collection: ["11000101", "11000201", "11000301"],
        characterProgress: {
          11000201: { level: 3, xp: 14, upgrades: 2, equipment: {} },
        },
      }),
    );
    sessionStorage.setItem("transfer-fixture", "1");
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", (e) => errors.push(String(e)));
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("folha-idle-v1")));
  await page.goto(base);
  await page.locator("#continue").click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  const before = await saved();
  await page.locator("#mini-window").click();
  await page.locator(".mini-help").waitFor();
  assert.match(
    await page.locator("[data-mini-reason]").innerText(),
    /endereço HTTP por IP/,
  );
  assert.equal(await page.locator("#play > #canvas canvas").count(), 1);
  assert.equal(await page.locator(".mini-window").isVisible(), false);
  await page.screenshot({ path: "reports/mini-localhost-help.png" });
  await page.locator("[data-mini-localhost]").click();
  await page.waitForURL(
    (url) => url.hostname === "localhost" && url.hash === "",
  );
  // Transfer automatically continues the imported journey.
  await page.waitForFunction(() => window.__idle?.snapshot());
  const after = await saved();
  for (const key of [
    "character",
    "level",
    "xp",
    "upgrades",
    "coins",
    "kills",
    "defeats",
    "inventory",
    "equipment",
    "collection",
    "characterProgress",
    "questClaims",
    "partyIds",
  ])
    assert.deepEqual(after[key], before[key], key);
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-before-localhost-transfer")),
  );
  assert.equal(backup.character, "sakura");
  assert.equal(backup.level, 3);
  assert.equal(await page.evaluate(() => isSecureContext), true);
  assert.equal(new URL(page.url()).port, new URL(base).port);
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  await page.locator("#mini-window").click();
  assert.equal(
    await page.evaluate(() => !!window.documentPictureInPicture?.window),
    true,
  );
  await page.evaluate(() =>
    window.documentPictureInPicture.window.document
      .querySelector('[data-mini-action="auto-hunt"]')
      .click(),
  );
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.waitForFunction(() => window.__idle.snapshot().kills > 9, null, {
    timeout: 30000,
  });
  assert.equal(
    await page.evaluate(
      () => window.documentPictureInPicture.window.document.visibilityState,
    ),
    "visible",
  );
  await other.close();
  await page.evaluate(() => window.documentPictureInPicture.window.close());
  await page.locator("#play > #canvas canvas").waitFor();
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    from: base,
    to: new URL(page.url()).origin,
    noSilentInPageFallback: true,
    progressPreserved: true,
    individualProgressPreserved: true,
    previousLocalhostSaveBackedUp: true,
    fragmentRemoved: true,
    automaticallyContinued: true,
    nativePiP: true,
    visibleAcrossTabs: true,
    victoryAcrossTabs: true,
    errors,
  };
  await writeFile(
    "reports/localhost-transfer-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
