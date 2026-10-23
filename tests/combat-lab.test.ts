import test from "node:test";
import assert from "node:assert/strict";
import { labAttack, labLocomotion } from "../src/admin/lab-model.ts";
import { meleeProbe, meleeReachable } from "../src/world/melee.ts";
import type { NativeNavigation } from "../src/world/navigation.ts";
const free = { clear: () => true } as unknown as NativeNavigation;
const wall = { clear: () => false } as unknown as NativeNavigation;
const origin = { x: 10, y: 10 };

test("lab and gameplay keep the strict 28-unit boundary and wall test", () => {
  const inside = { x: 37.999, y: 10 }, edge = { x: 38, y: 10 };
  assert.equal(meleeProbe(origin, inside, free).reachable, true);
  assert.equal(meleeReachable(origin, inside, free), true);
  assert.equal(meleeProbe(origin, edge, free).reachable, false);
  assert.equal(meleeProbe(origin, inside, wall).reason, "blocked");
  assert.equal(meleeReachable(origin, inside, wall), false);
  assert.equal(meleeProbe(origin, { x: NaN, y: 1 }, free).reachable, false);
});
test("no opening attack escapes the range or wall check in the real Hunt harness", () => {
  for (const kind of ["basic", "skill"] as const) {
    assert.equal(labAttack("11000101", kind, origin, { x: 100, y: 10 }, free).damage, 0);
    assert.equal(labAttack("11000101", kind, origin, { x: 20, y: 10 }, wall).damage, 0);
  }
});
test("near basic and jutsu attacks use real level-one damage; pause and movement suppress both", () => {
  for (const kind of ["basic", "skill"] as const) {
    const hit = labAttack("11000101", kind, origin, { x: 20, y: 10 }, free);
    assert.ok(hit.damage > 0);
    assert.equal(hit.simulationOnly, true);
    assert.equal(hit.damageTiming, "logical-resolution-before-visual-animation");
    assert.equal(labAttack("11000101", kind, origin, { x: 20, y: 10 }, free, true).damage, 0);
    assert.equal(labAttack("11000101", kind, origin, { x: 20, y: 10 }, free, false, true).damage, 0);
  }
});
test("repeated probes neither contact cloud/storage nor inherit progression from earlier tests", (context) => {
  context.mock.method(globalThis, "fetch", () => { throw new Error("A sandbox cannot contact an account"); });
  const first = labAttack("11000211", "basic", origin, { x: 20, y: 10 }, free);
  for (let i = 0; i < 8; i++) assert.deepEqual(labAttack("11000211", "basic", origin, { x: 20, y: 10 }, free), first);
});
test("visual crops, extracted timelines and display scale are not inputs to collision", () => {
  const a = { ...origin, width: 5, height: 7, scaleX: 1, frame: "0" };
  const b = { x: 36, y: 10, width: 2000, height: 2000, scaleX: 100, frame: "100" };
  const before = meleeProbe(a, b, free);
  a.width = 50000; a.scaleX = .01; b.frame = "200";
  assert.deepEqual(meleeProbe(a, b, free), before);
});

test("RPG source movement uses exact walk clips without inventing gameplay actions", () => {
  const modes = { source: { animations: { walk_4: {}, sit_idle: {}, A_1hit: {} } } };
  assert.deepEqual(labLocomotion(modes, true, 4), { mode: "source", action: "walk_4" });
  assert.deepEqual(labLocomotion(modes, false, 4), { mode: "source", action: "sit_idle" });
  assert.equal(labLocomotion(modes, true, 0), undefined);
  assert.equal(Object.hasOwn(modes.source.animations, "run_4"), false);
});

test("source-only identities cannot reach damage simulation even if a caller skips the UI guard", () => {
  assert.throws(() => labAttack("role-source-35fb8dc3e2b349fb", "skill", origin, { x: 20, y: 10 }, free), /SOURCE_PREVIEW_ONLY/);
});
