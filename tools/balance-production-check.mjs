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
  results = {};
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1360, height: 960 },
  });
  const dist = resolve("dist");
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin || url.pathname.startsWith("/api/"))
      return route.continue();
    const target = resolve(
      dist,
      "." +
        (["/", "/admin", "/arena"].includes(url.pathname)
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(
    () => !document.getElementById("continue").disabled,
  );
  await page.evaluate(() => {
    const collection = [
      "11000101",
      "11000211",
      "11000301",
      "11004901",
      "11001201",
    ];
    const characterProgress = Object.fromEntries(
      collection.map((id) => [
        id,
        {
          level: id === "11004901" ? 12 : 1,
          xp: 0,
          upgrades: 0,
          equipment: {},
        },
      ]),
    );
    localStorage.setItem(
      "folha-idle-v1",
      JSON.stringify({
        version: 1,
        character: "naruto",
        activeEntityId: "11004901",
        collection,
        characterProgress,
        level: 12,
        xp: 0,
        upgrades: 0,
        area: 0,
        coins: 6000,
        kills: 0,
        defeats: 0,
        inventory: {},
        equipment: {},
        paused: false,
        sound: false,
        location: "10001",
        autoHunt: false,
        partyIds: [],
        questClaims: [],
        visitedMaps: ["10001"],
        lastSaved: Date.now(),
      }),
    );
  });
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#canvas canvas") &&
        document.getElementById("game-loading").hidden,
      null,
      { timeout: 30000 },
    );
  await page.locator("#continue").click();
  await ready();
  assert.equal(await page.locator("#hero-name").innerText(), "Deidara");
  await page.locator("#progression").click();
  await page.locator('[data-tab="attributes"]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-recruit-profile="caster"]'),
  );
  assert.match(
    await page.locator("[data-recruit-profile]").innerText(),
    /Ninjutsu specialist/,
  );
  await page.locator('[data-tab="shop"]').click();
  assert.equal(await page.locator("[data-item]").count(), 22);
  for (const id of [
    "selo-canalizador-3",
    "manto-canalizador-3",
    "talisma-canalizador-3",
  ])
    await page.locator(`[data-item="${id}"] button`).click();
  await page.locator('[data-tab="inventory"]').click();
  for (const id of [
    "selo-canalizador-3",
    "manto-canalizador-3",
    "talisma-canalizador-3",
  ])
    await page.locator(`[data-item="${id}"] button`).click();
  await page.locator(".progression-panel [data-close]").click();
  results.recruitAndTierThreeLoadout = true;
  await page.locator("#maps").click();
  assert.equal(
    await page.locator("[data-difficulty-picker] option:disabled").count(),
    1,
  );
  await page.locator("[data-difficulty-picker]").selectOption("2");
  await page.locator('[data-map="10020"]').click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("folha-idle-v1")).location === "10020" &&
      document.getElementById("game-loading").hidden,
  );
  assert.match(
    await page.locator("#cast-skill").innerText(),
    /Offensive channeling/,
  );
  assert.match(await page.locator(".enemy-profile").innerText(), /Caster/);
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("folha-idle-v1")).kills >= 1,
    null,
    { timeout: 45000 },
  );
  await page.locator("#auto-hunt").click();
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () => document.getElementById("world-name").textContent === "Leaf Village",
  );
  const afterCombat = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(afterCombat.area, 2);
  assert.ok(afterCombat.coins > 3150);
  assert.ok(afterCombat.characterProgress["11004901"].xp > 0);
  assert.equal(afterCombat.characterProgress["11000101"].xp, 0);
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((entry) => /11004901.*SP_skill/.test(entry.name)),
    ),
    false,
  );
  results.veteranDifficultyTechniqueAndRealRewards = true;
  await page.locator("#library").click();
  await page.locator('[data-character-id="11001201"] button').last().click();
  await ready();
  await page.locator("#progression").click();
  await page.locator('[data-tab="inventory"]').click();
  assert.equal(
    await page.locator('[data-item="selo-canalizador-3"] button').isDisabled(),
    true,
  );
  assert.match(
    await page.locator('[data-item="selo-canalizador-3"]').innerText(),
    /Requires selected character level 12/,
  );
  await page.locator(".progression-panel [data-close]").click();
  await page.locator("#library").click();
  await page.locator('[data-character-id="11004901"] button').last().click();
  await ready();
  await page.locator("[data-language]").selectOption("es");
  await ready();
  await page.locator("#progression").click();
  await page.locator('[data-tab="attributes"]').click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-recruit-profile]")
      ?.textContent.includes("Especialista en ninjutsu"),
  );
  await page.locator('[data-tab="shop"]').click();
  assert.match(
    await page.locator('[data-item="selo-canalizador-3"] h3').innerText(),
    /Foco canalizador III/,
  );
  await page.screenshot({ path: "reports/balance-production-shop.png" });
  await page.locator(".progression-panel [data-close]").click();
  await page.reload();
  await page.locator("#continue").click();
  await ready();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(restored.activeEntityId, "11004901");
  assert.deepEqual(restored.equipment, afterCombat.equipment);
  assert.equal(restored.coins, afterCombat.coins);
  results.individualUnlocksTranslationsAndPersistence = true;
  assert.deepEqual(errors, []);
  await writeFile(
    "reports/balance-production-validation.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        builtBundle: true,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} catch (error) {
  console.error("Browser errors:", errors);
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page
        .screenshot({ path: "reports/balance-production-failure.png" })
        .catch(() => {});
      console.error(
        await page
          .locator("#loading-message")
          .innerText()
          .catch(() => ""),
      );
    }
  throw error;
} finally {
  await browser.close();
}
