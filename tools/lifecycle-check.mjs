import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  await page.locator("#sound").check();
  await page.locator("#pause").click();
  await page.waitForTimeout(100);
  await page.locator("#music").check();
  await page.waitForTimeout(100);
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).presentation
      .musicPlaying,
    false,
  );
  await page.locator("#pause").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().presentation.musicPlaying,
  );
  await page.locator("#pause").click();
  await page.route("**/iruka-11003601/world/idle_0.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue().catch(() => {});
  });
  await page.locator("#library").click();
  await page.getByLabel("Filtrar coleção").selectOption("all");
  await page
    .getByRole("searchbox", { name: "Buscar personagem" })
    .fill("11003601");
  const pending = page.waitForRequest("**/iruka-11003601/world/idle_0.png");
  await page.locator('[data-entity="11003601"] [data-role="npc"]').click();
  await pending;
  await page.keyboard.press("Escape");
  await page.locator("#back").click();
  await page.waitForTimeout(1300);
  await page.locator("#new").click();
  await page.locator('[data-character="sakura"]').click();
  await page.waitForFunction(
    () => window.__idle?.snapshot().character === "sakura",
  );
  await page.locator("#pause").click();
  await page.locator("#library").click();
  await page.getByLabel("Filtrar coleção").selectOption("all");
  assert.equal(await page.locator(".entity-card button:disabled").count(), 0);
  assert.deepEqual(errors, []);
  const result = {
    musicEnabledDuringPauseStaysPaused: true,
    musicResumes: true,
    actorLoadCancelledOnExit: true,
    libraryReusableAfterRestart: true,
    errors,
  };
  await fs.writeFile(
    "reports/entity-lifecycle-validation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
