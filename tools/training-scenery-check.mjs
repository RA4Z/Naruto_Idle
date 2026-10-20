import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.IDLE_TEST_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({ headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [], results = [];
async function open(character, position, paused = false) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.addInitScript(({ character, position, paused }) => localStorage.setItem("folha-idle-v1", JSON.stringify({
    version: 1, character, level: 1, xp: 0, coins: 0, inventory: {}, equipment: {}, area: 0,
    upgrades: 0, kills: 0, defeats: 0, lastSaved: Date.now(), sound: false, paused,
    location: "10006", worldPosition: { mapId: "10006", ...position }, autoHunt: false,
    partyIds: ["11001201"], questClaims: [], visitedMaps: ["10001", "10006"],
    collection: ["11000101", "11000201", "11000301", "11001201"],
  })), { character, position, paused });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(base);
  await page.locator("#continue").click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  return { context, page };
}
try {
  for (const character of ["naruto", "sasuke", "sakura"]) {
    const { context, page } = await open(character, { x: 232, y: 520 });
    const before = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(before.walkable && before.party.every(member => member.walkable));
    assert.ok(Math.hypot(before.hero.x - 232, before.hero.y - 520) > 5, "old fence save relocated");
    assert.equal(before.occlusion.length, 0);
    const destination = { x: 600 / 3.072, y: 1320 / 3.072 };
    await page.evaluate(p => window.__idle.walkTo(p), destination);
    await page.waitForFunction(p => {
      const s = window.__idle.snapshot();
      return Math.hypot(s.hero.x - p.x, s.hero.y - p.y) < 1;
    }, destination, { timeout: 15000 });
    const after = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(after.walkable && after.party.every(member => member.walkable));
    assert.ok(after.enemies.every(enemy => enemy.walkable));
    if (character === "sasuke") await page.screenshot({ path: "reports/training-gate-reviewed.png" });
    results.push({ character, gateTraversal: true, correctedSave: true, actorsOnWalkableGround: true });
    if (character === "sakura") {
      await page.locator("#return-lobby").click();
      await page.waitForFunction(() => window.__idle.snapshot().mapId === "10001");
      assert.equal((await page.evaluate(() => window.__idle.snapshot())).occlusion.length, 0);
      await page.locator("#maps").click();
      await page.locator('[data-map="10006"]').click();
      await page.waitForFunction(() => window.__idle.snapshot().mapId === "10006");
      assert.equal((await page.evaluate(() => window.__idle.snapshot())).occlusion.length, 0);
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(500);
        const sample = await page.evaluate(() => window.__idle.snapshot());
        assert.ok(sample.walkable && sample.party.every(member => member.walkable));
        assert.ok(sample.enemies.every(enemy => enemy.walkable), "patrolling enemies avoid scenery");
      }
      results.push({ mapChangeCleanupAndReload: true });
    }
    await context.close();
  }
  const { context, page } = await open("sasuke", { x: 1160 / 3.072, y: 1300 / 3.072 }, true);
  const s = await page.evaluate(() => window.__idle.snapshot());
  assert.ok(s.walkable);
  assert.equal(s.occlusion.length, 0, "background polygons must not cover the character");
  await page.screenshot({ path: "reports/training-ground-visibility.png" });
  await context.close();
  assert.deepEqual(errors, []);
  const report = { results, errors, opaqueBackgroundOverlaysDisabled: true, visualChecks: ["training-gate-reviewed.png", "training-ground-visibility.png"] };
  await writeFile("reports/training-scenery-validation.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
