import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--renderer-process-limit=1",
  ],
});
const errors = [],
  missing = [],
  models = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1180, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400 && /\/assets\//.test(r.url())) missing.push(r.url());
  });
  await page.goto(base + "/admin");
  await page.locator('input[name="password"]').fill("admin");
  await page.locator("form button").click();
  await page.locator('[data-section="characters"]').click();
  for (const id of [
    "11001651",
    "11000461",
    "11001211",
    "19000301",
    "10000201",
    "11010101",
  ]) {
    await page.getByLabel("Buscar no acervo").fill(id);
    const promise = page.waitForResponse((r) =>
      r.url().endsWith("/api/admin/characters/" + id),
    );
    await page
      .getByRole("button", { name: "Ver ações e animações", exact: true })
      .click();
    const manifest = await (await promise).json();
    const a = manifest.modes.battle.animations.A_1hit;
    const dialog = page.locator(".admin-detail");
    await dialog.waitFor();
    await dialog.locator(".animation-card").filter({ has: page.getByText("A_1hit", { exact: true }) }).click();
    await page.waitForFunction(frames => [...document.querySelectorAll(".admin-detail p")].some(p => p.textContent.includes(frames + " quadros únicos") && p.textContent.includes("A_1hit")), a.frames);
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".admin-detail canvas");
      if (!canvas) return false;
      const bytes = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) return true;
      return false;
    });
    assert.ok(
      (await dialog.innerText()).includes(a.frames + " quadros únicos"),
    );
    assert.equal(a.rendererRevision, "external-symbol-namespace-v1");
    models.push({
      id,
      name: manifest.name,
      action: "A_1hit",
      frames: a.frames,
      canvasVisible: true,
    });
    await page.screenshot({ path: `reports/catalog-admin-${id}.png` });
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
  }
  const noPhaser = await page.evaluate(
    () =>
      !performance
        .getEntriesByType("resource")
        .some((r) => /phaser/.test(r.name)),
  );
  assert.equal(noPhaser, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  const report = {
    checkedAt: new Date().toISOString(),
    base,
    policy: "one browser, one canvas at a time",
    models,
    noPhaser,
    errors,
    missingAssets: missing,
  };
  await fs.writeFile(
    "reports/catalog-admin-browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
