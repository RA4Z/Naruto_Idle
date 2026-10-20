import test from "node:test";
import assert from "node:assert/strict";
import { actorVisualScale, shouldReturnToBattleIdle } from "../src/entities/visual-rules.ts";

test("quadruped battle scaling is localized and keeps world scaling unchanged", () => {
  assert.equal(actorVisualScale("19000301", "battle", 81), 45 / 81 * 0.75);
  assert.equal(actorVisualScale("19000701", "battle", 81), 45 / 81 * 0.75);
  assert.equal(actorVisualScale("19000401", "battle", 109), 45 / 109 * 0.7);
  assert.equal(actorVisualScale("19000301", "world", 99), 45 / 99);
  assert.equal(actorVisualScale("19000901", "battle", 120), 45 / 120);
});

test("only finished battle actions return to idle, preserving death and world poses", () => {
  assert.equal(shouldReturnToBattleIdle("entity:19000301:battle:A_1hit", false), true);
  assert.equal(shouldReturnToBattleIdle("entity:19000301:battle:A_1hit", true), false);
  assert.equal(shouldReturnToBattleIdle("entity:19000301:battle:C_dead", false), false);
  assert.equal(shouldReturnToBattleIdle("entity:19000301:world:idle_0", false), false);
  assert.equal(shouldReturnToBattleIdle(undefined, false), false);
});
