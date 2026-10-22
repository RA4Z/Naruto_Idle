import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NativeNavigation,
  type NativeGrid,
  type Point,
} from "../src/world/navigation.ts";
import { KeyboardNavigator } from "../src/world/keyboard-navigation.ts";

const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];
function fixture(gap = true) {
  const grid: NativeGrid = {
    sourceWidth: 400,
    sourceHeight: 400,
    columns: 40,
    rows: 40,
    cellWidth: 10,
    cellHeight: 10,
    unitsPerSourcePixel: 1,
    cells: Array.from({ length: 1600 }, (_, n) => [n % 40, Math.floor(n / 40)]),
    obstacles: gap
      ? [rectangle(190, -100, 10, 205), rectangle(190, 119, 10, 200)]
      : [rectangle(190, -100, 10, 420)],
  };
  return new NativeNavigation(grid);
}

test("keyboard steering aligns a narrow doorway while ordinary axis sliding gets stuck", () => {
  const nav = fixture(),
    keyboard = new KeyboardNavigator();
  let assisted: Point = { x: 170, y: 98 },
    plain = { ...assisted };
  assert.ok(nav.path(assisted, { x: 230, y: 110 }).length);
  let usedAssist = false;
  for (let frame = 0; frame < 85; frame++) {
    const previous = assisted;
    assisted = keyboard.move(previous, 1, 0, 100, 16, nav);
    plain = nav.move(plain, 1.6, 0);
    usedAssist ||= keyboard.assisted;
    assert.ok(nav.walkable(assisted));
    assert.ok(nav.clear(previous, assisted));
    assert.ok(
      Math.hypot(assisted.x - previous.x, assisted.y - previous.y) <= 1.60001,
    );
  }
  assert.ok(usedAssist);
  assert.ok(plain.x < 190);
  assert.ok(assisted.x > 220, JSON.stringify(assisted));
});

test("a solid wall is never crossed and releasing/reversing input immediately cancels assistance", () => {
  const nav = fixture(false),
    keyboard = new KeyboardNavigator();
  let p = { x: 170, y: 98 };
  for (let i = 0; i < 85; i++) p = keyboard.move(p, 1, 0, 100, 16, nav);
  assert.ok(p.x < 190);
  assert.deepEqual(keyboard.move(p, 0, 0, 100, 16, nav), p);
  assert.equal(keyboard.assisted, false);
  const reverse = keyboard.move(p, -1, 0, 100, 16, nav);
  assert.ok(reverse.x < p.x);
  assert.equal(reverse.y, p.y);
});

test("local searches have a strict node budget without changing the normal mouse pathfinder", () => {
  const nav = fixture();
  const start = { x: 170, y: 98 },
    target = { x: 230, y: 110 };
  assert.ok(nav.path(start, target).length);
  assert.deepEqual(nav.path(start, target, 3, 0), []);
  assert.ok(nav.path(start, target).length);
});

test("keyboard assistance preserves collision and speed constraints on recovered maps in eight directions", () => {
  for (const map of ["10001", "10005", "10006", "10008"]) {
    const nav = new NativeNavigation(
      JSON.parse(
        readFileSync(`public/assets/maps/${map}/navigation.json`, "utf8"),
      ),
    );
    for (let sample = 0; sample < 4; sample++)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const keyboard = new KeyboardNavigator();
        let p = nav.points[Math.floor((nav.points.length * (sample + 1)) / 5)];
        for (let frame = 0; frame < 12; frame++) {
          const next = keyboard.move(p, dx, dy, 120, 16, nav);
          assert.ok(nav.walkable(next), `${map} produced a blocked point`);
          assert.ok(
            Math.hypot(next.x - p.x, next.y - p.y) <= 1.92001,
            `${map} exceeded movement speed`,
          );
          p = next;
        }
      }
  }
});
