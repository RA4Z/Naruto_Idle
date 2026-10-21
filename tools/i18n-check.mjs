import { chromium, request } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  results = [];
const words = {
  "pt-BR": {
    new: "Novo jogo",
    level: "Nível",
    attrs: "Vitalidade",
    village: "Vila da Folha",
    bad: "Senha incorreta.",
    wolf: "Lobo Preto",
    world: "Exploração",
    arena: "Arena PvP",
    attack: "Ataque",
  },
  en: {
    new: "New game",
    level: "Level",
    attrs: "Vitality",
    village: "Leaf Village",
    bad: "Incorrect password.",
    wolf: "Black Wolf",
    world: "Exploration",
    arena: "PvP Arena",
    attack: "Attack",
  },
  es: {
    new: "Nueva partida",
    level: "Nivel",
    attrs: "Vitalidad",
    village: "Aldea de la Hoja",
    bad: "Contraseña incorrecta.",
    wolf: "Lobo Negro",
    world: "Exploración",
    arena: "Arena PvP",
    attack: "Ataque",
  },
};
try {
  for (const locale of ["pt-BR", "en", "es"]) {
    console.log("Checking locale:", locale);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    });
    await context.addInitScript(() => {
      if (sessionStorage.getItem("i18n-fixture")) return;
      localStorage.setItem(
        "folha-idle-v1",
        JSON.stringify({
          version: 1,
          character: "naruto",
          level: 3,
          xp: 17,
          upgrades: 2,
          coins: 200,
          inventory: { "kunai-treino": 1, fragmento: 3 },
          equipment: { weapon: "kunai-treino" },
          area: 0,
          kills: 0,
          defeats: 0,
          lastSaved: Date.now(),
          sound: false,
          paused: false,
          location: "10001",
          autoHunt: false,
          partyIds: [],
          collection: ["11000101", "11000211", "11000301"],
        }),
      );
      sessionStorage.setItem("i18n-fixture", "1");
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base);
    await page.locator("[data-language]").selectOption(locale);
    // Selecting the current locale may still reload; wait for the booted menu.
    await page.waitForFunction(
      (locale) =>
        document.documentElement.lang === locale &&
        !document.getElementById("new").disabled,
      locale,
    );
    assert.equal(await page.locator("#new").innerText(), words[locale].new);
    await page.locator("#continue").click();
    await page.waitForFunction(
      () =>
        window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
    );
    assert.match(
      await page.locator("#status").innerText(),
      new RegExp(words[locale].level + " 3"),
    );
    assert.equal(
      await page.locator("#world-name").innerText(),
      words[locale].village,
    );
    await page.locator("#progression").click();
    await page.locator('[data-tab="attributes"]').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".progression-panel .progress-card")
          .length === 7,
    );
    assert.match(
      await page.locator(".progression-panel").innerText(),
      new RegExp(words[locale].attrs),
    );
    await page.locator('[data-tab="shop"]').click();
    assert.equal(await page.locator(".progress-card").count(), 22);
    await page.locator(".progression-panel [data-close]").click();
    await page.locator("#library").click();
    await page.locator("[data-open-archive]").click();
    await page.getByRole("searchbox").fill("11000211");
    await page
      .locator('[data-entity="11000211"] [data-role="companion"]')
      .click();
    await page.waitForFunction(
      () =>
        window.__idle?.snapshot().activeEntityId === "11000211" &&
        document.getElementById("game-loading").hidden,
    );
    await page.locator("#maps").click();
    assert.equal(await page.locator('[data-map="10006"]').count(), 1);
    await page.locator('[data-map="10006"]').click();
    await page.waitForFunction(
      () =>
        window.__idle.snapshot().mapId === "10006" &&
        !window.__idle.snapshot().loadingActor,
    );
    await page.locator("#auto-hunt").click();
    await page.waitForFunction(
      () => window.__idle.snapshot().kills >= 1,
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => window.__idle.snapshot().phase === "explorando",
    );
    await page.locator("#return-lobby").click();
    await page.waitForFunction(
      () =>
        window.__idle.snapshot().mapId === "10001" &&
        !window.__idle.snapshot().loadingActor,
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("folha-idle-v1")),
    );
    const next = locale === "en" ? "es" : "en";
    await page.locator("[data-language]").selectOption(next);
    await page.waitForFunction(
      (next) =>
        document.documentElement.lang === next &&
        window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
      next,
    );
    const restored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("folha-idle-v1")),
    );
    assert.equal(restored.activeEntityId, saved.activeEntityId);
    assert.equal(restored.coins, saved.coins);
    assert.deepEqual(restored.characterProgress, saved.characterProgress);
    assert.equal(restored.characterProgress["11000101"].level, 3);
    assert.equal(
      restored.characterProgress["11000101"].equipment.weapon,
      "kunai-treino",
    );
    await page.locator("[data-language]").selectOption(locale);
    await page.waitForFunction(
      (locale) =>
        document.documentElement.lang === locale &&
        window.__idle?.snapshot() &&
        document.getElementById("game-loading").hidden,
      locale,
    );
    await page.screenshot({ path: `reports/i18n-${locale}-game.png` });
    await page.goto(base + "/admin");
    await page.locator('input[name="password"]').fill("invalid");
    await page.locator("form button").click();
    await page.waitForFunction(
      (text) =>
        document
          .querySelector('.admin-login [role="status"]')
          .textContent.includes(text),
      words[locale].bad,
    );
    await page.locator('input[name="password"]').fill("admin");
    await page.locator("form button").click();
    await page.locator('[data-section="progression"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".admin-card").length === 27);
    const blade = { "pt-BR": "Lâmina de assalto II", en: "Assault blade II", es: "Hoja de asalto II" }[locale];
    assert.ok((await page.locator(".admin-card h3").allTextContents()).includes(blade));
    await page.locator('[data-section="characters"]').click();
    await page.locator(".admin-controls input").fill("19000701");
    assert.match(
      await page.locator(".admin-card h3").innerText(),
      new RegExp(words[locale].wolf),
    );
    await page.locator(".admin-card button").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".animation-card").length > 0,
    );
    assert.match(
      await page.locator(".animation-grid").innerText(),
      new RegExp(words[locale].world),
    );
    await page.screenshot({ path: `reports/i18n-${locale}-admin.png` });
    await page.goto(base + "/arena");
    await page.locator("#open-arena").click();
    assert.match(
      await page.locator(".arena-panel h2").innerText(),
      new RegExp(words[locale].arena),
    );
    await page.locator("[data-create]").click();
    await page.locator("[data-code]").waitFor({ state: "visible" });
    const session = await page.evaluate(() =>
      fetch("/api/arena/session").then((r) => r.json()),
    );
    const peer = await request.newContext({
      baseURL: base,
      extraHTTPHeaders: { Origin: base },
    });
    const join = await peer.post("/api/arena/join", {
      data: { code: session.room.code, character: "sakura" },
    });
    assert.equal(join.ok(), true, await join.text());
    await page.waitForFunction(
      () => !document.querySelector('[data-arena-action="attack"]').disabled,
    );
    await page.locator('[data-arena-action="attack"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".arena-log li").length > 0,
    );
    assert.match(
      await page.locator(".arena-log").innerText(),
      new RegExp(words[locale].attack),
    );
    await page.locator("[data-leave]").click();
    await peer.dispose();
    results.push({
      locale,
      menu: true,
      world: true,
      attributes: true,
      library: true,
      characterSwitch: true,
      combat: true,
      languageResumePreservesSave: true,
      admin: true,
      adminError: true,
      animations: true,
      arena: true,
      arenaLog: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), results, errors };
  await writeFile(
    "reports/i18n-browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(errors);
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error((await page.locator("body").innerText()).slice(-2200));
    await page.screenshot({ path: "reports/i18n-failure.png" }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
