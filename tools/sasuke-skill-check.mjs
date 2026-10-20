import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  requests = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 960 },
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => requests.push(request.url()));
  const base = process.env.BASE_URL || "http://127.0.0.1:5194";
  await page.goto(base + "/admin");
  await page.getByLabel("Senha de administrador").fill("admin");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Personagens", exact: true }).click();
  await page.getByLabel("Buscar no acervo").fill("11000211");
  await page.getByRole("button", { name: "Ver ações e animações" }).click();
  for (const name of ["SP_skill1", "SP_skill2"]) {
    await page
      .locator(".animation-card")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll("dialog p")].some(
          (p) =>
            p.textContent.includes(name) &&
            p.textContent.includes("reconstrução fiel aguarda"),
        ),
      name,
    );
    await page.screenshot({ path: `reports/sasuke-${name}-clean-preview.png` });
  }
  await page.goto(base);
  await page.locator("#new").click();
  await page.locator('[data-character="sasuke"]').click();
  await page.waitForFunction(
    () =>
      window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
  );
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
  const skill = await page.evaluate(() => window.__idle.snapshot());
  assert.equal(skill.heroSpriteInstances, 1);
  assert.ok(skill.presentation.effectsPlayed > 0);
  await page.screenshot({ path: "reports/sasuke-skill-clean-combat.png" });
  await page.waitForFunction(() => window.__idle.snapshot().kills >= 1);
  assert.equal(
    requests.some((url) =>
      /sasuke-11000211\/battle\/SP_skill[12]\.png/.test(url),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    adminPreviews: ["SP_skill1", "SP_skill2"],
    temporaryMappingDisclosed: true,
    corruptedAtlasesNotLoaded: true,
    singleHero: true,
    chidoriEffect: true,
    victory: true,
    requiresOriginalSwf: true,
    errors,
  };
  await writeFile(
    "reports/sasuke-skill-browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
