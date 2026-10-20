import test from "node:test";
import assert from "node:assert/strict";
import { AutoHuntNavigator } from "../src/world/auto-hunt.ts";
import type { NativeNavigation, Point } from "../src/world/navigation.ts";

test("automatic hunt keeps its target aligned with the route and replans when it moves", () => {
  const calls: Point[] = [];
  const nav = { clear: () => true, path: (_from: Point, to: Point) => { calls.push({ ...to }); return [{ ...to }]; } } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 }, first = { x: 100, y: 0 }, second = { x: 120, y: 0 };
  let state = hunt.update(hero, [first, second], 16, nav);
  assert.equal(state.target, first);
  second.x = 35;
  state = hunt.update(hero, [first, second], 100, nav);
  assert.equal(state.target, first);
  assert.equal(calls.length, 1);
  first.x = 130;
  state = hunt.update(hero, [first, second], 500, nav);
  assert.equal(state.target, first);
  assert.deepEqual(calls.at(-1), { x: 130, y: 0 });
  state = hunt.update(hero, [second], 16, nav);
  assert.equal(state.target, second);
});

test("unreachable targets are skipped and pathfinding retries are throttled", () => {
  let calls = 0;
  const nav = { clear: () => false, path: (_from: Point, to: Point) => { calls++; return to.x === 50 ? [] : [{ ...to }]; } } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 }, unreachable = { x: 50, y: 0 }, reachable = { x: 100, y: 0 };
  assert.equal(hunt.update(hero, [unreachable, reachable], 16, nav).target, undefined);
  for (let i = 0; i < 20; i++) hunt.update(hero, [unreachable, reachable], 16, nav);
  assert.equal(calls, 1);
  assert.equal(hunt.update(hero, [unreachable, reachable], 200, nav).target, reachable);
  assert.equal(calls, 2);
});
