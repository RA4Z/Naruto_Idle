import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const results = [],
  errors = [];
try {
  for (const character of ["naruto", "sasuke", "sakura"]) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:5178");
    await page.locator("#new").click();
    await page.locator(`[data-character="${character}"]`).click();
    await page.waitForFunction(() => window.__idle?.snapshot());
    const samples = await page.evaluate(() => {
      const samples = [];
      for (let i = 0; i < 1200; i++) {
        window.__idle.advance(100);
        samples.push(window.__idle.snapshot());
      }
      return samples;
    });
    for (const s of samples) {
      assert.ok(s.walkable, `${character} hero outside street`);
      assert.ok(s.enemyWalkable, `${character} enemy outside street`);
      assert.equal(s.zoom, 2.15);
    }
    assert.deepEqual([...new Set(samples.map((s) => s.step))].sort(), [-1, 1]);
    assert.ok(samples.some((s) => s.target === 0));
    assert.ok(samples.some((s) => s.target === 5));
    assert.ok(samples.at(-1).kills >= 3);
    const exploration = samples.filter((s) =>
      s.animation?.startsWith("world-"),
    );
    assert.equal(new Set(exploration.map((s) => s.scale)).size, 1);
    const combat = samples.filter((s) => s.phase === "combatendo");
    assert.equal(new Set(combat.map((s) => s.scale)).size, 1);
    for (let i = 1; i < samples.length; i++) {
      if (
        samples[i - 1].phase === "combatendo" &&
        samples[i].phase === "combatendo"
      )
        assert.deepEqual(samples[i - 1].hero, samples[i].hero);
    }
    await page.reload();
    await page.locator("#continue").click();
    await page.waitForFunction(
      () => window.__idle?.snapshot().phase === "combatendo",
      {},
      { timeout: 30000 },
    );
    await page.waitForTimeout(250);
    await page.locator("#pause").click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `reports/${character}-street-review.png`,
      fullPage: true,
    });
    results.push({
      character,
      samples: samples.length,
      simulatedSeconds: 120,
      bothDirections: true,
      allWaypoints: true,
      kills: samples.at(-1).kills,
      constantZoom: true,
      constantRigScale: true,
      allFeetInsideStreet: true,
    });
    if (character === "naruto") {
      await page.setViewportSize({ width: 1000, height: 760 });
      await page.waitForTimeout(300);
      await page.screenshot({
        path: "reports/street-narrow.png",
        fullPage: true,
      });
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "reports/scene-validation.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
