import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch({ headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--renderer-process-limit=1"] });
const errors = [], missing = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", response => { if (response.status() >= 400) missing.push(response.url()); });
  const network = await page.context().newCDPSession(page);
  await network.send("Network.enable"); await network.send("Network.setCacheDisabled", { cacheDisabled: true });
  await network.send("Network.emulateNetworkConditions", { offline: false, latency: 60,
    downloadThroughput: 800 * 1024, uploadThroughput: 300 * 1024 });
  await page.goto(base); await page.locator("#new").click();
  const menuResources = await page.evaluate(() => performance.getEntriesByType("resource").map(e => e.name));
  assert.equal(menuResources.some(url => /phaser|entities.json|\.mp3$/.test(url)), false);
  const started = Date.now();
  await page.locator('[data-character="sasuke"]').click();
  await page.locator("#game-loading").waitFor();
  await page.screenshot({ path: "reports/loading-production-screen.png" });
  await page.waitForFunction(() => document.getElementById("game-loading").hidden && document.getElementById("hero-name").textContent === "Sasuke", null, { timeout: 30000 });
  const firstFrameMs = Date.now() - started;
  assert.equal(await page.locator("#canvas canvas").count(), 1);
  await page.screenshot({ path: "reports/loading-production-world.png" });
  const assets = await page.evaluate(() => performance.getEntriesByType("resource").filter(e => new URL(e.name).pathname.startsWith("/assets/")).map(e => ({ url: new URL(e.name).pathname, bytes: e.transferSize })));
  assert.equal(assets.some(e => /entities.json|\.mp3$|\/effects\//.test(e.url)), false);
  const webp = await page.request.get(base + "/assets/maps/10001/background.webp");
  assert.equal(webp.headers()["content-type"], "image/webp");
  assert.equal((await webp.body()).toString("ascii", 8, 12), "WEBP");
  await page.locator("#maps").click(); await page.locator('[data-map="10006"]').click();
  await page.waitForFunction(() => document.getElementById("game-loading").hidden && document.getElementById("world-name").textContent.includes("Treinamento"), null, { timeout: 30000 });
  await page.locator("#auto-hunt").click();
  await page.waitForFunction(() => Number(document.querySelectorAll("#status dd")[1]?.textContent) > 0, null, { timeout: 20000 });
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  const report = { checkedAt: new Date().toISOString(), build: "production", network: { downloadKiBps: 800, latencyMs: 60 },
    firstFrameMs, menuDefersEngine: true, webpServedCorrectly: true, noAudioOrCombatBeforeLobby: true,
    travelAndVictory: true, errors, missing };
  await writeFile("reports/loading-production-validation.json", JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
} finally { await browser.close(); }
