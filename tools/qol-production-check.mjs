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
const errors = [],
  result = {};
try {
  const context = await browser.newContext({ locale: "de-DE", viewport: null });
  const dist = resolve("dist");
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin || url.pathname.startsWith("/api/"))
      return route.continue();
    const target = resolve(
      dist,
      "." +
        (url.pathname === "/"
          ? "/index.html"
          : decodeURIComponent(url.pathname)),
    );
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
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 960 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => !document.getElementById("new").disabled);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#canvas canvas") &&
      document.getElementById("game-loading").hidden,
  );
  const other = await context.newPage();
  await other.goto(base);
  await other.waitForFunction(
    () => !document.getElementById("continue").disabled,
  );
  await other.locator("#continue").click();
  await other.waitForFunction(() =>
    document
      .getElementById("loading-message")
      .textContent.includes("another tab"),
  );
  assert.equal(await other.locator("#canvas canvas").count(), 0);
  await other.close();
  result.exclusiveJourney = true;
  await page.bringToFront();
  await page.locator("#library").click();
  await page.locator('[data-favorite-character="11000101"]').click();
  assert.equal(await page.locator(".active-character").count(), 1);
  await page.locator('[data-character-id="11000211"] button').last().click();
  await page.waitForFunction(
    () =>
      document.getElementById("hero-name").textContent === "Sasuke" &&
      document.getElementById("game-loading").hidden,
  );
  await page.locator("#progression").click();
  await page.locator('[data-tab="shop"]').click();
  assert.equal(await page.locator("[data-comparison]").count(), 22);
  await page.locator(".progression-panel [data-close]").click();
  await page.locator(".accessibility-control").click();
  await page.locator('[data-preference="textSize"]').fill("120");
  await page.locator('[data-preference="voiceVolume"]').fill("0.5");
  await page.locator('[data-preference="reducedEffects"]').check();
  await page.locator(".preferences-panel button").click();
  await page.locator("#maps").click();
  await page.locator("[data-map-search]").fill("10006");
  await page.waitForFunction(
    () => document.querySelectorAll(".map-card").length === 1,
  );
  await page.locator('[data-favorite-map="10006"]').click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById("world-name").textContent ===
        "Leaf Training Grounds" &&
      document.getElementById("game-loading").hidden,
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("folha-idle-v1")).kills > 0,
    null,
    { timeout: 45000 },
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () =>
      document.getElementById("cast-skill").title ===
      "Available during combat.",
  );
  assert.equal(await page.locator("[data-session-segment]").count(), 1);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () => document.getElementById("world-name").textContent === "Leaf Village",
  );
  result.collectionEquipmentTravelAndVictory = true;
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  await page.locator("#mini-window").click();
  await page.waitForFunction(() => !!window.documentPictureInPicture?.window);
  assert.equal(
    await page.evaluate(
      () =>
        window.documentPictureInPicture.window.document.documentElement.style
          .fontSize,
    ),
    "120%",
  );
  assert.equal(
    await page.evaluate(() =>
      window.documentPictureInPicture.window.document.documentElement.classList.contains(
        "reduced-effects",
      ),
    ),
    true,
  );
  await page.locator("[data-language]").selectOption("es");
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "es" &&
      document.getElementById("game-loading").hidden &&
      document.querySelector("#canvas canvas"),
  );
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(after.coins, before.coins);
  assert.deepEqual(after.characterProgress, before.characterProgress);
  assert.equal(await page.locator("#library").innerText(), "Mis personajes");
  assert.equal(
    await page.evaluate(() => document.documentElement.style.fontSize),
    "120%",
  );
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  result.preferencesAndPipAndSpanishResume = true;
  await page.evaluate(() => {
    const canvas = document.querySelector("#canvas canvas"),
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const extension = gl.getExtension("WEBGL_lose_context");
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 500);
  });
  await page.waitForFunction(
    () => !document.getElementById("game-loading").hidden,
  );
  await page.waitForFunction(
    () =>
      document.getElementById("game-loading").hidden &&
      !!document.querySelector("#canvas canvas"),
  );
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("folha-idle-v1")).coins,
    ),
    before.coins,
  );
  result.graphicsRecovery = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".accessibility-control").click();
  await page.locator('[data-preference="textSize"]').fill("150");
  await page.locator(".preferences-panel button").click();
  await page.locator("#library").click();
  assert.ok(
    await page
      .locator(".progression-panel")
      .evaluate(
        (dialog) => dialog.getBoundingClientRect().width <= window.innerWidth,
      ),
  );
  await page.screenshot({ path: "reports/qol-mobile.png" });
  await page.locator(".progression-panel [data-close]").click();
  result.mobileLargeText = true;
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "reports/qol-production.png" });
  await writeFile(
    "reports/qol-production-validation.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        builtBundle: true,
        result,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
