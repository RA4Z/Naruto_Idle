import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 960 },
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  const base = process.env.BASE_URL || "http://127.0.0.1:5194";
  const ready = (id) =>
    page.waitForFunction(
      (id) =>
        window.__idle?.snapshot().activeEntityId === id &&
        document.getElementById("game-loading").hidden,
      id,
    );
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("folha-idle-v1")));
  await page.goto(base);
  await page.locator("#new").click();
  assert.match(
    await page.locator('[data-character="sasuke"] img').getAttribute("src"),
    /sasuke-11000211/,
  );
  await page.locator('[data-character="sasuke"]').click();
  await ready("11000211");
  assert.equal((await saved()).collection.includes("11000201"), false);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("selection-funding")) return;
    const raw = localStorage.getItem("folha-idle-v1");
    if (!raw) return;
    const s = JSON.parse(raw);
    s.coins = 200;
    s.inventory.fragmento = 3;
    localStorage.setItem("folha-idle-v1", JSON.stringify(s));
    sessionStorage.setItem("selection-funding", "1");
  });
  await page.reload();
  await page.locator("#continue").click();
  await ready("11000211");
  await page.locator("#library").click();
  await page.getByLabel("Buscar personagem").fill("11001201");
  const card = page.locator('[data-entity="11001201"]');
  await card.locator('[data-role="companion"]').click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")).collection.includes(
      "11001201",
    ),
  );
  assert.equal((await saved()).coins, 140);
  await page.locator("#library").click();
  await page.getByLabel("Buscar personagem").fill("11001201");
  await card.locator('[data-role="companion"]').click();
  await ready("11001201");
  assert.equal((await saved()).coins, 140);
  assert.equal((await saved()).level, 1);
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).npcs.some(
      (n) => n.id === "11001201",
    ),
    false,
  );
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  await page.locator("#maps").click();
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "combatendo",
  );
  await page.locator("#progression").click();
  await page.locator('[data-tab="collection"]').click();
  await page
    .locator('[data-character-id="11000301"]')
    .getByRole("button", { name: "Jogar com este personagem" })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('.progression-panel [role="status"]')
      .textContent.includes("Conclua o encontro"),
  );
  assert.equal((await saved()).activeEntityId, "11001201");
  await page.locator(".progression-panel [data-close]").click();
  await page.waitForFunction(() => window.__idle.snapshot().kills >= 1, null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "explorando",
  );
  await page.locator("#return-lobby").click();
  await page.waitForFunction(() => window.__idle.snapshot().mapId === "10001");
  assert.ok((await saved()).characterProgress["11001201"].xp > 0);
  assert.equal((await saved()).characterProgress["11000211"].xp, 0);
  // A failed switch must leave the previous successful save intact.
  await page.route("**/sakura-kid/world/idle_0.png", (route) => route.abort());
  await page.locator("#progression").click();
  await page.locator('[data-tab="collection"]').click();
  await page
    .locator('[data-character-id="11000301"]')
    .getByRole("button", { name: "Jogar com este personagem" })
    .click();
  await page.locator("#loading-retry").waitFor({ state: "visible" });
  assert.equal((await saved()).activeEntityId, "11001201");
  await page.unroute("**/sakura-kid/world/idle_0.png");
  await page.locator("#loading-retry").click();
  await ready("11000301");
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  assert.equal((await saved()).activeEntityId, "11000301");
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    initialBlueSasuke: true,
    retiredOutfitNotGranted: true,
    recruitThenPlay: true,
    genericVictory: true,
    noDuplicateNpc: true,
    combatSwitchRejected: true,
    inactiveXpUnchanged: true,
    failedSwitchPreservesSave: true,
    retrySwitch: true,
    singleCanvas: true,
    errors,
  };
  await writeFile(
    "reports/character-selection-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
