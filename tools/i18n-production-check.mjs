// Serve built static responses through the existing test origin; no extra server.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: null });
  await context.addInitScript(() =>
    localStorage.setItem(
      "folha-idle-language",
      sessionStorage.getItem("production-language-set")
        ? localStorage.getItem("folha-idle-language") || "en"
        : "en",
    ),
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 960 });
  page.on("pageerror", (error) => errors.push(String(error)));
  const dist = resolve("dist");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin || url.pathname.startsWith("/api/"))
      return route.continue();
    const pathname =
      url.pathname === "/" ||
      url.pathname === "/admin" ||
      url.pathname === "/arena"
        ? "/index.html"
        : decodeURIComponent(url.pathname);
    const target = resolve(dist, "." + pathname);
    if (!target.startsWith(dist + sep)) return route.abort();
    try {
      if (!(await stat(target)).isFile()) return route.continue();
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".mp3": "audio/mpeg",
      };
      await route.fulfill({
        status: 200,
        body: await readFile(target),
        contentType: types[extname(target)] || "application/octet-stream",
      });
    } catch {
      return route.continue();
    }
  });
  await page.goto(base);
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "en" &&
      !document.getElementById("new").disabled,
  );
  assert.equal(await page.locator("#new").innerText(), "New game");
  await page.locator("#new").click();
  await page.locator('[data-character="sakura"]').click();
  await page.waitForFunction(
    () =>
      !document.getElementById("game-loading").hidden === false &&
      document.querySelector("#canvas canvas"),
  );
  assert.equal(await page.locator("#world-name").innerText(), "Leaf Village");
  assert.equal(await page.locator("#maps").innerText(), "Travel · maps");
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById("game-loading").hidden &&
      document.getElementById("world-name").textContent ===
        "Leaf Training Grounds",
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("folha-idle-v1")).kills >= 1,
    null,
    { timeout: 30000 },
  );
  await page.locator("#auto-hunt").click();
  await page.waitForTimeout(2200);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () =>
      document.getElementById("world-name").textContent === "Leaf Village" &&
      document.getElementById("game-loading").hidden,
  );
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  await page.locator("#mini-window").click();
  await page.waitForFunction(() => !!window.documentPictureInPicture?.window);
  assert.equal(
    await page.evaluate(
      () =>
        window.documentPictureInPicture.window.document.documentElement.lang,
    ),
    "en",
  );
  assert.match(
    await page.evaluate(
      () => window.documentPictureInPicture.window.document.body.innerText,
    ),
    /Restore/,
  );
  await page.evaluate(() =>
    sessionStorage.setItem("production-language-set", "1"),
  );
  await page.locator("[data-language]").selectOption("es");
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "es" &&
      document.getElementById("game-loading").hidden &&
      document.getElementById("world-name").textContent === "Aldea de la Hoja",
  );
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.deepEqual(after.characterProgress, before.characterProgress);
  assert.equal(after.coins, before.coins);
  assert.equal(await page.locator("#play > #canvas canvas").count(), 1);
  assert.equal(
    await page.evaluate(() => !!window.documentPictureInPicture?.window),
    false,
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    builtBundle: true,
    english: true,
    spanish: true,
    combatVictory: true,
    nativePipTranslated: true,
    languageChangeRestoresPipAndJourney: true,
    savePreserved: true,
    singleCanvas: true,
    errors,
  };
  await writeFile(
    "reports/i18n-production-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
