import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  missing = [],
  result = [];
try {
  for (const hero of ["naruto", "sasuke", "sakura"]) {
    const context = await browser.newContext({
      viewport: { width: 1180, height: 850 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((hero) => {
      localStorage.setItem(
        "folha-idle-v1",
        JSON.stringify({
          version: 1,
          character: hero,
          level: 1,
          xp: 0,
          coins: 0,
          inventory: {},
          equipment: {},
          area: 0,
          upgrades: 0,
          kills: 0,
          defeats: 0,
          lastSaved: Date.now(),
          sound: false,
          paused: false,
          location: "10006",
          autoHunt: true,
          partyIds: [],
          questClaims: [],
          visitedMaps: ["10001", "10006"],
          collection: ["11000101", "11000201", "11000301"],
        }),
      );
    }, hero);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => {
      if (r.status() >= 400 && /\/assets\//.test(r.url()))
        missing.push(r.url());
    });
    await page.goto("http://127.0.0.1:5178");
    await page.locator("#continue").click();
    try {
      await page.waitForFunction(
        () => window.__idle?.snapshot().phase === "combatendo",
        {},
        { timeout: 15000 },
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          hero,
          errors,
          missing,
          snapshot: await page.evaluate(() => window.__idle?.snapshot()),
          body: (await page.locator("body").innerText()).slice(0, 1800),
        }),
      );
      await page.screenshot({ path: "reports/combat-refinement-failure.png" });
      throw e;
    }
    assert.equal(
      await page.locator("#hero-name").innerText(),
      hero[0].toUpperCase() + hero.slice(1),
    );
    await page.locator("#cast-skill").click();
    const samples = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(130);
      const s = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(s.heroSpriteInstances, 1);
      assert.equal(s.walkable, true);
      assert.equal(s.party.length, 0);
      assert.ok(s.origin.every(Number.isFinite));
      samples.push({
        animation: s.animation,
        origin: s.origin,
        instances: s.heroSpriteInstances,
      });
    }
    await page.screenshot({ path: `reports/combat-reviewed-${hero}.png` });
    await page.waitForFunction(
      () => window.__idle.snapshot().kills >= 1,
      {},
      { timeout: 20000 },
    );
    // The arena suspends the PvE loop while open and resumes it when closed.
    await page.locator("#arena").click();
    await page.locator(".arena-panel").waitFor();
    const before = await page.evaluate(() => window.__idle.snapshot());
    assert.equal(before.gameLoopRunning, false);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__idle.snapshot());
    assert.deepEqual(after.hero, before.hero);
    await page.locator(".arena-panel [data-close]").click();
    await page.waitForFunction(() => window.__idle.snapshot().gameLoopRunning);
    result.push({
      hero,
      victory: true,
      singleHeroSprite: true,
      properOrigins: true,
      arenaSuspendsPve: true,
      samples,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  const report = {
    checkedAt: new Date().toISOString(),
    policy: "one browser and one Phaser scene at a time",
    characters: result,
    errors,
    missingAssets: missing,
  };
  await fs.writeFile(
    "reports/combat-refinement-browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
