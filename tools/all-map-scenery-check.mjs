import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"] });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem("folha-idle-v1", JSON.stringify({
    version: 1, character: "naruto", level: 5, xp: 0, coins: 0, inventory: {}, equipment: {}, area: 0,
    upgrades: 0, kills: 0, defeats: 0, lastSaved: Date.now(), sound: false, paused: false,
    location: "10001", autoHunt: false, partyIds: ["11001201"], questClaims: [], visitedMaps: ["10001"],
    collection: ["11000101", "11000201", "11000301", "11001201"],
  })));
  await page.goto(base);
  await page.locator("#continue").click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  for (const id of ["10001", "10005", "10006", "10008", "10001"]) {
    const before = await page.evaluate(() => window.__idle.snapshot());
    if (before.mapId !== id) {
      await page.locator("#maps").click();
      await page.locator(`[data-map="${id}"]`).click();
      await page.waitForFunction(id => { const s = window.__idle.snapshot(); return s.mapId === id && !s.loadingActor; }, id);
    }
    const target = await page.evaluate(() => {
      const s = window.__idle.snapshot(), nav = window.__idle.navigation();
      return nav.pointsWithin(s.hero, 48).find(p => Math.hypot(p.x - s.hero.x, p.y - s.hero.y) > 30 &&
        nav.clear(s.hero, p) && s.enemies.every(e => Math.hypot(e.x - p.x, e.y - p.y) > 45));
    });
    assert.ok(target, `${id}: safe walking target`);
    await page.evaluate(target => window.__idle.walkTo(target), target);
    await page.waitForFunction(target => { const s = window.__idle.snapshot(); return Math.hypot(s.hero.x - target.x, s.hero.y - target.y) < 1; }, target, { timeout: 12000 });
    const sample = await page.evaluate(() => window.__idle.snapshot());
    assert.equal(sample.occlusion.length, 0, "opaque background cutouts stay disabled");
    assert.ok(sample.walkable && sample.party.every(p => p.walkable));
    assert.ok(sample.enemies.every(e => e.walkable));
    await page.screenshot({ path: `reports/scenery-reviewed-${id}.png` });
    results.push({ map: id, opaqueBackgroundOverlaysDisabled: true, walking: true, actorsWalkable: true });
  }
  assert.deepEqual(errors, []);
  const report = { results, errors, policy: "one browser, one Phaser scene, sequential travel" };
  await writeFile("reports/all-map-scenery-validation.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ errors, completed: results, failure: String(error) }));
  throw error;
} finally { await browser.close(); }
