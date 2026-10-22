import test from "node:test";
import assert from "node:assert/strict";
import { mapProjection } from "../src/world/map-projection.ts";
import { RouteOverlay } from "../src/world/route-overlay.ts";

test("circular minimap fits every map corner and roundtrips click coordinates", () => {
  for (const [width, height] of [
    [1000, 1000],
    [5000, 400],
    [400, 5000],
  ]) {
    const p = mapProjection(width, height, 240, 240, 38);
    for (const point of [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ]) {
      const q = p.project(point);
      assert.ok(Math.hypot(q.x - 120, q.y - 120) < 117);
      const back = p.unproject(q)!;
      assert.ok(
        Math.abs(back.x - point.x) < 0.001 &&
          Math.abs(back.y - point.y) < 0.001,
      );
    }
    assert.equal(p.unproject({ x: 0, y: 0 }), undefined);
  }
});

test("movement renders destination and selected enemy rings without a path line", () => {
  const rings: number[][] = [];
  const graphics = {
    clear() {
      rings.length = 0;
      return this;
    },
    lineStyle() {
      return this;
    },
    strokeEllipse(...args: number[]) {
      rings.push(args);
      return this;
    },
    setDepth() {
      return this;
    },
  };
  const overlay = new RouteOverlay({
    add: { graphics: () => graphics },
  } as any);
  overlay.update(
    { x: 0, y: 0 },
    [
      { x: 20, y: 30 },
      { x: 40, y: 50 },
    ],
    { x: 60, y: 70 },
    false,
  );
  assert.deepEqual(rings, [
    [40, 50, 12, 6],
    [60, 70, 34, 13],
  ]);
  overlay.update({ x: 0, y: 0 }, [], undefined, false);
  assert.deepEqual(rings, []);
});
