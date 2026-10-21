// Run against tools/cloud-fixture.mjs ONLY, never a real Supabase account.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://localhost:5194";
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--disable-extensions", "--renderer-process-limit=1"],
});
const errors = [],
  results = {};
let currentPage;
try {
  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  currentPage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.text().startsWith("Cloud operation failed:"))
      console.log(msg.text());
  });
  page.on("requestfailed", (req) =>
    console.log(
      "Failed request:",
      new URL(req.url()).pathname,
      req.failure()?.errorText,
    ),
  );
  page.on("response", (response) => {
    if (response.url().includes(":5195/") && response.status() >= 400)
      console.log(
        "Fixture HTTP:",
        response.status(),
        new URL(response.url()).pathname,
      );
  });
  await context.addInitScript(() => {
    localStorage.setItem("folha-idle-v1", '{"coins":999999}');
  });
  await page.goto(base);
  await page.locator("#account-access").waitFor();
  const login = async (p, password = "local-test-only") => {
    await p
      .locator("#account-access [name=email]")
      .fill("cloud-test@example.invalid");
    await p.locator("#account-access [name=password]").fill(password);
    await p.locator("#account-access button[type=submit]").click();
  };
  await login(page, "incorrect-password");
  await page
    .getByText("E-mail ou senha incorretos.", { exact: true })
    .waitFor();
  await page.locator("#account-access [name=password]").fill("local-test-only");
  await page.locator("#account-access button[type=submit]").click();
  await page.locator("[data-action=play]").waitFor();
  await page.locator("[data-action=play]").click();
  await page.waitForFunction(
    () =>
      !!window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
  );
  assert.equal(
    await page.evaluate(() => window.__idle.snapshot().activeEntityId),
    "11000211",
  );
  await page.locator("#upgrade").click();
  assert.equal(
    await page.locator("#status dl dd").first().textContent(),
    "475",
  );
  results.loginAndCloudResume = true;
  // Second device is menu-only: never a second active Phaser scene.
  const other = await browser.newContext({ locale: "pt-BR" }),
    second = await other.newPage();
  await second.goto(base);
  await second.locator("#account-access").waitFor();
  await login(second);
  await second.locator("[data-action=play]").waitFor();
  await second.locator("[data-action=play]").click();
  await second
    .getByText(
      "Esta jornada está aberta em outro dispositivo. Encerre-a lá ou aguarde até dois minutos após fechá-la.",
      { exact: true },
    )
    .waitFor();
  results.secondDeviceBlocked = true;
  await other.close();
  await page.locator("#back").click();
  await page.waitForFunction(() => document.getElementById("play").hidden);
  assert.equal(
    await page.evaluate(
      () => localStorage.getItem("folha-idle-v1"),
    ),
    null,
  );
  const stored = (
    await (await fetch("http://127.0.0.1:5195/diagnostics")).json()
  )[0];
  assert.equal(stored.snapshot.coins, 475);
  assert.equal(stored.lease_id, null);
  results.cloudOnlyPersistence = true;
  await page.locator("[data-language]").selectOption("en");
  await page.locator("#account-access").waitFor();
  await page
    .getByRole("button", { name: "Continue cloud journey", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !!window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
  );
  assert.equal(
    await page.locator("#status dl dd").first().textContent(),
    "475",
  );
  await page.locator("[data-language]").selectOption("es");
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "es" &&
      !!window.__idle?.snapshot() &&
      document.getElementById("game-loading").hidden,
  );
  assert.equal(
    await page.evaluate(() => window.__idle.snapshot().activeEntityId),
    "11000211",
  );
  assert.equal(
    await page.locator("#status dl dd").first().textContent(),
    "475",
  );
  results.languageResume = true;
  await page.locator("#back").click();
  await page.waitForFunction(() => document.getElementById("play").hidden);
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.locator("#account-access [name=email]").waitFor();
  results.logoutAndSpanish = true;
  // Secret-file protection must hold even through Vite's absolute FS endpoint.
  for (const path of [
    "/.env",
    "/@fs/C:/Users/robertn/Documents/Naruto_Idle/.env",
  ]) {
    const r = await fetch(base + path);
    const body = await r.text();
    assert.ok(
      r.status >= 400 || !body.includes("SUPABASE_ACCESS_TOKEN="),
      "Vite must not serve .env",
    );
  }
  results.envNotServed = true;
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "reports/cloud-account.png" });
  console.log(JSON.stringify({ results, errors }));
  await writeFile(
    "reports/cloud-browser-validation.json",
    JSON.stringify(
      {
        fixture:
          "Fake Auth + real SQL in embedded Postgres; no live Supabase tested",
        results,
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "Cloud UI diagnostic:",
    await currentPage
      ?.locator("#account-access")
      .innerText()
      .catch(() => ""),
  );
  console.error("Page errors:", errors);
  await currentPage
    ?.screenshot({ path: "reports/cloud-failure.png" })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
