import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type Phaser from "phaser";
import { loadSceneAssets } from "../src/assets/scene-loader.ts";

function fixture() {
  const events = new EventEmitter(),
    loader = new EventEmitter();
  let active = true,
    busy = false,
    current = "",
    peak = 0;
  const order: string[] = [];
  const load = Object.assign(loader, {
    isLoading: () => busy,
    start() {
      assert.equal(
        busy,
        false,
        "A second batch cannot start while the shared loader is busy",
      );
      busy = true;
      peak = Math.max(peak, 1);
      queueMicrotask(() => {
        order.push(current);
        busy = false;
        if (current === "bad")
          loader.emit("loaderror", { key: "missing-image" });
        loader.emit("complete");
      });
    },
  });
  const scene = {
    load,
    events,
    sys: { isActive: () => active },
  } as unknown as Phaser.Scene;
  return {
    scene,
    order,
    queue: (name: string) => {
      current = name;
    },
    stop: () => {
      active = false;
      events.emit("shutdown");
    },
    peak: () => peak,
  };
}

test("concurrent NPC, audio and map batches use a single loader in request order", async () => {
  const f = fixture();
  await Promise.all(
    ["npc", "audio", "map"].map((name) =>
      loadSceneAssets(f.scene, () => f.queue(name)),
    ),
  );
  assert.deepEqual(f.order, ["npc", "audio", "map"]);
  assert.equal(f.peak(), 1);
});

test("a failed resource batch rejects but does not poison later retries", async () => {
  const f = fixture();
  await assert.rejects(
    loadSceneAssets(f.scene, () => f.queue("bad")),
    /carregar alguns recursos/,
  );
  await loadSceneAssets(f.scene, () => f.queue("retry"));
  assert.deepEqual(f.order, ["bad", "retry"]);
  assert.equal(f.scene.load.listenerCount("loaderror"), 0);
  assert.equal(f.scene.events.listenerCount("shutdown"), 0);
});

test("cached resources do not reload and queued work cannot run in a destroyed scene", async () => {
  const f = fixture();
  let queued = false;
  await loadSceneAssets(
    f.scene,
    () => {
      queued = true;
    },
    () => true,
  );
  assert.equal(queued, false);
  f.stop();
  await assert.rejects(
    loadSceneAssets(f.scene, () => {
      queued = true;
    }),
    /cancelado/,
  );
  assert.equal(queued, false);
});
