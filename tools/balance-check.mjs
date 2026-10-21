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
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(
    () => !document.getElementById("continue").disabled,
  );
  await page.evaluate(async () => {
    const { fresh } = await import("/src/model.ts");
    const { newCharacterProgress } = await import(
      "/src/progression/character-progress.ts"
    );
    const save = fresh("naruto");
    save.level = 12;
    save.coins = 10000;
    for (const id of ["11001201", "11000411", "11002001", "11000801"]) {
      save.collection.push(id);
      save.characterProgress[id] = { ...newCharacterProgress(), level: 5 };
    }
    save.inventory["kunai-treino"] = 1;
    save.equipment = { weapon: "kunai-treino" };
    localStorage.setItem("folha-idle-v1", JSON.stringify(save));
  });
  await page.locator("#continue").click();
  const ready = () =>
    page.waitForFunction(
      () =>
        !!window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
    );
  await ready();
  await page.locator("#progression").click();
  await page.locator('[data-tab="shop"]').click();
  assert.equal(await page.locator("[data-item]").count(), 22);
  await page.locator("[data-gear-slot]").selectOption("weapon");
  await page.locator("[data-gear-path]").selectOption("chakra");
  assert.equal(await page.locator("[data-item]").count(), 2);
  assert.match(
    await page.locator('[data-comparison="selo-canalizador-2"]').innerText(),
    /Ataque -/,
  );
  await page.locator('[data-item="selo-canalizador-2"] button').click();
  await page.locator('[data-tab="inventory"]').click();
  await page.locator('[data-item="selo-canalizador-2"] button').click();
  await page.locator(".progression-panel [data-close]").click();
  assert.ok(
    await page.evaluate(
      () => window.__idle.snapshot().attributes.ninjutsu > 40,
    ),
  );
  results.shopPathsAndEquipment = true;
  await page.locator("#library").click();
  await page.locator('[data-character-id="11001201"] button').last().click();
  await ready();
  assert.equal(
    await page.evaluate(() => window.__idle.snapshot().heroStyle),
    "guardian",
  );
  await page.locator("#progression").click();
  await page.locator('[data-tab="attributes"]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-recruit-profile="guardian"]'),
  );
  assert.match(await page.locator("[data-recruit-profile]").innerText(), /35%/);
  await page.locator(".progression-panel [data-close]").click();
  results.recruitIdentityAndProgress = true;
  await page.locator("#maps").click();
  assert.equal(
    await page.locator("[data-difficulty-picker] option:disabled").count(),
    2,
  );
  await page.locator("[data-difficulty-picker]").selectOption("1");
  await page.locator('[data-map="10005"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10005" &&
      !window.__idle.snapshot().loadingActor,
  );
  let state = await page.evaluate(() => window.__idle.snapshot());
  assert.equal(state.enemies.filter((enemy) => enemy.elite).length, 1);
  assert.ok(state.enemies.some((enemy) => enemy.kind === "brute"));
  assert.match(
    await page.locator("#cast-skill").innerText(),
    /Postura defensiva/,
  );
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(() => window.__idle.snapshot().kills > 0, null, {
    timeout: 45000,
  });
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "explorando",
  );
  assert.ok(await page.locator(".enemy-profile").innerText());
  await page.screenshot({ path: "reports/balance-forest.png" });
  const saveBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(saveBefore.activeEntityId, "11001201");
  assert.equal(saveBefore.characterProgress["11000101"].level, 12);
  await page.locator("#return-lobby").click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10001" &&
      !window.__idle.snapshot().loadingActor,
  );
  await page.reload();
  await page.locator("#continue").click();
  await ready();
  assert.equal(
    await page.evaluate(() => window.__idle.snapshot().activeEntityId),
    "11001201",
  );
  results.enemiesEliteCombatAndReload = true;
  await page.locator("[data-language]").selectOption("en");
  await ready();
  await page.locator("#progression").click();
  await page.locator('[data-tab="attributes"]').click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-recruit-profile]")
      ?.textContent.includes("Guardian"),
  );
  await page.locator('[data-tab="shop"]').click();
  assert.match(
    await page.locator('[data-item="lamina-assalto-2"] h3').innerText(),
    /Assault blade/,
  );
  await page.locator(".progression-panel [data-close]").click();
  await page.locator("[data-language]").selectOption("es");
  await ready();
  await page.locator("#progression").click();
  await page.locator('[data-tab="attributes"]').click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-recruit-profile]")
      ?.textContent.includes("Guardián"),
  );
  results.translations = true;
  await page.locator(".progression-panel [data-close]").click();
  await page.locator("#library").click();
  await page.locator('[data-character-id="11000101"] button').last().click();
  await ready();
  await page.locator("#maps").click();
  await page.locator("[data-difficulty-picker]").selectOption("1");
  await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(
    () =>
      window.__idle.snapshot().mapId === "10006" &&
      !window.__idle.snapshot().loadingActor,
  );
  let eliteVictory = false,
    eliteEngaged = false;
  for (let i = 0; i < 120; i++) {
    const current = await page.evaluate(() => window.__idle.snapshot());
    const elite = current.enemies.find((enemy) => enemy.elite);
    if (!elite.alive) {
      eliteVictory = true;
      break;
    }
    if (current.phase === "explorando")
      await page.evaluate(() => {
        const state = window.__idle.snapshot(),
          elite = state.enemies.find((enemy) => enemy.elite);
        window.__idle.walkTo(
          window.__idle.navigation().nearest({ x: elite.x, y: elite.y }),
        );
      });
    if (
      !eliteEngaged &&
      current.phase === "combatendo" &&
      current.enemyProfile.elite
    ) {
      eliteEngaged = true;
      await page.screenshot({ path: "reports/balance-elite.png" });
    }
    await page.waitForTimeout(500);
  }
  assert.equal(eliteEngaged, true);
  assert.equal(eliteVictory, true);
  const finalSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.ok(finalSave.coins > saveBefore.coins - 100);
  results.actualEliteEncounterAndVictory = true;
  assert.deepEqual(errors, []);
  await writeFile(
    "reports/balance-browser-validation.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), results, errors },
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
        .screenshot({ path: "reports/balance-failure.png" })
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
