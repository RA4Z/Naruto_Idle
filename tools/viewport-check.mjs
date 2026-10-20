import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5178");
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  await page.locator("#pause").click();
  const initial = await page.evaluate(() => window.__idle.snapshot());
  for (const [width, height] of [
    [1440, 1000],
    [1000, 760],
    [390, 844],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => {
      const parent = document.querySelector("#canvas").getBoundingClientRect();
      const canvas = document.querySelector("canvas"),
        box = canvas.getBoundingClientRect();
      return {
        parent: {
          width: parent.width,
          height: parent.height,
          x: parent.x,
          y: parent.y,
        },
        canvas: {
          width: box.width,
          height: box.height,
          x: box.x,
          y: box.y,
          pixelsX: canvas.width,
          pixelsY: canvas.height,
        },
        snapshot: window.__idle.snapshot(),
        overflow: document.body.scrollWidth > innerWidth,
      };
    });
    for (const field of ["width", "height", "x", "y"])
      assert.ok(
        Math.abs(state.parent[field] - state.canvas[field]) < 1,
        field + " canvas gap",
      );
    assert.ok(Math.abs(state.canvas.pixelsX - state.canvas.width) < 1);
    assert.ok(Math.abs(state.canvas.pixelsY - state.canvas.height) < 1);
    assert.equal(state.snapshot.scale, initial.scale);
    assert.equal(state.snapshot.zoom, initial.zoom);
    assert.deepEqual(state.snapshot.hero, initial.hero);
    assert.equal(state.overflow, false);
    await page.screenshot({
      path: `reports/viewport-${width}.png`,
      fullPage: true,
    });
    results.push({ width, height, ...state });
  }
  await fs.writeFile(
    "reports/viewport-validation.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    "Desktop, narrow, mobile and round-trip resize: no canvas gaps, no CSS rescaling, unchanged hero scale and camera zoom.",
  );
} finally {
  await browser.close();
}
