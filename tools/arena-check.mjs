// One Chromium process, two lightweight arena pages; no Phaser/PvE scenes.
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
    "--renderer-process-limit=2",
  ],
});
const errors = [],
  missing = [];
const contexts = [];
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: { width: 1180, height: 960 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "folha-idle-v1",
        JSON.stringify({
          version: 1,
          character: "naruto",
          level: 5,
          xp: 0,
          coins: 200,
          inventory: {
            "kunai-reforcada": 1,
            "colete-shinobi": 1,
            "amuleto-chakra": 1,
          },
          equipment: {
            weapon: "kunai-reforcada",
            armor: "colete-shinobi",
            charm: "amuleto-chakra",
          },
          area: 0,
          upgrades: 2,
          kills: 0,
          defeats: 0,
          lastSaved: Date.now(),
          sound: false,
          paused: false,
          location: "10001",
          autoHunt: false,
          partyIds: [],
          questClaims: [],
          visitedMaps: ["10001"],
          collection: ["11000101", "11000201", "11000301"],
        }),
      );
    });
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => {
      if (r.status() >= 400 && /\/assets\//.test(r.url()))
        missing.push(r.url());
    });
    await page.goto(base + "/arena");
    await page.locator("#open-arena").click();
    await page
      .locator(".arena-panel [data-feedback]")
      .filter({ hasText: /^$/ })
      .waitFor();
  }
  const [a, b] = pages;
  await a.locator("[data-create]").click();
  await a
    .locator("[data-code]")
    .filter({ hasText: /Sala [A-F0-9]{10}/ })
    .waitFor();
  const code = (await a.locator("[data-code]").innerText()).split(" ")[1];
  await b.getByLabel("Ninja da arena").selectOption("sakura");
  await b.getByLabel("Chave da sala").fill(code);
  await b.locator('[data-entry] button[type="submit"]').click();
  for (const p of pages) {
    await p.locator("[data-phase]").filter({ hasText: "Turno 1" }).waitFor();
    await p
      .locator("[data-connection]")
      .filter({ hasText: "Conectado ao servidor" })
      .waitFor();
  }
  const state = (p) =>
    p.evaluate(() => fetch("/api/arena/session").then((r) => r.json()));
  assert.equal((await state(a)).seat, 0);
  assert.equal((await state(b)).seat, 1);
  assert.equal(
    await b.locator('[data-arena-action="attack"]').isDisabled(),
    true,
  );
  const rejected = await b.evaluate(() =>
    fetch("/api/arena/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "attack",
        turnNumber: 1,
        requestId: crypto.randomUUID(),
      }),
    }).then((r) => r.status),
  );
  assert.equal(rejected, 409);
  await a.locator("[data-arena-sound]").check();
  await a.locator('[data-arena-action="attack"]').click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 2" }).waitFor();
  assert.equal((await state(b)).room.players[1].hp, 165);
  await b.locator('[data-arena-action="skill"]').click();
  await a.locator("[data-phase]").filter({ hasText: "Turno 3" }).waitFor();
  assert.equal((await state(a)).room.players[1].hp, 190);
  await a.waitForFunction(
    () =>
      document.querySelector("canvas.arena-stage")?.dataset.effect ===
      "hphuifu",
  );
  await a.locator('[data-arena-action="skill"]').click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 4" }).waitFor();
  assert.equal((await state(b)).room.players[1].hp, 132);
  await a.waitForFunction(
    () =>
      document.querySelector("canvas.arena-stage")?.dataset.effect ===
      "luoxuanwan",
  );
  await a.screenshot({ path: "reports/arena-two-client.png", fullPage: true });
  await b.reload();
  await b.locator("#open-arena").click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 4" }).waitFor();
  await b
    .locator("[data-connection]")
    .filter({ hasText: "Conectado ao servidor" })
    .waitFor();
  assert.equal((await state(b)).seat, 1);
  assert.equal((await state(b)).room.players[1].hp, 132);
  await b.locator('[data-arena-action="guard"]').click();
  await a.locator("[data-phase]").filter({ hasText: "Turno 5" }).waitFor();
  await a.locator('[data-arena-action="attack"]').click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 6" }).waitFor();
  assert.equal((await state(b)).room.players[1].hp, 119);
  const lightweight = await a.evaluate(
    () =>
      !performance
        .getEntriesByType("resource")
        .some((e) => /phaser|src\/main\.ts/.test(e.name)),
  );
  assert.equal(lightweight, true);
  await b.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await b.evaluate(
      () =>
        document.querySelector(".arena-panel").scrollWidth >
        document.querySelector(".arena-panel").clientWidth,
    ),
    false,
  );
  await b.screenshot({ path: "reports/arena-mobile.png", fullPage: true });
  await b.locator("[data-leave]").click();
  await a.locator("[data-phase]").filter({ hasText: "Você venceu!" }).waitFor();
  assert.equal((await state(a)).room.reason, "left");
  // A second short duel exercises Sasuke and resets the arena's animation state.
  await a.locator("[data-leave]").click();
  await a.getByLabel("Ninja da arena").selectOption("sasuke");
  await a.locator("[data-create]").click();
  await a
    .locator("[data-code]")
    .filter({ hasText: /Sala [A-F0-9]{10}/ })
    .waitFor();
  const secondCode = (await a.locator("[data-code]").innerText()).split(" ")[1];
  await b.getByLabel("Ninja da arena").selectOption("naruto");
  await b.getByLabel("Chave da sala").fill(secondCode);
  await b.locator('[data-entry] button[type="submit"]').click();
  await a.locator("[data-phase]").filter({ hasText: "Turno 1" }).waitFor();
  await a.locator('[data-arena-action="skill"]').click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 2" }).waitFor();
  assert.equal((await state(b)).room.players[1].hp, 118);
  await a.waitForFunction(
    () =>
      document.querySelector("canvas.arena-stage")?.dataset.effect ===
      "qianniao",
  );
  await a.screenshot({ path: "reports/arena-chidori.png", fullPage: true });
  const soundRequests = await a.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .filter((e) => /\/assets\/audio\//.test(e.name)).length,
  );
  assert.ok(soundRequests > 0);
  await b.locator("[data-leave]").click();
  await a.locator("[data-leave]").click();
  await a.getByLabel("Ninja da arena").selectOption("naruto");
  await a.getByLabel("Modo do duelo").selectOption("journey");
  assert.ok(
    (await a.locator("[data-build-preview]").innerText()).includes("234 vida"),
  );
  await a.locator("[data-create]").click();
  await a.locator("[data-code]").filter({ hasText: "Jornada" }).waitFor();
  const journeyCode = (await a.locator("[data-code]").innerText()).split(
    " ",
  )[1];
  await b.getByLabel("Ninja da arena").selectOption("sakura");
  await b.getByLabel("Chave da sala").fill(journeyCode);
  await b.locator('[data-entry] button[type="submit"]').click();
  await a.locator("[data-phase]").filter({ hasText: "Turno 1" }).waitFor();
  await a.locator('[data-arena-action="skill"]').click();
  await b.locator("[data-phase]").filter({ hasText: "Turno 2" }).waitFor();
  const journey = (await state(b)).room;
  assert.equal(journey.mode, "journey");
  assert.equal(journey.players[0].maxHp, 234);
  assert.equal(journey.players[0].attack, 37);
  assert.equal(journey.players[0].maxChakra, 125);
  assert.equal(journey.players[1].maxHp, 259);
  assert.equal(journey.players[1].hp, 185);
  assert.equal(journey.log.at(-1).damage, 74);
  assert.equal(
    (await a.locator(".arena-panel").innerText()).includes("Kid"),
    false,
  );
  await a.screenshot({
    path: "reports/arena-journey-build.png",
    fullPage: true,
  });
  await b.locator("[data-leave]").click();
  for (const context of contexts) await context.close();
  // Reuse the same browser, after closing player tabs, for admin visibility.
  const admin = await browser.newPage();
  await admin.goto(base + "/admin");
  await admin.locator('input[name="password"]').fill("admin");
  await admin.locator("form button").click();
  await admin.locator('[data-section="arena"]').click();
  await admin.locator(".admin-card").filter({ hasText: code }).waitFor();
  assert.equal(
    await admin
      .locator(".admin-card")
      .filter({ hasText: code })
      .innerText()
      .then((t) => t.includes("finished")),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  const report = {
    checkedAt: new Date().toISOString(),
    base,
    independentClients: 2,
    journeyModeEquipment: true,
    journeyModeServerDamage: 74,
    simpleDisplayNames: true,
    singleBrowserProcess: true,
    noPhaserOnArenaRoute: lightweight,
    authoritativeTurn: true,
    attack: true,
    rasengan: true,
    chidori: true,
    originalEffectsRendered: ["luoxuanwan", "qianniao", "hphuifu"],
    originalAudioRequests: soundRequests,
    sakuraHealing: true,
    defense: true,
    reloadReconnection: true,
    identicalHp: true,
    leaveAwardsOpponent: true,
    adminRoomVisible: true,
    mobileNoHorizontalOverflow: true,
    errors,
    missingAssets: missing,
  };
  await fs.writeFile(
    "reports/arena-browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
