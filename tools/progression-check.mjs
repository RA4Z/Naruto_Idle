import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const errors = [];
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("http://127.0.0.1:5178");
  await p.locator("#new").click();
  await p.locator('[data-character="naruto"]').click();
  await p.waitForFunction(() => window.__idle?.snapshot());
  await p.addInitScript(() => {
    const raw = localStorage.getItem("folha-idle-v1");
    if (raw && !sessionStorage.getItem("economy-fixture")) {
      const s = JSON.parse(raw);
      s.coins = 200;
      s.inventory.fragmento = 3;
      s.visitedMaps = ["10001", "10005"];
      localStorage.setItem("folha-idle-v1", JSON.stringify(s));
      sessionStorage.setItem("economy-fixture", "1");
    }
  });
  await p.reload();
  await p.locator("#continue").click();
  await p.waitForFunction(() => window.__idle?.snapshot());
  await p.locator("#progression").click();
  await p.locator('[data-tab="shop"]').click();
  await p
    .getByRole("button", { name: "Comprar · 45 moedas", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Comprar · 65 moedas", exact: true })
    .click();
  await p.locator('[data-tab="inventory"]').click();
  const item = (name) =>
    p
      .locator(".progress-card")
      .filter({ has: p.getByRole("heading", { name, exact: true }) });
  await item("Kunai de treino")
    .getByRole("button", { name: "Equipar", exact: true })
    .click();
  await item("Amuleto de chakra")
    .getByRole("button", { name: "Equipar", exact: true })
    .click();
  await p.locator('[data-tab="quests"]').click();
  const quest = p
    .locator(".progress-card")
    .filter({
      has: p.getByRole("heading", { name: "Além dos portões", exact: true }),
    });
  await quest
    .getByRole("button", { name: "Receber recompensa", exact: true })
    .click();
  assert.equal(
    await quest
      .getByRole("button", { name: "Recebida", exact: true })
      .isDisabled(),
    true,
  );
  await p.screenshot({
    path: "reports/quests-and-progression.png",
    fullPage: true,
  });
  await p.locator(".progression-panel [data-close]").click();
  let saved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(saved.coins, 110);
  assert.equal(saved.xp, 15);
  assert.equal(saved.equipment.weapon, "kunai-treino");
  assert.equal(saved.equipment.charm, "amuleto-chakra");
  assert.equal(
    (await p.evaluate(() => window.__idle.snapshot())).maxChakra,
    125,
  );
  await p.locator("#library").click();
  await p
    .getByRole("searchbox", { name: "Buscar personagem" })
    .fill("11001201");
  await p
    .getByRole("button", {
      name: "Recrutar · 60 moedas + 3 fragmentos",
      exact: true,
    })
    .click();
  await p.locator(".entity-library").waitFor({ state: "hidden" });
  saved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(saved.coins, 50);
  assert.equal(saved.inventory.fragmento, 0);
  assert.ok(saved.collection.includes("11001201"));
  assert.deepEqual(saved.partyIds, []);
  await p.locator("#progression").click();
  await p.locator('[data-tab="collection"]').click();
  await p
    .locator(".progress-card")
    .filter({ has: p.getByRole("heading", { name: "Hinata", exact: true }) })
    .getByRole("button", { name: "Convidar para grupo", exact: true })
    .click();
  await p.locator(".progression-panel").waitFor({ state: "hidden" });
  const state = await p.evaluate(() => window.__idle.snapshot());
  assert.equal(state.party.length, 1);
  assert.equal(state.party[0].visible, true);
  assert.ok(state.party[0].walkable);
  assert.ok(!state.npcIds.includes("11001201"));
  await p.reload();
  await p.locator("#continue").click();
  await p.waitForFunction(() => window.__idle?.snapshot());
  saved = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("folha-idle-v1")),
  );
  assert.equal(saved.coins, 50);
  assert.equal(saved.equipment.weapon, "kunai-treino");
  assert.ok(saved.questClaims.includes("forest-visit"));
  assert.equal(
    (await p.evaluate(() => window.__idle.snapshot())).party.length,
    1,
  );
  assert.deepEqual(errors, []);
  const report = {
    shopTransactions: true,
    equipmentChangesStats: true,
    chakraCapacity: 125,
    questClaimOnce: true,
    recruitmentCostCorrect: true,
    collectionSeparateFromParty: true,
    partyVisibleAndWalkable: true,
    noDuplicateResident: true,
    persistentSave: true,
    errors,
  };
  await fs.writeFile(
    "reports/progression-browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
