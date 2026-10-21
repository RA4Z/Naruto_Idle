import test from "node:test";
import assert from "node:assert/strict";
import { AutoHuntNavigator } from "../src/world/auto-hunt.ts";
import type { NativeNavigation, Point } from "../src/world/navigation.ts";

test("automatic hunt reevaluates a much closer enemy on the throttled check and keeps its route aligned", () => {
  const calls: Point[] = [];
  const nav = {
    clear: () => true,
    path: (_from: Point, to: Point) => {
      calls.push({ ...to });
      return [{ ...to }];
    },
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 },
    first = { x: 100, y: 0 },
    second = { x: 120, y: 0 };
  let state = hunt.update(hero, [first, second], 16, nav);
  assert.equal(state.target, first);
  second.x = 35;
  state = hunt.update(hero, [first, second], 100, nav);
  assert.equal(state.target, first);
  assert.equal(calls.length, 1);
  first.x = 130;
  state = hunt.update(hero, [first, second], 500, nav);
  assert.equal(state.target, second);
  assert.deepEqual(state.path.at(-1), { x: 35, y: 0 });
  state = hunt.update(hero, [second], 16, nav);
  assert.equal(state.target, second);
});

test("unreachable targets are skipped and pathfinding retries are throttled", () => {
  let calls = 0;
  const nav = {
    clear: () => false,
    path: (_from: Point, to: Point) => {
      calls++;
      return to.x === 50 ? [] : [{ ...to }];
    },
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 },
    unreachable = { x: 50, y: 0 },
    reachable = { x: 100, y: 0 };
  assert.equal(
    hunt.update(hero, [unreachable, reachable], 16, nav).target,
    reachable,
  );
  for (let i = 0; i < 20; i++)
    hunt.update(hero, [unreachable, reachable], 16, nav);
  assert.equal(calls, 2);
  assert.equal(
    hunt.update(hero, [unreachable, reachable], 200, nav).target,
    reachable,
  );
  assert.equal(calls, 3);
});

test("selection compares walkable route length instead of proximity through a wall", () => {
  const hero = { x: 0, y: 0 },
    behindWall = { x: 60, y: 0 },
    open = { x: 110, y: 0 };
  const nav = {
    clear: () => true,
    path: (_from: Point, to: Point) =>
      to === behindWall
        ? [{ x: 0, y: 140 }, { x: 60, y: 140 }, { ...to }]
        : [{ ...to }],
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const result = hunt.update(hero, [behindWall, open], 16, nav);
  assert.equal(result.target, open);
  assert.deepEqual(result.path, [open]);
});

test("small patrol fluctuations do not cause target oscillation, but a nearby respawn wins", () => {
  const hero = { x: 0, y: 0 },
    first = { x: 120, y: 0 },
    other = { x: 130, y: 0 };
  const nav = {
    clear: () => true,
    path: (_from: Point, to: Point) => [{ ...to }],
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  assert.equal(hunt.update(hero, [first, other], 16, nav).target, first);
  for (let i = 0; i < 4; i++) {
    other.x = i % 2 === 0 ? 110 : 118;
    assert.equal(hunt.update(hero, [first, other], 500, nav).target, first);
  }
  const respawn = { x: 38, y: 0 };
  assert.equal(
    hunt.update(hero, [first, other, respawn], 500, nav).target,
    respawn,
  );
  const inRange = { x: 20, y: 0 };
  assert.equal(hunt.update(hero, [respawn, inRange], 500, nav).target, inRange);
});

test("slow target motion accumulates against the original route destination before replanning", () => {
  let calls = 0;
  const hero = { x: 0, y: 0 },
    enemy = { x: 100, y: 0 };
  const nav = {
    clear: () => true,
    path: (_from: Point, to: Point) => {
      calls++;
      return [{ ...to }];
    },
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  hunt.update(hero, [enemy], 16, nav);
  enemy.x = 110;
  hunt.update(hero, [enemy], 500, nav);
  assert.equal(calls, 1);
  enemy.x = 120;
  const result = hunt.update(hero, [enemy], 500, nav);
  assert.equal(calls, 2);
  assert.equal(result.target, enemy);
  assert.deepEqual(result.path.at(-1), enemy);
});

test("a nonempty route that stops outside reachable attack range is rejected", () => {
  const nav = {
    clear: () => false,
    path: () => [{ x: 55, y: 0 }],
  } as unknown as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  assert.equal(
    hunt.update({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 16, nav).target,
    undefined,
  );
  assert.equal(hunt.status, "unreachable");
});

test("a stalled pursuit switches targets and a disappeared enemy enters respawn waiting", () => {
  const nav = {
    clear: () => true,
    path: (_hero: Point, to: Point) => [{ ...to }],
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 },
    first = { x: 100, y: 0 },
    second = { x: 130, y: 0 };
  hunt.update(hero, [first, second], 16, nav);
  for (let i = 0; i < 25; i++) hunt.update(hero, [first, second], 100, nav);
  assert.equal(hunt.update(hero, [first, second], 16, nav).target, second);
  assert.equal(hunt.update(hero, [], 16, nav).target, undefined);
  assert.equal(hunt.status, "waiting");
});

test("a blocked segment triggers a throttled replan and moving targets have a pursuit deadline", () => {
  let calls = 0,
    blocked = false;
  const nav = {
    clear: () => !blocked,
    path: (_hero: Point, to: Point) => {
      calls++;
      return [{ ...to }];
    },
  } as NativeNavigation;
  const hunt = new AutoHuntNavigator<Point>();
  const hero = { x: 0, y: 0 },
    enemy = { x: 100, y: 0 };
  hunt.update(hero, [enemy], 16, nav);
  blocked = true;
  hunt.update(hero, [enemy], 500, nav);
  assert.equal(calls, 2);
  blocked = false;
  let excluded = false;
  for (let i = 0; i < 210; i++) {
    hero.x++;
    enemy.x++;
    if (!hunt.update(hero, [enemy], 100, nav).target) {
      excluded = true;
      break;
    }
  }
  assert.equal(excluded, true);
});
