// Serial browser regression: one game scene, followed by the lightweight arena.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
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
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("roster-fixture")) return;
    // A genuine old-format save: only the active hero has accumulated progress.
    localStorage.setItem(
      "folha-idle-v1",
      JSON.stringify({
        version: 1,
        character: "naruto",
        level: 6,
        xp: 17,
        upgrades: 2,
        coins: 200,
        inventory: { "kunai-treino": 1 },
        equipment: { weapon: "kunai-treino" },
        area: 0,
        kills: 0,
        defeats: 0,
        lastSaved: Date.now(),
        sound: false,
        paused: false,
        location: "10001",
        autoHunt: false,
        partyIds: ["11000201"],
        questClaims: [],
        visitedMaps: ["10001"],
        collection: ["11000101", "11000201", "11000301"],
      }),
    );
    sessionStorage.setItem("roster-fixture", "1");
  });
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("folha-idle-v1")));
  const ready = async () => {
    await page.locator("#continue").click();
    await page.waitForFunction(() => window.__idle?.snapshot());
  };
  await page.goto(base);
  await ready();
  let s = await saved();
  assert.equal(s.characterProgress["11000101"].level, 6);
  assert.deepEqual(s.characterProgress["11000211"], {
    level: 1,
    xp: 0,
    upgrades: 0,
    equipment: {},
  });
  assert.deepEqual(s.partyIds, []);
  await page.locator("#progression").click();
  await page.locator('[data-tab="collection"]').click();
  const sasuke = page.locator('[data-character-id="11000211"]');
  await sasuke.getByRole("button", { name: "Ver atributos" }).click();
  await page.getByLabel("Personagem da ficha").waitFor();
  assert.equal(
    await page.getByLabel("Personagem da ficha").inputValue(),
    "11000211",
  );
  assert.match(await page.locator(".attribute-summary").innerText(), /Nível 1/);
  const before = await page.evaluate(() => window.__idle.snapshot());
  await page.getByRole("button", { name: "Treinar este personagem" }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("folha-idle-v1")).characterProgress[
        "11000211"
      ].upgrades === 1,
  );
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).speed,
    before.speed,
  );
  await page.getByLabel("Personagem da ficha").selectOption("11000301");
  await page.getByRole("button", { name: "Treinar este personagem" }).waitFor();
  assert.match(
    await page.locator(".attribute-summary").innerText(),
    /0 treinos/,
  );
  await page.screenshot({ path: "reports/character-progress-sheet.png" });
  await page.locator('[data-tab="collection"]').click();
  assert.equal(await page.locator('[data-character-id="11000201"]').count(), 0);
  await sasuke
    .getByRole("button", { name: "Jogar com este personagem" })
    .click();
  await page.waitForFunction(
    () =>
      window.__idle?.snapshot().activeEntityId === "11000211" &&
      document.getElementById("game-loading").hidden,
  );
  assert.equal((await saved()).level, 1);
  assert.equal((await saved()).upgrades, 1);
  assert.equal(await page.locator("#party").isVisible(), false);
  await page.locator("#canvas canvas").focus();
  const position = await page.evaluate(() => window.__idle.snapshot().hero);
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  const moved = await page.evaluate(() => window.__idle.snapshot().hero);
  assert.ok(Math.hypot(moved.x - position.x, moved.y - position.y) > 10);
  await page.screenshot({ path: "reports/character-switch-sasuke.png" });
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
  await page.locator("#cast-skill").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().animation === "battle-SP_skill1",
  );
  assert.ok(
    (await page.evaluate(() => window.__idle.snapshot())).presentation
      .effectsPlayed > 0,
  );
  await page.waitForFunction(() => window.__idle.snapshot().kills >= 4, null, {
    timeout: 60000,
  });
  // Returning to the lobby stops XP gain before comparing persistence.
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "explorando",
  );
  await page.locator("#return-lobby").click();
  await page.waitForFunction(() => window.__idle.snapshot().mapId === "10001");
  s = await saved();
  assert.ok(s.level >= 2);
  assert.equal(s.characterProgress["11000101"].level, 6);
  assert.equal(s.characterProgress["11000101"].xp, 17);
  assert.ok(s.characterProgress["11000211"].level >= 2);
  assert.equal(s.characterProgress["11000301"].xp, 0);
  assert.equal(s.characterProgress["11000301"].level, 1);
  assert.equal(s.characterProgress["11000211"].upgrades, 1);
  assert.equal(s.upgrades, 1);
  const roster = structuredClone(s.characterProgress);
  await page.reload();
  await ready();
  assert.deepEqual((await saved()).characterProgress, roster);
  assert.equal((await saved()).activeEntityId, "11000211");
  await page.locator("#progression").click();
  await page.locator('[data-tab="collection"]').click();
  await page
    .locator('[data-character-id="11000101"]')
    .getByRole("button", { name: "Jogar com este personagem" })
    .click();
  await page.waitForFunction(
    () =>
      window.__idle?.snapshot().activeEntityId === "11000101" &&
      document.getElementById("game-loading").hidden,
  );
  assert.equal((await saved()).level, 6);
  assert.equal((await saved()).upgrades, 2);
  assert.equal((await saved()).equipment.weapon, "kunai-treino");
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  await page.locator("#arena").click();
  await page.getByLabel("Modo do duelo").selectOption("journey");
  assert.match(
    await page.locator("[data-build-preview]").innerText(),
    /nível 6/,
  );
  await page.getByLabel("Ninja da arena").selectOption("sasuke");
  assert.match(
    await page.locator("[data-build-preview]").innerText(),
    new RegExp(`nível ${roster["11000211"].level} · 1 treinos`),
  );
  await page.locator("[data-create]").click();
  await page.locator("[data-code]").filter({ hasText: "Jornada" }).waitFor();
  const session = await page.evaluate(() =>
    fetch("/api/arena/session").then((r) => r.json()),
  );
  assert.deepEqual(session.room.players[0].loadout, {
    level: roster["11000211"].level,
    upgrades: 1,
    equipment: {},
  });
  await page.locator("[data-leave]").click();
  await page.locator(".arena-panel [data-close]").click();
  // The dedicated arena route must use the same individual loadout.
  await page.goto(base + "/arena");
  await page.locator("#open-arena").click();
  await page.getByLabel("Modo do duelo").selectOption("journey");
  await page.getByLabel("Ninja da arena").selectOption("sakura");
  assert.match(
    await page.locator("[data-build-preview]").innerText(),
    /nível 1 · 0 treinos/,
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    legacyMigration: true,
    individualTraining: true,
    activeCharacterLevelsUp: true,
    benchedCharacterUnchanged: true,
    switchingAndRestoring: true,
    blueSasuke: true,
    partyDisabled: true,
    reloadPreservesRoster: true,
    arenaSelectedCharacter: true,
    dedicatedArenaRoute: true,
    roster,
    errors,
  };
  await writeFile(
    "reports/character-progress-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
