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
async function start() {
  const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1440, height: 1080 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("#continue").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    const { fresh } = await import("/src/model.ts"),
      { syncCharacterProgress } = await import(
        "/src/progression/character-progress.ts"
      );
    const s = fresh("naruto");
    s.level = 5;
    syncCharacterProgress(s);
    localStorage.setItem("folha-idle-v1", JSON.stringify(s));
  });
  await page.locator("#continue").click();
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
  return { context, page };
}
async function arrange(page, group) {
  return page.evaluate((group) => {
    const nav = window.__idle.navigation(),
      s = window.__idle.snapshot();
    const home = s.hero;
    const candidates = nav.pointsWithin(home, 280);
    const hero = candidates.find(
      (p) =>
        nav
          .pointsWithin(p, 26)
          .filter(
            (q) => Math.hypot(q.x - p.x, q.y - p.y) > 15 && nav.clear(p, q),
          ).length >= 4 &&
        nav
          .pointsWithin(p, 85)
          .some(
            (q) => Math.hypot(q.x - p.x, q.y - p.y) > 55 && nav.clear(p, q),
          ),
    );
    if (!hero) throw Error("Missing open patch");
    const near = nav
      .pointsWithin(hero, 25)
      .filter(
        (p) =>
          Math.hypot(p.x - hero.x, p.y - hero.y) > 15 && nav.clear(hero, p),
      );
    const front = nav
      .pointsWithin(hero, 80)
      .find(
        (p) =>
          Math.hypot(p.x - hero.x, p.y - hero.y) > 60 && nav.clear(hero, p),
      );
    const far = nav.points.filter(
      (p) => Math.hypot(p.x - hero.x, p.y - hero.y) > 320,
    );
    if (!far.length) throw Error("No remote positions");
    const enemies = s.enemies.map((m, i) => {
      const point =
        group && i < 3
          ? near[(i * Math.floor(near.length / 3)) % near.length]
          : !group && i === 0
            ? front
            : far[(i * 137) % far.length];
      return {
        key: m.key,
        point,
        heading: { x: point.x - hero.x, y: point.y - hero.y },
      };
    });
    window.__idle.arrange(hero, enemies);
    return { hero, enemies };
  }, group);
}
try {
  if (!process.argv.includes("--sprite-only")) {
    {
      const { context, page } = await start(),
        layout = await arrange(page, false);
      await page.waitForTimeout(650);
      let s = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(s.phase, "explorando");
      assert.equal(s.enemies[0].alerted, false);
      await page.evaluate((layout) => {
        layout.enemies[0].heading = {
          x: layout.hero.x - layout.enemies[0].point.x,
          y: layout.hero.y - layout.enemies[0].point.y,
        };
        window.__idle.arrange(layout.hero, layout.enemies);
      }, layout);
      await page.waitForFunction(
        () => window.__idle.snapshot().enemies[0].alerted,
      );
      await page.waitForFunction(
        () => window.__idle.snapshot().opponents.length > 0,
      );
      s = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(s.opponents.length, 1);
      assert.equal(s.enemies[1].alerted, false);
      results.rearStealthAndFrontChase = true;
      await context.close();
    }
    {
      const { context, page } = await start();
      await arrange(page, true);
      await page.waitForFunction(
        () => window.__idle.snapshot().opponents.length === 3,
      );
      const before = await page.evaluate(() => window.__idle.snapshot());
      await page.locator("#pause").click();
      const paused = await page.evaluate(() => window.__idle.snapshot());
      await page.waitForTimeout(500);
      const frozen = await page.evaluate(() => window.__idle.snapshot());
      assert.deepEqual(frozen.opponents, paused.opponents);
      assert.equal(frozen.hp, paused.hp);
      await page.locator("#pause").click();
      const next = before.opponents.find((e) => e.id !== before.targetId).id;
      await page.locator(`[data-target-id="${next}"]`).click();
      let swapped = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(swapped.targetId, next);
      assert.ok(
        swapped.opponents.find((e) => e.id === before.targetId).hp <=
          before.opponents.find((e) => e.id === before.targetId).hp,
      );
      results.pauseAndManualTarget = true;
      await page.waitForFunction(
        () =>
          window.__idle.snapshot().opponents.filter((e) => e.attacks > 0)
            .length >= 2,
      );
      assert.ok(
        (await page.evaluate(() => window.__idle.snapshot())).hp < before.hp,
      );
      results.multipleAttackers = true;
      await page.screenshot({ path: "reports/group-combat.png" });
      await page.waitForFunction(
        () => window.__idle.snapshot().kills >= 3,
        null,
        { timeout: 25000 },
      );
      await page.waitForFunction(
        () => window.__idle.snapshot().phase === "explorando",
      );
      const won = await page.evaluate(() => window.__idle.snapshot());
      assert.equal(won.kills, 3);
      assert.equal(won.opponents.length, 0);
      results.sequentialKillsAndRewards = true;
      await context.close();
    }
  }
  {
    const { context, page } = await start(),
      layout = await arrange(page, false);
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => window.__idle.snapshot()),
      mob = s.enemies[0],
      box = await page.locator("#canvas canvas").boundingBox();
    const click = {
      x:
        box.x +
        ((mob.x - s.viewport.worldX) * s.zoom * box.width) /
          s.viewport.canvasWidth,
      y:
        box.y +
        ((mob.y - 30 - s.viewport.worldY) * s.zoom * box.height) /
          s.viewport.canvasHeight,
    };
    assert.ok(
      click.x >= box.x &&
        click.x <= box.x + box.width &&
        click.y >= Math.max(0, box.y) &&
        click.y <= box.y + box.height,
      JSON.stringify({ click, box, s }),
    );
    assert.equal(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.tagName,
        click,
      ),
      "CANVAS",
    );
    await page.mouse.click(click.x, click.y);
    await page.waitForFunction(() => window.__idle.snapshot().path.length > 0);
    const moved = await page.evaluate(() => window.__idle.snapshot()),
      end = moved.path.at(-1);
    assert.ok(
      Math.hypot(
        end.x - layout.enemies[0].point.x,
        end.y - layout.enemies[0].point.y,
      ) < 15,
      "Enemy sprite click must route to its feet, not the ground under the pointer",
    );
    await page.waitForFunction(
      () => window.__idle.snapshot().opponents.length > 0,
    );
    assert.equal(
      (await page.evaluate(() => window.__idle.snapshot())).targetId,
      layout.enemies[0].key,
    );
    results.directSpriteClick = true;
    const prior = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("folha-idle-v1")),
    );
    await page.evaluate(() => {
      const c = document.querySelector("#canvas canvas"),
        gl = c.getContext("webgl2") || c.getContext("webgl"),
        ext = gl.getExtension("WEBGL_lose_context");
      ext.loseContext();
      setTimeout(() => ext.restoreContext(), 500);
    });
    await page.waitForFunction(
      () => !document.getElementById("game-loading").hidden,
    );
    await page.waitForFunction(
      () =>
        document.getElementById("game-loading").hidden &&
        window.__idle?.snapshot(),
    );
    assert.equal(await page.locator("#canvas canvas").count(), 1);
    const restored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("folha-idle-v1")),
    );
    assert.equal(restored.kills, prior.kills);
    assert.equal(restored.coins, prior.coins);
    results.graphicsRecoveryInCombat = true;
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "reports/group-combat-validation.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  console.log(results);
} finally {
  if (errors.length) console.error(errors);
  await browser.close();
}
