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
  results = [];
try {
  for (const mode of ["fallback", "native", "lan"]) {
    const context = await browser.newContext({
      viewport: mode === "native" ? null : { width: 1280, height: 900 },
    });
    await context.addInitScript((mode) => {
      if (mode === "fallback")
        Object.defineProperty(window, "documentPictureInPicture", {
          value: undefined,
        });
      localStorage.setItem(
        "folha-idle-v1",
        JSON.stringify({
          version: 1,
          character: "naruto",
          level: 1,
          xp: 0,
          upgrades: 0,
          coins: 100,
          inventory: {},
          equipment: {},
          area: 0,
          kills: 0,
          defeats: 0,
          lastSaved: Date.now(),
          sound: mode === "native",
          music: mode === "native",
          paused: false,
          location: "10001",
          autoHunt: false,
          partyIds: [],
          collection: ["11000101", "11000201", "11000301"],
        }),
      );
    }, mode);
    const page = await context.newPage();
    if (mode === "native")
      await page.setViewportSize({ width: 1280, height: 900 });
    page.on("pageerror", (e) => errors.push(String(e)));
    const address = mode === "lan" ? process.env.LAN_TEST_URL : base;
    if (!address) {
      await context.close();
      continue;
    }
    await page.goto(address);
    await page.locator("#continue").click();
    await page.waitForFunction(() => window.__idle?.snapshot());
    const openMini = async () => {
      await page.locator("#mini-window").click();
      if (mode !== "native") {
        await page.locator(".mini-help").waitFor();
        assert.match(await page.locator(".mini-help").innerText(), /não acompanha outras abas/);
        await page.locator("[data-mini-internal]").click();
      }
    };
    const before = await page.evaluate(() => window.__idle.snapshot());
    await openMini();
    await page.waitForFunction(() => {
      const s = window.__idle.snapshot();
      return (
        s.viewport.heroVisible && s.viewport.width === s.viewport.canvasWidth
      );
    });
    const state = await page.evaluate(() => {
      const pip = window.documentPictureInPicture?.window;
      const doc = pip?.document || document;
      return {
        external: !!pip,
        title: doc.title,
        width: doc.querySelector("#canvas").clientWidth,
        height: doc.querySelector("#canvas").clientHeight,
        canvases: doc.querySelectorAll("#canvas canvas").length,
        hasPlaceholder: !!document.querySelector(".mini-placeholder"),
        api: !!window.documentPictureInPicture,
      };
    });
    console.log(mode, JSON.stringify(state));
    assert.equal(state.canvases, 1);
    assert.equal(state.hasPlaceholder, true);
    assert.ok(state.width < 700 && state.height > 100 && state.height < 500);
    if (mode === "native")
      assert.equal(
        state.external,
        true,
        "Native PiP must actually open on the installed Chrome.",
      );
    if (mode === "lan") {
      assert.equal(state.external, false);
      assert.equal(state.api, false);
    }
    await page.evaluate(() => {
      const doc = window.documentPictureInPicture?.window?.document || document;
      doc.querySelector('[data-mini-action="pause"]').click();
    });
    assert.equal(
      (await page.evaluate(() => window.__idle.snapshot())).paused,
      true,
    );
    await page.evaluate(() => {
      const doc = window.documentPictureInPicture?.window?.document || document;
      doc.querySelector('[data-mini-action="pause"]').click();
    });
    if (!state.external) {
      const drag = page.getByRole("button", { name: "Arrastar minijanela" });
      const rect = await page.locator(".mini-window").boundingBox();
      const handle = await drag.boundingBox();
      await page.mouse.move(handle.x + 30, handle.y + 15);
      await page.mouse.down();
      await page.mouse.move(handle.x - 170, handle.y - 110, { steps: 6 });
      await page.mouse.up();
      const moved = await page.locator(".mini-window").boundingBox();
      assert.ok(moved.x < rect.x - 100 && moved.y < rect.y - 80);
      await page.locator(".mini-window").evaluate((panel) => {
        panel.style.width = "440px";
        panel.style.height = "360px";
      });
      await page.waitForFunction(() => {
        const s = window.__idle.snapshot();
        return (
          s.viewport.canvasWidth === 438 &&
          s.viewport.width === 438 &&
          s.viewport.heroVisible
        );
      });
      await page.screenshot({ path: "reports/mini-window-fallback.png" });
      // The canvas position changes when dragging. Pointer coordinates must follow it immediately.
      const canvas = await page.locator("#canvas canvas").boundingBox();
      await page.mouse.click(canvas.x + 20, canvas.y + 50);
      const pointer = await page.evaluate(
        () => window.__idle.snapshot().pointer,
      );
      assert.ok(Math.abs(pointer.x - 20) < 2 && Math.abs(pointer.y - 50) < 2);
      await page.locator("#canvas canvas").focus();
      await page.keyboard.down("d");
      await page.waitForTimeout(350);
      await page.keyboard.up("d");
    } else {
      await page.evaluate(() => {
        window.scrollTo(0, 100);
        const pip = window.documentPictureInPicture.window;
        const canvas = pip.document.querySelector("#canvas canvas");
        const rect = canvas.getBoundingClientRect();
        for (const type of ["mousedown", "mouseup"])
          canvas.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              clientX: rect.left + 20,
              clientY: rect.top + 50,
              button: 0,
            }),
          );
      });
      const pointer = await page.evaluate(
        () => window.__idle.snapshot().pointer,
      );
      assert.ok(
        Math.abs(pointer.x - 20) < 2 && Math.abs(pointer.y - 50) < 2,
        JSON.stringify(pointer),
      );
      // PiP is a browser-owned window. Send key input to its own event target.
      await page.evaluate(() => {
        const pip = window.documentPictureInPicture.window;
        pip.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "d",
            code: "KeyD",
            keyCode: 68,
            which: 68,
          }),
        );
      });
      await page.waitForTimeout(350);
      await page.evaluate(() =>
        window.documentPictureInPicture.window.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "d",
            code: "KeyD",
            keyCode: 68,
            which: 68,
          }),
        ),
      );
    }
    const after = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(
      Math.hypot(after.hero.x - before.hero.x, after.hero.y - before.hero.y) >
        15,
    );
    // Close with the browser's close operation, not only the Restore button.
    await page.evaluate(() => {
      const pip = window.documentPictureInPicture?.window;
      if (pip) pip.close();
      else document.querySelector("[data-mini-return]").click();
    });
    await page.locator("#play > #canvas canvas").waitFor();
    assert.equal(await page.locator("#canvas canvas").count(), 1);
    await page.waitForFunction(() => {
      const s = window.__idle.snapshot();
      return (
        s.viewport.heroVisible && s.viewport.width === s.viewport.canvasWidth
      );
    });
    assert.equal(
      (await page.evaluate(() => window.__idle.snapshot())).kills,
      before.kills,
    );
    await page.locator("#canvas canvas").focus();
    const restored = await page.evaluate(() => window.__idle.snapshot());
    await page.keyboard.down("d");
    await page.waitForTimeout(350);
    await page.keyboard.up("d");
    const walked = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(
      Math.hypot(
        walked.hero.x - restored.hero.x,
        walked.hero.y - restored.hero.y,
      ) > 15,
    );
    await page.locator("#maps").click();
    await page.locator('[data-map="10006"]').click();
    await page.waitForFunction(
      () =>
        window.__idle.snapshot().mapId === "10006" &&
        !window.__idle.snapshot().loadingActor,
    );
    await openMini();
    await page.evaluate(() => {
      const doc = window.documentPictureInPicture?.window?.document || document;
      doc.querySelector('[data-mini-action="auto-hunt"]').click();
    });
    if (state.external) {
      // Switch to another tab: the visible PiP window must drive the existing game's frames.
      const other = await context.newPage();
      await other.goto("about:blank");
      await other.bringToFront();
      await page.waitForFunction(
        () => window.__idle.snapshot().kills >= 1,
        null,
        { timeout: 30000 },
      );
      assert.equal(
        (await page.evaluate(() => window.__idle.snapshot())).audioState,
        "running",
      );
      await other.close();
    } else
      await page.waitForFunction(
        () => window.__idle.snapshot().kills >= 1,
        null,
        { timeout: 30000 },
      );
    const victory = await page.evaluate(() => window.__idle.snapshot());
    assert.ok(victory.kills >= 1);
    // Opening a full-size panel restores the game before showing the dialog.
    await page.locator("#progression").click();
    await page.locator(".progression-panel").waitFor();
    assert.equal(await page.locator("#play > #canvas canvas").count(), 1);
    assert.equal(
      await page.evaluate(() => !!window.documentPictureInPicture?.window),
      false,
    );
    await page.locator(".progression-panel [data-close]").click();
    if (!state.external) {
      await page.setViewportSize({ width: 360, height: 640 });
      await openMini();
      const mobile = await page.locator(".mini-window").boundingBox();
      assert.ok(
        mobile.x >= 0 &&
          mobile.y >= 0 &&
          mobile.x + mobile.width <= 361 &&
          mobile.y + mobile.height <= 641,
        JSON.stringify(mobile),
      );
      await page
        .getByRole("button", { name: "Restaurar", exact: true })
        .click();
    }
    results.push({
      mode,
      ...state,
      dragging: !state.external,
      input: true,
      pointerCoordinates: true,
      pause: true,
      resizeTested: !state.external,
      mobileBounds: !state.external,
      audioInOtherTab: state.external,
      restoredInput: true,
      victory: true,
      otherTab: state.external,
      sameInstance: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), results, errors };
  await writeFile(
    "reports/mini-window-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
