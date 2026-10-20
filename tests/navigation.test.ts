import test from "node:test";
import assert from "node:assert/strict";
import { ROUTE } from "../src/config/areas.ts";
import {
  nextEncounterIndex,
  actorScale,
  CAMERA_ZOOM,
  HERO_HEIGHT,
  isWalkable,
} from "../src/navigation.ts";
test("every patrol segment has clearance inside the audited street, in both directions", () => {
  for (let i = 1; i < ROUTE.length; i++)
    for (let j = 0; j <= 100; j++) {
      const t = j / 100,
        a = ROUTE[i - 1],
        b = ROUTE[i];
      assert.ok(
        isWalkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
        `segment ${i}, sample ${j}`,
      );
    }
});
test("roofs, fenced yard, and the former invalid patrol are not walkable", () => {
  for (const p of [
    { x: 470, y: 445 },
    { x: 425, y: 570 },
    { x: 380, y: 675 },
    { x: 720, y: 350 },
    { x: 300, y: 350 },
  ])
    assert.equal(isWalkable(p), false, JSON.stringify(p));
});
test("mode reference silhouettes have equal height; camera zoom does not depend on position", () => {
  for (const [id, world, battle] of [
    ["naruto", 107, 118],
    ["sasuke", 113, 129],
    ["sakura", 119, 130],
  ] as const) {
    assert.ok(Math.abs(actorScale(id, "world") * world - HERO_HEIGHT) < 1e-9);
    assert.ok(Math.abs(actorScale(id, "battle") * battle - HERO_HEIGHT) < 1e-9);
  }
  assert.ok(CAMERA_ZOOM > 1.35);
});

test("end-of-street targets move onto the return leg instead of repeatedly respawning beside the hero", () => {
  assert.equal(nextEncounterIndex(5, 1, 6), 3);
  assert.equal(nextEncounterIndex(0, -1, 6), 2);
  for (let target = 0; target < 6; target++)
    for (const step of [-1, 1]) {
      const next = nextEncounterIndex(target, step, 6);
      assert.ok(next >= 0 && next < 6);
      assert.notEqual(next, target);
    }
});
