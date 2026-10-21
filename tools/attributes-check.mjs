import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"] });
const results = [], errors = [];
try {
  for (const character of ["naruto", "sasuke", "sakura"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(character => {
      if (!sessionStorage.getItem("attribute-fixture")) {
      localStorage.setItem("folha-idle-v1", JSON.stringify({ version: 1, character, level: 1, xp: 0, coins: 100, inventory: {},
        equipment: {}, area: 0, upgrades: 0, kills: 0, defeats: 0, lastSaved: Date.now(), sound: false, paused: false,
        location: "10001", autoHunt: false, partyIds: ["11001201"], questClaims: [], visitedMaps: ["10001"],
        collection: ["11000101", "11000201", "11000301", "11001201"] }));
      sessionStorage.setItem("attribute-fixture", "1");
      }
    }, character);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(base); await page.locator("#continue").click();
    await page.waitForFunction(() => window.__idle?.snapshot());
    await page.locator("#progression").click(); await page.locator('[data-tab="attributes"]').click();
    assert.equal(await page.locator('.progression-panel .progress-card').count(), 7);
    assert.ok((await page.locator('.attribute-summary').innerText()).includes('ataques/s'));
    if (character === "naruto") await page.screenshot({ path: "reports/attributes-sheet.png" });
    await page.locator('.progression-panel [data-close]').click();
    await page.locator('#canvas canvas').focus();
    const before = await page.evaluate(() => window.__idle.snapshot());
    await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
    const after = await page.evaluate(() => window.__idle.snapshot());
    const moved = Math.hypot(after.hero.x - before.hero.x, after.hero.y - before.hero.y);
    assert.ok(moved > before.speed * 0.28 && moved < before.speed * 0.65, `${character}: movement ${moved}`);
    assert.ok(after.walkable && after.party.every(p => p.walkable));
    await page.locator('#upgrade').click();
    const trained = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(trained.speed > after.speed && trained.attackInterval < after.attackInterval);
    await page.reload(); await page.locator('#continue').click();
    await page.waitForFunction(() => window.__idle?.snapshot());
    assert.equal((await page.evaluate(() => window.__idle.snapshot())).speed, trained.speed);
    await page.locator('#maps').click(); await page.locator('[data-map="10006"]').click();
    await page.waitForFunction(() => window.__idle.snapshot().mapId === '10006' && !window.__idle.snapshot().loadingActor);
    await page.locator('#auto-hunt').click();
    await page.waitForFunction(() => window.__idle.snapshot().firstStrikeMs !== undefined, null, { timeout: 20000 });
    const latency = await page.evaluate(() => window.__idle.snapshot().firstStrikeMs);
    assert.ok(latency >= 0 && latency < 50, `${character}: first attack ${latency} ms`);
    const combat = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(combat.animation.startsWith('battle-'));
    assert.ok(combat.animationTimeScale >= 1);
    await page.waitForFunction(() => window.__idle.snapshot().kills >= 1, null, { timeout: 20000 });
    results.push({ character, speed: before.speed, attackInterval: before.attackInterval, moved, trainedSpeed: trained.speed, firstAttackMs: Math.round(latency), victory: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { results, errors, oldSaveAndTrainingPersist: true, attributeCards: 7 };
  await writeFile('reports/attributes-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
