import test from "node:test";
import assert from "node:assert/strict";
import { fresh, Hunt } from "../src/model.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { canMoveInPhase } from "../src/world/combat-movement.ts";

const durable = () => ({ ...enemyProfile(), hp: 10000, attack: 0.1 });
function tick(h: Hunt, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100)
    h.tick(Math.min(100, ms - elapsed));
}

test("retreat keeps enemies damaging in melee while disabling player attacks and skills", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  h.encounter(durable(), "one");
  h.join("two", durable());
  assert.ok(h.retreat());
  const enemyHp = h.enemyHp,
    hp = h.hp;
  tick(h, 4000);
  assert.equal(h.enemyHp, enemyHp);
  assert.ok(h.hp < hp);
  assert.ok(h.opponents.get("two")!.attacks > 0);
  assert.equal(h.castSkill(), false);
  assert.equal(h.save.kills, 0);
  assert.equal(h.save.accountXp, 0);
  for (const enemy of h.livingOpponents) enemy.inRange = false;
  const awayHp = h.hp;
  tick(h, 4000);
  assert.equal(h.hp, awayHp);
  h.opponents.get("one")!.inRange = true;
  h.tick(100);
  assert.ok(h.hp < awayHp);
});

test("losing one pursuer never cancels retreat; escaping the last ends combat without rewards", () => {
  const h = new Hunt(fresh("sasuke"), () => 1);
  h.encounter(durable(), "one");
  h.join("two", durable());
  h.retreat();
  const kills = h.save.kills;
  h.leave("one");
  assert.ok(h.retreating);
  assert.equal(h.targetId, "two");
  h.leave("two");
  assert.equal(h.phase, "explorando");
  assert.equal(h.retreating, false);
  assert.equal(h.save.kills, kills);
  assert.equal(h.save.coins, 0);
});

test("selecting an enemy resumes attacks without accumulating a burst while retreating", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  h.encounter(durable(), "one", true);
  assert.equal(h.attacks, 0);
  tick(h, 4000);
  assert.equal(h.attacks, 0);
  assert.ok(h.selectTarget("one"));
  h.tick(100);
  assert.equal(h.retreating, false);
  assert.equal(h.attacks, 1);
  h.tick(100);
  assert.equal(h.attacks, 1);
  h.retreat();
  h.selectTarget("one");
  h.tick(100);
  assert.equal(h.attacks, 1); // Switching modes cannot reset the attack cooldown.
});

test("movement stays enabled through preparation, combat and victory but blocks defeat and recovery", () => {
  for (const phase of [
    "explorando",
    "iniciando combate",
    "combatendo",
    "recompensas",
  ] as const)
    assert.ok(canMoveInPhase(phase));
  for (const phase of ["derrota", "retomando exploração"] as const)
    assert.equal(canMoveInPhase(phase), false);
  const h = new Hunt(fresh("naruto"));
  assert.equal(h.retreat(), false);
  h.encounter(durable());
  h.save.paused = true;
  assert.equal(h.retreat(), false);
});

test("stopping movement readies the selected target and attacks automatically only when it enters range", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  h.encounter(durable(), "selected", true);
  h.opponents.get("selected")!.inRange = false;
  h.join("nearby", durable(), true);
  h.updateMovement(true);
  tick(h, 2000);
  assert.equal(h.attacks, 0);
  h.updateMovement(false);
  assert.equal(h.retreating, false);
  const otherHp = h.opponents.get("nearby")!.hp;
  tick(h, 2000);
  assert.equal(h.attacks, 0); // A different nearby foe does not steal the chosen target.
  const targetHp = h.enemyHp;
  h.opponents.get("selected")!.inRange = true;
  h.tick(16);
  assert.equal(h.targetId, "selected");
  assert.equal(h.attacks, 1);
  assert.ok(h.enemyHp < targetHp);
  assert.equal(h.opponents.get("nearby")!.hp, otherHp);
  h.tick(16);
  assert.equal(h.attacks, 1);
  h.updateMovement(true);
  const previousHp = h.enemyHp;
  tick(h, 2000);
  assert.equal(h.enemyHp, previousHp);
  h.updateMovement(false);
  h.tick(16);
  assert.equal(h.attacks, 2);
});

test("stationary resumption cannot reset cooldowns or override pause/defeat", () => {
  const h = new Hunt(fresh("naruto"), () => 1);
  h.encounter(durable());
  const attacks = h.attacks;
  for (let i = 0; i < 4; i++) {
    h.updateMovement(true);
    h.updateMovement(false);
    h.tick(16);
  }
  assert.equal(h.attacks, attacks);
  h.retreat();
  h.save.paused = true;
  h.updateMovement(false);
  assert.equal(h.retreating, true);
  h.save.paused = false;
  h.phase = "derrota";
  h.updateMovement(false);
  assert.equal(h.phase, "derrota");
});
