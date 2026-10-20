import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const errors = [],
  loadErrors = [],
  results = [];
try {
  for (const character of ["naruto", "sasuke", "sakura"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        /Failed to process|decode|Texture/.test(m.text())
      )
        loadErrors.push(m.text());
    });
    const urls = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("http://127.0.0.1:5178");
    await page.locator("#new").click();
    await page.locator(`[data-character="${character}"]`).click();
    await page.waitForFunction(() => window.__idle?.snapshot());
    await page.locator("#sound").check();
    await page.locator("#music").check();
    await page.locator("#pause").click();
    await page.waitForTimeout(100);
    const atStart = await page.evaluate(() => window.__idle.snapshot());
    assert.equal(atStart.npcIds.length, 2);
    assert.ok(atStart.companion);
    assert.notEqual(atStart.enemyId, "training-dummy");
    const initialEntities = new Set(
      urls
        .filter(
          (url) =>
            url.includes("/assets/characters/") &&
            !url.includes("/characters/index.json"),
        )
        .map((url) => new URL(url).pathname.split("/")[3]),
    );
    assert.ok(
      initialEntities.size <= 9,
      "catalogue eagerly loaded all entities",
    );
    if (character === "naruto") {
      const choose = async (id, role) => {
        await page.locator("#library").click();
        await page.getByLabel("Filtrar coleção").selectOption("all");
        await page.locator(".entity-library").waitFor({ state: "visible" });
        assert.ok((await page.locator(".entity-card").count()) <= 24);
        await page
          .getByRole("searchbox", { name: "Buscar personagem" })
          .fill(id);
        await page
          .locator(`[data-entity="${id}"] [data-role="${role}"]`)
          .click();
        await page.locator(".entity-library").waitFor({ state: "hidden" });
      };
      await choose("11900708", "npc");
      await choose("11001201", "companion");
      await choose("11000701", "enemy");
      const chosen = await page.evaluate(() => window.__idle.snapshot());
      assert.ok(chosen.npcIds.includes("11900708"));
      assert.equal(chosen.companion.id, "11001201");
      assert.equal(chosen.enemyId, "11000701");
      await page.locator("#library").click();
      await page.getByLabel("Filtrar coleção").selectOption("all");
      await page
        .getByRole("searchbox", { name: "Buscar personagem" })
        .fill("Kakashi");
      assert.ok((await page.locator(".entity-card").count()) > 0);
      await page.screenshot({
        path: "reports/entity-library.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Fechar biblioteca" }).click();
      await page.reload();
      await page.locator("#continue").click();
      await page.waitForFunction(() => window.__idle?.snapshot());
      const restored = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(restored.companion.id, "11001201");
      assert.equal(restored.enemyId, "11000701");
      assert.ok(restored.npcIds.includes("11900708"));
      assert.equal(await page.locator("#sound").isChecked(), true);
    }
    await page.locator("#pause").click();
    await page.waitForFunction(
      () => window.__idle.snapshot().phase === "combatendo",
      {},
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () =>
        window.__idle.snapshot().animation?.startsWith("battle-SP_skill") &&
        window.__idle.snapshot().presentation.activeEffects > 0,
      {},
      { timeout: 10000 },
    );
    await page.waitForTimeout(190);
    await page.locator("#pause").click();
    await page.waitForTimeout(80);
    const paused = await page.evaluate(() => window.__idle.snapshot());
    await page.waitForTimeout(300);
    const still = await page.evaluate(() => window.__idle.snapshot());
    assert.deepEqual(
      paused.presentation.effectFrames,
      still.presentation.effectFrames,
    );
    assert.equal(
      paused.presentation.soundsPlayed,
      still.presentation.soundsPlayed,
    );
    assert.ok(paused.presentation.effectsPlayed >= 3);
    assert.ok(paused.presentation.soundsPlayed > 0);
    assert.equal(paused.presentation.audioUnlocked, true);
    assert.ok(paused.companion.walkable);
    assert.ok(paused.walkable && paused.enemyWalkable);
    await page.evaluate(() => (document.querySelector("aside").scrollTop = 0));
    await page.screenshot({
      path: `reports/${character}-jutsu.png`,
      fullPage: true,
    });
    await page.locator("#sound").uncheck();
    assert.equal(await page.locator("#sound").isChecked(), false);
    await page.locator("#pause").click();
    await page.waitForFunction(
      () => window.__idle.snapshot().kills > 0,
      {},
      { timeout: 6000 },
    );
    results.push({
      character,
      initialEntities: initialEntities.size,
      nativeEnemy: true,
      npcs: true,
      companion: true,
      jutsuEffects: paused.presentation.effectsPlayed,
      originalSounds: paused.presentation.soundsPlayed,
      pauseFreezesEffectsAndSound: true,
      audioUnlocked: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(loadErrors, []);
  await fs.writeFile(
    "reports/entity-presentation-validation.json",
    JSON.stringify({ results, errors, loadErrors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors, loadErrors }, null, 2));
} finally {
  await browser.close();
}
