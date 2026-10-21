import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const results = [],
  errors = [];
try {
  for (const id of ["11000101", "11000211", "11000301", "11001901"]) {
    const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1280, height: 960 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator("#continue").waitFor({ state: "visible" });
    await page.evaluate(async (id) => {
      const { fresh } = await import("/src/model.ts");
      const { selectCharacter, newCharacterProgress } = await import(
        "/src/progression/character-progress.ts"
      );
      const s = fresh("naruto");
      if (!s.collection.includes(id)) {
        s.collection.push(id);
        s.characterProgress[id] = newCharacterProgress();
      }
      selectCharacter(s, id);
      localStorage.setItem("folha-idle-v1", JSON.stringify(s));
    }, id);
    await page.locator("#continue").click();
    await page.waitForFunction(
      () =>
        !!window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
    );
    await page.locator("#sound").check();
    await page.waitForFunction(() => window.__idle.snapshot().audioReady);
    const before = await page.evaluate(
      () => window.__idle.snapshot().presentation.footstepsPlayed,
    );
    await page.locator("#canvas canvas").focus();
    await page.keyboard.down("d");
    await page.waitForTimeout(1400);
    await page.keyboard.up("d");
    await page.waitForFunction(
      () => !window.__idle.snapshot().presentation.footstepPlaying,
    );
    const walking = await page.evaluate(
      () => window.__idle.snapshot().presentation,
    );
    const steps = walking.footstepsPlayed - before;
    assert.ok(steps >= 2 && steps <= 8, `${id}: ${steps} walking cues in 1.4s`);
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(
        () => window.__idle.snapshot().presentation.footstepsPlayed,
      ),
      walking.footstepsPlayed,
    );
    await page.locator("#progression").click();
    assert.equal(
      await page.evaluate(
        () => window.__idle.snapshot().presentation.footstepPlaying,
      ),
      false,
    );
    await page.locator(".progression-panel [data-close]").click();
    await page.locator("#maps").click();
    await page.locator('[data-map="10006"]').click();
    await page.waitForFunction(
      () =>
        window.__idle.snapshot().mapId === "10006" &&
        !window.__idle.snapshot().loadingActor,
    );
    await page.locator("#auto-hunt").click();
    await page.waitForFunction(
      () => window.__idle.snapshot().firstStrikeMs !== undefined,
      null,
      { timeout: 30000 },
    );
    const first = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(
      first.firstStrikeMs >= 0 && first.firstStrikeMs < 50,
      `${id}: opening delay ${first.firstStrikeMs}`,
    );
    await page.waitForFunction(
      () => window.__idle.snapshot().kills >= 1,
      null,
      { timeout: 30000 },
    );
    await page.locator("#auto-hunt").click();
    await page.waitForFunction(
      () => window.__idle.snapshot().phase === "explorando",
      null,
      { timeout: 20000 },
    );
    if (id === "11000101") {
      await page.evaluate(() => window.__idle.setHp(1));
      await page.locator("#auto-hunt").click();
      await page.waitForFunction(
        () => JSON.parse(localStorage.getItem("folha-idle-v1")).defeats >= 1,
        null,
        { timeout: 30000 },
      );
    }
    const final = await page.evaluate(() => window.__idle.snapshot());
    const cues = final.presentation.cuesPlayed;
    assert.equal(cues.battleStart || 0, 0);
    assert.equal(cues.victory || 0, 0);
    assert.equal(cues.defeat || 0, 0);
    assert.ok(final.presentation.shortVoices <= 4);
    results.push({
      id,
      stepsIn1400ms: steps,
      firstStrikeMs: first.firstStrikeMs,
      victory: true,
      defeatChecked: id === "11000101",
      cues,
    });
    if (id === "11001901")
      await page.screenshot({ path: "reports/combat-audio-guy.png" });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    results,
    errors,
    scope:
      "Local real-time Phaser, originals enabled, four characters in series",
  };
  await writeFile(
    "reports/combat-audio-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
