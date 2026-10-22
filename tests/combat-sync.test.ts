import test from "node:test";
import assert from "node:assert/strict";
import { Hunt, fresh } from "../src/model.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { syncPursuers } from "../src/world/combat-sync.ts";

test("target loss uses all ranges from the current frame and never selects another departing foe", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  const profile = { ...enemyProfile(), hp: 10000 };
  h.encounter(profile, "selected");
  h.join("leaving", profile, true);
  h.join("formerly-near", profile, true);
  h.join("now-near", profile, false);
  h.retreat();
  const clock = h.playerClock,
    hp = h.hp,
    events: string[] = [];
  h.onEvent = (event, _, id) => {
    if (event === "target") events.push(id!);
  };
  syncPursuers(h, (id) => {
    if (id === "selected" || id === "leaving") return;
    return { engaged: true, inRange: id === "now-near" };
  });
  assert.equal(h.targetId, "now-near");
  assert.deepEqual(events, ["now-near"]);
  assert.equal(h.livingOpponents.length, 2);
  assert.equal(h.retreating, true);
  assert.equal(h.playerClock, clock);
  assert.equal(h.hp, hp);
  assert.equal(h.save.kills, 0);
});

test("sync preserves a manual target, respects pause and disengages once after the last pursuer", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  const profile = { ...enemyProfile(), hp: 10000 };
  h.encounter(profile, "selected");
  h.join("other", profile, true);
  syncPursuers(h, (id) => ({ engaged: true, inRange: id === "other" }));
  assert.equal(h.targetId, "selected");
  let events = 0;
  h.onEvent = (event) => {
    if (event === "disengage") events++;
  };
  h.save.paused = true;
  syncPursuers(h, () => undefined);
  assert.equal(h.livingOpponents.length, 2);
  h.save.paused = false;
  syncPursuers(h, () => undefined);
  syncPursuers(h, () => undefined);
  assert.equal(events, 1);
  assert.equal(h.phase, "explorando");
  assert.equal(h.save.kills, 0);
});
