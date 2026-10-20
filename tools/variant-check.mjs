import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
  page.on("console", (m) => {
    if (m.type() === "error" && /Failed to process|Texture/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:5178");
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  await page.locator("#pause").click();
  const choose = async (id, role) => {
    await page.locator("#library").click();
    await page.getByLabel("Filtrar coleção").selectOption("all");
    await page.getByRole("searchbox", { name: "Buscar personagem" }).fill(id);
    await page.locator(`[data-entity="${id}"] [data-role="${role}"]`).click();
    await page.locator(".entity-library").waitFor({ state: "hidden" });
  };
  for (const id of [
    "13000101",
    "13000301",
    "13000401",
    "13000501",
    "13000601",
  ]) {
    await choose(id, "enemy");
    const state = await page.evaluate(() => window.__idle.snapshot());
    assert.equal(state.enemyId, id);
    assert.ok(state.enemyWalkable);
    assert.ok(state.actorCache.residentEntities <= 12);
  }
  await choose("13000301", "npc");
  await choose("11900716", "npc");
  await choose("13000101", "enemy");
  await page.locator("#pause").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().phase === "combatendo",
    {},
    { timeout: 30000 },
  );
  await page.locator("#pause").click();
  await page.evaluate(() => (document.querySelector("aside").scrollTop = 0));
  await page.screenshot({
    path: "reports/recovered-summons.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const result = {
    vectorSummons: 5,
    nonstandardNpcActions: true,
    combatStarted: true,
    sourcePosesOnlyMarkedPartial: true,
    errors,
  };
  await fs.writeFile(
    "reports/entity-variant-validation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
