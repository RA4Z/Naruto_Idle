import test from "node:test";
import assert from "node:assert/strict";
import {
  NativeNavigation,
  advancePath,
  type Point,
} from "../src/world/navigation.ts";
import { meleeApproach, meleeReachable } from "../src/world/melee.ts";

function fixture(doorway = true) {
  const wall = (y: number, height: number) => [
    { x: 190, y },
    { x: 200, y },
    { x: 200, y: y + height },
    { x: 190, y: y + height },
  ];
  return new NativeNavigation({
    sourceWidth: 400,
    sourceHeight: 400,
    columns: 40,
    rows: 40,
    cellWidth: 10,
    cellHeight: 10,
    unitsPerSourcePixel: 1,
    cells: Array.from({ length: 1600 }, (_, n) => [n % 40, Math.floor(n / 40)]),
    obstacles: doorway ? [wall(-100, 205), wall(119, 200)] : [wall(-100, 420)],
  });
}

test("a nonempty slot route behind a wall falls back to an actual melee approach", () => {
  const nav = fixture(),
    hero = { x: 180, y: 98 },
    enemy = { x: 230, y: 98 };
  const oldSlot = nav.nearest({ x: hero.x + 21, y: hero.y })!;
  const oldRoute = nav.path(enemy, oldSlot);
  assert.ok(oldRoute.length); // Previously accepted despite ending across the wall.
  assert.equal(meleeReachable(oldRoute.at(-1)!, hero, nav), false);
  const route = meleeApproach(enemy, hero, 0, nav);
  assert.ok(route.length);
  assert.ok(meleeReachable(route.at(-1)!, hero, nav));
  let previous: Point = enemy;
  for (
    let frame = 0;
    frame < 300 && !meleeReachable(previous, hero, nav);
    frame++
  ) {
    const next = advancePath(previous, route, 1.6, nav);
    assert.ok(nav.clear(previous, next));
    assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) <= 1.60001);
    previous = next;
  }
  assert.ok(meleeReachable(previous, hero, nav));
});

test("all six positions around a narrow doorway lead into melee or reject unreachable prey", () => {
  for (let slot = 0; slot < 6; slot++) {
    const hero = { x: 180, y: 98 },
      enemy = { x: 230, y: 98 };
    const nav = fixture();
    const route = meleeApproach(enemy, hero, slot, nav);
    assert.ok(route.length, `slot ${slot}`);
    assert.ok(meleeReachable(route.at(-1)!, hero, nav));
    assert.deepEqual(meleeApproach(enemy, hero, slot, fixture(false)), []);
  }
});

test("melee requires passage even at close range and already reachable enemies stay put", () => {
  const nav = fixture();
  assert.equal(
    meleeReachable({ x: 185, y: 98 }, { x: 205, y: 98 }, nav),
    false,
  );
  const enemy = { x: 170, y: 98 },
    hero = { x: 180, y: 98 };
  assert.ok(meleeReachable(enemy, hero, nav));
  assert.deepEqual(meleeApproach(enemy, hero, 0, nav), []);
});
