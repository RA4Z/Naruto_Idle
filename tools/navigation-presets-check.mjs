import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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
      locale: "pt-BR",
      viewport: { width: 1280, height: 960 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("#continue").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    const { fresh } = await import("/src/model.ts");
    const { syncCharacterProgress } = await import(
      "/src/progression/character-progress.ts"
    );
    const s = fresh("naruto");
    s.inventory = {
      "kunai-treino": 1,
      "colete-shinobi": 1,
      "amuleto-chakra": 1,
    };
    s.equipment = { weapon: "kunai-treino" };
    syncCharacterProgress(s);
    localStorage.setItem("folha-idle-v1", JSON.stringify(s));
  });
  await page.locator("#continue").click();
  const ready = () =>
    page.waitForFunction(
      () =>
        window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
    );
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("folha-idle-v1")));
  await ready();
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  const svg = page.locator(".world-minimap svg");
  assert.equal(await svg.getAttribute("data-map-id"), "10001");
  // Click a reachable destination projected from the actual world grid.
  const dest = await page.evaluate(async () => {
    const { radarProjection } = await import("/src/world/map-projection.ts");
    const { listMaps } = await import("/src/world/maps.ts");
    const hero = window.__idle.snapshot().hero,
      nav = window.__idle.navigation();
    const p = nav.points.find(
      (p) =>
        Math.hypot(p.x - hero.x, p.y - hero.y) > 80 &&
        Math.hypot(p.x - hero.x, p.y - hero.y) < 130 &&
        nav.clear(hero, p),
    );
    if (!p) throw Error("No destination");
    const map = (await listMaps()).find((m) => m.id === "10001");
    return { ...radarProjection(map.width, map.height, hero).project(p), world: p };
  });
  const box = await svg.boundingBox();
  await page.mouse.click(
    box.x + (dest.x * box.width) / 240,
    box.y + (dest.y * box.height) / 240,
  );
  await page.waitForFunction(() => window.__idle.snapshot().path.length > 0);
  assert.equal(await page.locator("[data-destination]").count(), 1);
  assert.equal(await page.locator("[data-route]").count(), 0);
  await page.waitForFunction(
    (p) =>
      Math.hypot(
        window.__idle.snapshot().hero.x - p.x,
        window.__idle.snapshot().hero.y - p.y,
      ) < 20,
    dest.world,
  );
  await page.waitForFunction(() => window.__idle.snapshot().path.length === 0);
  await svg.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__idle.snapshot().path.length > 0);
  await page.waitForFunction(
    () =>
      document.querySelector(".world-minimap [role=status]").textContent
        .length > 0,
  );
  results.minimapClickAndKeyboard = true;
  await page.locator("#progression").click();
  await page.locator('[data-tab="presets"]').click();
  assert.equal(await page.locator("[data-preset]").count(), 3);
  await page.locator('[data-save-preset="damage"]').click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("folha-idle-v1")).equipmentPresets?.[
        "11000101"
      ]?.damage?.weapon === "kunai-treino",
  );
  await page.locator('[data-tab="inventory"]').click();
  await page.locator('[data-item="colete-shinobi"] button').click();
  await page.locator('[data-tab="presets"]').click();
  await page.locator('[data-save-preset="survival"]').click();
  await page.locator('[data-apply-preset="damage"]').click();
  await page.waitForFunction(
    () => !JSON.parse(localStorage.getItem("folha-idle-v1")).equipment.armor,
  );
  await page.locator('[data-apply-preset="survival"]').click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("folha-idle-v1")).equipment.armor ===
      "colete-shinobi",
  );
  const sets = (await saved()).equipmentPresets;
  await page.locator(".progression-panel [data-close]").click();
  await page.reload();
  await page.locator("#continue").click();
  await ready();
  assert.deepEqual((await saved()).equipmentPresets, sets);
  results.equipmentSetsAndReload = true;
  // Every language recreates exactly one overlay and retains sets.
  for (const language of ["en", "es", "pt-BR"]) {
    await page.locator("[data-language]").selectOption(language);
    await ready();
    assert.equal(await page.locator(".world-minimap").count(), 1);
    assert.deepEqual((await saved()).equipmentPresets, sets);
  }
  results.threeLanguages = true;
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  assert.equal(await svg.getAttribute("data-map-id"), "10006");
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".world-minimap svg").dataset.target.length > 0,
  );
  results.targetAndTravel = true;
  // Observe real frames rather than advancing the model in isolation.
  const victory = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        let wonAt;
        const deadline = performance.now() + 45000;
        const frame = () => {
          const s = window.__idle.snapshot();
          if (s.phase === "recompensas" && wonAt === undefined)
            wonAt = performance.now();
          if (wonAt !== undefined && s.phase === "explorando")
            return resolve({
              delay: performance.now() - wonAt,
              kills: s.kills,
            });
          if (performance.now() > deadline)
            return reject(Error("Victory timeout"));
          requestAnimationFrame(frame);
        };
        frame();
      }),
  );
  assert.ok(victory.delay <= 800, JSON.stringify(victory));
  results.victory = victory;
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "explorando",
  );
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10001" &&
      !window.__idle.snapshot().loadingActor,
  );
  await page.setViewportSize({ width: 350, height: 500 });
  await page.waitForFunction(
    () => document.querySelector(".world-minimap").dataset.compact === "true",
  );
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.waitForFunction(
    () => document.querySelector(".world-minimap").dataset.compact === "false",
  );
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  results.compactResize = true;
  await page.evaluate(() => {
    const canvas = document.querySelector("#canvas canvas"),
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl.getExtension("WEBGL_lose_context");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 500);
  });
  await page.waitForFunction(
    () => !document.getElementById("game-loading").hidden,
  );
  await ready();
  assert.equal(await page.locator(".world-minimap").count(), 1);
  assert.deepEqual((await saved()).equipmentPresets, sets);
  results.graphicsRecovery = true;
  await page.screenshot({ path: "reports/navigation-presets.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "reports/navigation-presets-validation.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
  await context.close();
} finally {
  await browser.close();
}
