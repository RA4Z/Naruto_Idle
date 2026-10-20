import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const errors = [],
  missing = [];
const results = {};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => {
    errors.push(String(e));
    console.log("PAGEERROR", String(e));
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) console.log("NAV", f.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/assets/"))
      missing.push(r.url());
  });
  await page.goto("http://127.0.0.1:5178");
  await page.locator("#new").click();
  await page.locator('[data-character="naruto"]').click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  let before = await page.evaluate(() => window.__idle.snapshot());
  assert.equal(before.phase, "lobby");
  assert.equal(before.companion, null);
  assert.equal(before.enemies.length, 0);
  assert.equal(before.zoom, 3.1);
  await page.evaluate(() => window.__idle.advance(3500));
  let after = await page.evaluate(() => window.__idle.snapshot());
  assert.equal(after.kills, 0);
  assert.deepEqual(after.hero, before.hero);
  assert.ok(
    after.npcs.some(
      (n, i) => Math.hypot(n.x - before.npcs[i].x, n.y - before.npcs[i].y) > 8,
    ),
  );
  await page.evaluate(() => window.__idle.walkTo({ x: 595, y: 385 }));
  before = await page.evaluate(() => window.__idle.snapshot());
  await page.evaluate(() => window.__idle.advance(500));
  after = await page.evaluate(() => window.__idle.snapshot());
  const distance = Math.hypot(
    after.hero.x - before.hero.x,
    after.hero.y - before.hero.y,
  );
  assert.ok(distance > 38 && distance < 55, "walking speed " + distance);
  assert.ok(after.walkable);
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("folha-idle-v1") || "null");
    if (s && !s.collection.includes("11001201")) {
      s.collection.push("11001201");
      localStorage.setItem("folha-idle-v1", JSON.stringify(s));
    }
  });
  await page.reload();
  await page.locator("#continue").click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  await page.locator("#library").click();
  await page
    .getByRole("searchbox", { name: "Buscar personagem" })
    .fill("11001201");
  const preview = page.locator('[data-entity="11001201"] img');
  await preview.waitFor();
  assert.match(await preview.getAttribute("src"), /preview\.png$/);
  await page
    .locator('[data-entity="11001201"] [data-role="companion"]')
    .click();
  await page.locator(".entity-library").waitFor({ state: "hidden" });
  after = await page.evaluate(() => window.__idle.snapshot());
  assert.equal(after.party.length, 1);
  assert.ok(
    !after.npcIds.includes("11001201"),
    "resident duplicated after joining",
  );
  await page.evaluate(() => {
    window.__idle.walkTo({ x: 310, y: 205 });
    window.__idle.advance(1800);
  });
  after = await page.evaluate(() => window.__idle.snapshot());
  assert.ok(after.party.every((p) => p.walkable));
  assert.ok(after.walkable);
  await page.locator('[data-dismiss="11001201"]').click();
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).party.length,
    0,
  );
  for (const id of ["10005", "10006", "10008", "10001"]) {
    await page.locator("#maps").click();
    await page.locator(`[data-map="${id}"]`).click();
    await page
      .locator(".map-library")
      .waitFor({ state: "hidden", timeout: 20000 });
    before = await page.evaluate(() => window.__idle.snapshot());
    assert.equal(before.mapId, id);
    assert.ok(before.walkable);
    if (id !== "10001") {
      assert.equal(before.enemies.length, 6);
      await page.evaluate(() => window.__idle.advance(2500));
      after = await page.evaluate(() => window.__idle.snapshot());
      assert.ok(after.enemies.every((e) => e.walkable));
      assert.ok(
        after.enemies.some(
          (e, i) =>
            Math.hypot(e.x - before.enemies[i].x, e.y - before.enemies[i].y) >
            5,
        ),
      );
    }
    await page.screenshot({
      path: `reports/world-map-${id}.png`,
      fullPage: true,
    });
  }
  await page.locator("#maps").click();
  await page.locator('[data-map="10005"]').click();
  await page.locator(".map-library").waitFor({ state: "hidden" });
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(
    () => window.__idle.snapshot().kills >= 1,
    {},
    { timeout: 30000 },
  );
  after = await page.evaluate(() => window.__idle.snapshot());
  assert.ok(after.kills >= 1, "no combat reward");
  assert.ok(after.walkable);
  assert.ok(after.enemies.some((e) => !e.alive) || after.kills > 1);
  assert.ok(after.presentation.effectsPlayed > 0);
  // Exit combat using simulated time, then return through the real travel button.
  await page.locator("#auto-hunt").click();
  for (let i = 0; i < 5; i++) {
    after = await page.evaluate(() => window.__idle.snapshot());
    if (after.phase === "explorando") break;
    await page.waitForTimeout(1500);
  }
  await page.locator("#return-lobby").click();
  await page.waitForFunction(() => window.__idle.snapshot().mapId === "10001");
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).enemies.length,
    0,
  );
  await page.reload();
  await page.locator("#continue").click();
  await page.waitForFunction(() => window.__idle?.snapshot());
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).mapId,
    "10001",
  );
  assert.equal(
    (await page.evaluate(() => window.__idle.snapshot())).party.length,
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#maps").click();
  assert.equal(
    await page
      .locator(".map-library")
      .evaluate((e) => e.scrollWidth > e.clientWidth + 2),
    false,
  );
  await page.keyboard.press("Escape");
  Object.assign(results, {
    safeLobby: true,
    npcsRoam: true,
    speed: 96,
    zoom: 3.1,
    fullBodyPreviews: true,
    optionalParty: true,
    noDuplicateResident: true,
    fourMapsAndReturn: true,
    sixRoamingEnemiesPerMap: true,
    combatAndJutsu: true,
    saves: true,
    mobile: true,
  });
  await page.close();
  const admin = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  admin.on("pageerror", (e) => errors.push(String(e)));
  await admin.goto("http://127.0.0.1:5178/admin");
  await admin.getByLabel("Senha de administrador").fill("wrong");
  await admin.getByRole("button", { name: "Entrar", exact: true }).click();
  await admin
    .getByRole("status")
    .filter({ hasText: "Senha incorreta" })
    .waitFor();
  await admin.getByLabel("Senha de administrador").fill("admin");
  await admin.getByRole("button", { name: "Entrar", exact: true }).click();
  await admin.locator('[data-section="characters"]').waitFor();
  await admin.locator('[data-section="characters"]').click();
  await admin
    .getByRole("textbox", { name: "Buscar no acervo" })
    .fill("Kakashi");
  await admin
    .getByRole("button", { name: "Ver ações e animações" })
    .first()
    .click();
  await admin.locator(".admin-detail canvas").waitFor();
  await admin.waitForTimeout(350);
  await admin.screenshot({
    path: "reports/admin-character-viewer.png",
    fullPage: true,
  });
  await admin.getByRole("button", { name: "Fechar", exact: true }).click();
  for (const section of ["maps", "effects", "sounds", "files", "overview"]) {
    await admin.locator(`[data-section="${section}"]`).click();
    await admin.waitForTimeout(160);
  }
  await admin.screenshot({
    path: "reports/admin-overview.png",
    fullPage: true,
  });
  await admin.locator("[data-logout]").click();
  await admin.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  Object.assign(results, {
    adminLogin: true,
    adminTabs: true,
    animatedBodyViewer: true,
    adminLogout: true,
  });
  await admin.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  results.errors = errors;
  results.missingAssets = missing;
  await fs.writeFile(
    "reports/world-admin-validation.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
