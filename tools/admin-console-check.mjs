import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194",
  admin = process.argv.includes("--admin");
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  requests = [];
try {
  const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1280, height: 960 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.goto(base);
  await page.waitForFunction(() => !document.getElementById("new").disabled);
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  const ready = () =>
    page.waitForFunction(
      () =>
        window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
    );
  await ready();
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  assert.equal(
    await page.evaluate(() => window.__idle.snapshot().visionDebug),
    false,
  );
  await page.locator("#pause").click();
  await page.locator("#canvas canvas").focus();
  await page.keyboard.press("Quote");
  if (admin) {
    await page.waitForFunction(
      () => document.getElementById("admin-debug-console")?.open,
    );
    const input = page.locator("#admin-debug-console input");
    await input.fill("debug=true");
    await input.press("Enter");
    await page.waitForFunction(
      () => window.__idle.snapshot().visionDebug === true,
    );
    await input.fill("debug=invalid");
    await input.press("Enter");
    assert.equal(
      await page.evaluate(() => window.__idle.snapshot().visionDebug),
      true,
    );
    await page.keyboard.press("Quote");
    await page.waitForFunction(
      () => !document.getElementById("admin-debug-console").open,
    );
    await page.screenshot({ path: "reports/admin-vision-debug.png" });
    await page.keyboard.press("Quote");
    await input.fill("debug=false");
    await input.press("Enter");
    await page.waitForFunction(
      () => window.__idle.snapshot().visionDebug === false,
    );
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator("#continue").click();
    await ready();
    assert.equal(
      await page.evaluate(() => window.__idle.snapshot().visionDebug),
      false,
    );
  } else {
    assert.equal(await page.locator("#admin-debug-console").count(), 0);
    assert.equal(
      requests.some((p) => p.includes("debug-console")),
      false,
    );
  }
  await page.goto(base + "/admin");
  await page.waitForFunction(
    () =>
      document.querySelector(".admin-shell") ||
      document.querySelector("input[type=password]") ||
      document.querySelector("input"),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Quote");
  if (admin)
    await page.waitForFunction(
      () => document.getElementById("admin-debug-console")?.open,
    );
  else assert.equal(await page.locator("#admin-debug-console").count(), 0);
  assert.deepEqual(errors, []);
  const result = {
    checkedAt: new Date().toISOString(),
    admin,
    hiddenByDefault: true,
    consoleOnlyOnAdmin: true,
    commandsAndReload: admin,
    errors,
  };
  await writeFile(
    `reports/admin-console-${admin ? "admin" : "normal"}-validation.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(result);
  await context.close();
} finally {
  await browser.close();
}
