import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NativeNavigation, advancePath } from "../src/world/navigation.ts";

test("nearby point lookup matches a full scan on all four maps", () => {
  for (const id of ["10001", "10005", "10006", "10008"]) {
    const grid = JSON.parse(readFileSync(new URL(`../public/assets/maps/${id}/navigation.json`, import.meta.url), "utf8"));
    const nav = new NativeNavigation(grid);
    for (const center of [nav.points[0], nav.points[Math.floor(nav.points.length / 2)], { x: -50, y: -50 }]) {
      for (const radius of [12, 65, 320]) {
        const expected = nav.points.filter(p => Math.hypot(p.x - center.x, p.y - center.y) < radius);
        assert.deepEqual(nav.pointsWithin(center, radius), expected, `${id}, radius ${radius}`);
      }
    }
  }
});

test("routes across the four maps contain only traversable segments", () => {
  for (const id of ["10001", "10005", "10006", "10008"]) {
    const grid = JSON.parse(readFileSync(new URL(`../public/assets/maps/${id}/navigation.json`, import.meta.url), "utf8"));
    const nav = new NativeNavigation(grid);
    for (let i = 0; i < 8; i++) {
      const start = nav.points[(i * 137) % nav.points.length], target = nav.points[(i * 431 + 701) % nav.points.length];
      const path = nav.path(start, target);
      assert.ok(path.length, `${id}, route ${i}`);
      let previous = start;
      for (const point of path) { assert.ok(nav.clear(previous, point), `${id}, route ${i}`); previous = point; }
      assert.ok(Math.hypot(previous.x - target.x, previous.y - target.y) < 0.1);
    }
  }
});

test("sliding along an obstacle does not discard an unreached waypoint", () => {
  const route = [{ x: 10, y: 0 }];
  const nav = { move: () => ({ x: 3, y: 1 }) } as NativeNavigation;
  const position = advancePath({ x: 0, y: 0 }, route, 10, nav);
  assert.deepEqual(position, { x: 3, y: 1 });
  assert.equal(route.length, 1);
});
