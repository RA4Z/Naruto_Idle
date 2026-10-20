import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [];
const samples = [];
try {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5194");
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  await page.locator("#auto-hunt").click();
  await page.locator("#mini-window").click();
  await page.waitForFunction(() => !!window.documentPictureInPicture?.window);
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  for (const height of [300, 180, 120, 80, 420, 100, 420, 80]) {
    await page.evaluate((height) => {
      const pip = window.documentPictureInPicture.window;
      pip.resizeTo(300, height);
      // Also exercise sizes below the platform's native minimum window size.
      pip.document
        .querySelector(".mini-window")
        .style.setProperty("height", `${height}px`, "important");
    }, height);
    await page.waitForTimeout(450);
    const state = await page
      .evaluate(() => window.__idle.snapshot())
      .catch(async (error) => {
        // Chromium may replace the execution context as the PiP window changes focus.
        if (!String(error).includes("Execution context was destroyed"))
          throw error;
        await page.waitForTimeout(1000);
        return page.evaluate(() => window.__idle.snapshot());
      });
    samples.push({
      requestedHeight: height,
      viewport: state.viewport,
      phase: state.phase,
      kills: state.kills,
    });
    assert.ok(state.viewport.canvasHeight >= 90);
    assert.ok(state.viewport.heroVisible);
  }
  assert.deepEqual(errors, []);
  const tinyKills = await page.evaluate(() => window.__idle.snapshot().kills);
  await page.waitForFunction(
    (before) => window.__idle.snapshot().kills > before,
    tinyKills,
    { timeout: 30000 },
  );
  // Exercise engine protection independently of CSS: a hidden or fractional host
  // can still trigger Phaser's automatic RESIZE path between documents.
  await page.evaluate(() => {
    const host =
      window.documentPictureInPicture.window.document.querySelector("#canvas");
    host.style.height = "0px";
  });
  await page.waitForTimeout(350);
  const collapsed = await page.evaluate(() => window.__idle.snapshot());
  assert.ok(collapsed.viewport.canvasHeight >= 90);
  samples.push({ forcedZeroHeight: true, viewport: collapsed.viewport });
  await page.evaluate(() => {
    window.documentPictureInPicture.window.document.querySelector(
      "#canvas",
    ).style.height = "0.5px";
  });
  await page.waitForTimeout(350);
  assert.ok(
    (await page.evaluate(() => window.__idle.snapshot())).viewport
      .canvasHeight >= 90,
  );
  await page.evaluate(() => {
    window.documentPictureInPicture.window.document
      .querySelector("#canvas")
      .style.removeProperty("height");
  });
  await other.close();
  await page.bringToFront();
  await page.evaluate(() => window.documentPictureInPicture.window.close());
  await page.waitForFunction(() => {
    const v = window.__idle.snapshot().viewport;
    return (
      v.width === v.canvasWidth &&
      v.height === v.canvasHeight &&
      v.height > 400 &&
      v.heroVisible
    );
  });
  assert.equal(await page.locator("#play > #canvas canvas").count(), 1);
  const before = await page.evaluate(() => window.__idle.snapshot().kills);
  await page.waitForFunction(
    (before) => window.__idle.snapshot().kills > before,
    before,
    { timeout: 30000 },
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    samples,
    errors,
    victoryWhileTiny: true,
    victoryAfterRestore: true,
    singleCanvas: true,
  };
  await writeFile(
    "reports/mini-window-resize-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
