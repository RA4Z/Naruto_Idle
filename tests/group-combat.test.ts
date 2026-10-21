import test from "node:test";
import assert from "node:assert/strict";
import { fresh, Hunt, stats } from "../src/model.ts";
import { enemyProfile } from "../src/world/enemy-profiles.ts";
import { parseDebugCommand } from "../src/admin/debug-commands.ts";
import { NativeNavigation } from "../src/world/navigation.ts";
import { readFileSync } from "node:fs";
import {
  seesPlayer,
  updateAwareness,
  freshAwareness,
  visionRadius,
  SIGHT,
} from "../src/world/awareness.ts";
const clear = () => true,
  origin = { x: 0, y: 0 },
  right = { x: 1, y: 0 };
const durable = () => ({ ...enemyProfile(), hp: 10000, attack: 0.1 });

test("expanded sight and longer pursuit retain a small rear-awareness radius", () => {
  const profile = enemyProfile();
  assert.equal(SIGHT.proximity, 36);
  assert.ok(visionRadius(profile) >= 140);
  assert.ok(
    seesPlayer(origin, right, { x: 130, y: 0 }, visionRadius(profile), clear),
  );
  assert.ok(
    seesPlayer(origin, right, { x: 50, y: 70 }, visionRadius(profile), clear),
  );
  assert.ok(
    seesPlayer(origin, right, { x: -35, y: 0 }, visionRadius(profile), clear),
  );
  assert.equal(
    seesPlayer(origin, right, { x: -40, y: 0 }, visionRadius(profile), clear),
    false,
  );
  const state = freshAwareness();
  updateAwareness(
    state,
    origin,
    right,
    { x: 100, y: 0 },
    origin,
    profile,
    clear,
    100,
  );
  updateAwareness(
    state,
    origin,
    right,
    { x: -100, y: 0 },
    origin,
    profile,
    clear,
    5000,
  );
  assert.ok(state.alerted);
});

test("console commands accept booleans without executing JavaScript", () => {
  assert.equal(parseDebugCommand("debug=true"), true);
  assert.equal(parseDebugCommand("  DEBUG = false  "), false);
  for (const command of [
    "debug=1",
    "debug=true;window.x=1",
    "alert(1)",
    "debug=true\ndebug=false",
    "",
  ])
    assert.equal(parseDebugCommand(command), undefined);
});

test("navigation returns plain coordinates when passed actors with cyclic scene metadata", () => {
  const nav = new NativeNavigation(
    JSON.parse(
      readFileSync("public/assets/maps/10006/navigation.json", "utf8"),
    ),
  );
  const from = { ...nav.points[0], scene: {} },
    to = { ...nav.points[1], scene: {} };
  from.scene = from;
  to.scene = to;
  assert.deepEqual(Object.keys(nav.nearest(from)!).sort(), ["x", "y"]);
  const path = nav.path(from, to);
  assert.ok(path.length);
  assert.doesNotThrow(() => JSON.stringify(path));
  for (const p of path) assert.deepEqual(Object.keys(p).sort(), ["x", "y"]);
});

test("near awareness works in every direction; frontal cone is larger and directional", () => {
  for (const p of [
    { x: 30, y: 0 },
    { x: -30, y: 0 },
    { x: 0, y: 30 },
    { x: 0, y: -30 },
  ])
    assert.ok(seesPlayer(origin, right, p, 100, clear));
  assert.ok(seesPlayer(origin, right, { x: 90, y: 0 }, 100, clear));
  assert.ok(seesPlayer(origin, right, { x: 60, y: 40 }, 100, clear));
  assert.equal(seesPlayer(origin, right, { x: -60, y: 0 }, 100, clear), false);
  assert.equal(seesPlayer(origin, right, { x: 0, y: 60 }, 100, clear), false);
  assert.equal(seesPlayer(origin, right, { x: 101, y: 0 }, 100, clear), false);
  assert.equal(
    seesPlayer(origin, right, { x: 10, y: 0 }, 100, () => false),
    false,
  );
});

test("awareness remembers briefly, returns home after losing sight or leash, and rearms at home", () => {
  const state = freshAwareness(),
    profile = enemyProfile();
  const update = (
    hero: { x: number; y: number },
    dt = 100,
    visible = true,
    enemy = origin,
  ) =>
    updateAwareness(
      state,
      enemy,
      right,
      hero,
      origin,
      profile,
      () => visible,
      dt,
    );
  update({ x: 80, y: 0 });
  assert.ok(state.alerted);
  update({ x: -80, y: 0 }, SIGHT.memoryMs - 1);
  assert.ok(state.alerted);
  update({ x: -80, y: 0 }, 1);
  assert.equal(state.alerted, false);
  assert.ok(state.returning);
  update({ x: 80, y: 0 }, 100, true, { x: 40, y: 0 });
  assert.ok(state.returning);
  assert.equal(state.alerted, false);
  update({ x: 80, y: 0 });
  assert.equal(state.returning, false);
  update({ x: 80, y: 0 });
  assert.ok(state.alerted);
  update({ x: SIGHT.leash + 1, y: 0 });
  assert.ok(state.returning);
  assert.equal(state.alerted, false);
  const hidden = freshAwareness();
  updateAwareness(
    hidden,
    origin,
    right,
    { x: 20, y: 0 },
    origin,
    profile,
    () => false,
    100,
  );
  assert.equal(hidden.alerted, false);
  assert.ok(visionRadius(profile) > SIGHT.proximity);
});

test("three enemies attack independently while the player damages only the selected one", () => {
  const s = fresh("naruto"),
    h = new Hunt(s),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p);
  h.join("three", p);
  const damageIds: string[] = [];
  h.onEvent = (event, _, id) => {
    if (event === "hurt") damageIds.push(id!);
  };
  const hp = h.hp,
    before = h.opponents.get("two")!.hp;
  h.tick(220);
  assert.equal(damageIds.length, 3);
  assert.equal(new Set(damageIds).size, 3);
  assert.ok(h.hp < hp);
  assert.equal(h.opponents.get("two")!.hp, before);
  assert.equal(h.opponents.get("three")!.hp, before);
});

test("manual target swaps preserve HP, every cooldown and healing budget without extra opening attacks", () => {
  const h = new Hunt(fresh("sasuke")),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p);
  h.tick(100);
  const one = { ...h.opponents.get("one")! },
    two = { ...h.opponents.get("two")! },
    clock = h.playerClock,
    attacks = h.attacks;
  for (let i = 0; i < 20; i++) {
    assert.ok(h.selectTarget("two"));
    assert.ok(h.selectTarget("one"));
  }
  assert.deepEqual(h.opponents.get("one"), one);
  assert.deepEqual(h.opponents.get("two"), two);
  assert.equal(h.playerClock, clock);
  assert.equal(h.attacks, attacks);
  h.selectTarget("two");
  h.playerClock = stats(h.save).interval;
  h.tick(0);
  assert.ok(h.opponents.get("two")!.hp < two.hp);
  assert.equal(h.opponents.get("one")!.hp, one.hp);
  assert.equal(h.selectTarget("missing"), false);
});

test("killing one grants one reward and selects the next without healing or restarting enemy clocks", () => {
  const s = fresh("naruto"),
    h = new Hunt(s, () => 0.99),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p);
  h.hp -= 20;
  const hp = h.hp,
    clock = h.opponents.get("two")!.clock;
  h.enemyHp = 1;
  h.playerClock = stats(s).interval;
  h.tick(0);
  assert.equal(s.kills, 1);
  assert.equal(h.targetId, "two");
  assert.equal(h.phase, "combatendo");
  assert.equal(h.hp, hp);
  assert.equal(h.enemyClock, clock);
  h.enemyHp = 1;
  h.playerClock = stats(s).interval;
  h.tick(0);
  assert.equal(s.kills, 2);
  assert.equal(h.phase, "recompensas");
  const coins = s.coins;
  for (let i = 0; i < 30; i++) h.tick(100);
  assert.equal(s.coins, coins);
  assert.equal(s.kills, 2);
  assert.equal(h.phase, "explorando");
  assert.ok(h.hp > hp);
});

test("lethal manual skill resolves before a target switch and never loses or duplicates a kill", () => {
  const s = fresh("sasuke"),
    h = new Hunt(s, () => 0.99),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p);
  h.enemyHp = 1;
  assert.ok(h.castSkill());
  assert.equal(s.kills, 1);
  assert.equal(h.targetId, "two");
  assert.equal(h.selectTarget("one"), false);
  for (let i = 0; i < 3; i++) h.tick(100);
  assert.equal(s.kills, 1);
});

test("out-of-range attackers neither deal damage nor receive hits and cannot bank a burst", () => {
  const h = new Hunt(fresh("naruto")),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p, false);
  h.opponents.get("one")!.inRange = false;
  h.selectTarget("two");
  const hp = h.hp,
    enemyHp = h.enemyHp;
  for (let i = 0; i < 100; i++) h.tick(100);
  assert.equal(h.hp, hp);
  assert.equal(h.enemyHp, enemyHp);
  assert.equal(h.castSkill(), false);
  h.opponents.get("two")!.inRange = true;
  h.tick(0);
  const attacks = h.enemyAttacks;
  h.tick(0);
  assert.equal(h.enemyAttacks, attacks);
});

test("pause freezes all opponents and a defeat occurs once with multiple simultaneous attackers", () => {
  const s = fresh("naruto"),
    h = new Hunt(s),
    p = durable();
  h.encounter(p, "one");
  h.join("two", p);
  s.paused = true;
  const before = JSON.stringify([...h.opponents.values()]),
    clock = h.playerClock;
  for (let i = 0; i < 30; i++) h.tick(100);
  assert.equal(JSON.stringify([...h.opponents.values()]), before);
  assert.equal(h.playerClock, clock);
  assert.equal(h.selectTarget("two"), false);
  s.paused = false;
  h.hp = 1;
  h.tick(220);
  assert.equal(h.phase, "derrota");
  assert.equal(s.defeats, 1);
  for (let i = 0; i < 5; i++) h.tick(100);
  assert.equal(s.defeats, 1);
  assert.equal(s.kills, 0);
});

test("leaving combat removes only that attacker, changes the target and never grants rewards", () => {
  const s = fresh("naruto"),
    h = new Hunt(s);
  h.encounter(durable(), "one");
  h.join("two", durable());
  h.leave("one");
  assert.equal(h.targetId, "two");
  assert.equal(h.phase, "combatendo");
  h.leave("two");
  assert.equal(h.phase, "explorando");
  assert.equal(s.kills, 0);
  assert.equal(h.livingOpponents.length, 0);
});
