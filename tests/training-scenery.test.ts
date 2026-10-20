import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NativeNavigation, advancePath } from "../src/world/navigation.ts";
import { withSceneGeometry } from "../src/world/scene-geometry.ts";

const raw = JSON.parse(readFileSync(new URL("../public/assets/maps/10006/navigation.json", import.meta.url), "utf8"));
const nav = new NativeNavigation(withSceneGeometry("10006", raw));
const point = (x: number, y: number) => ({ x: x * raw.unitsPerSourcePixel, y: y * raw.unitsPerSourcePixel });

test("authored blockers remove formerly allowed positions on foliage and fence", () => {
  const original = new NativeNavigation(raw);
  for (const [x, y] of [[840, 1420], [904, 1420], [715, 1570]]) {
    assert.ok(original.walkable(point(x, y)), `original ${x},${y}`);
    assert.equal(nav.walkable(point(x, y)), false, `corrected ${x},${y}`);
    assert.ok(nav.points.every(p => nav.walkable(p)));
  }
});

test("southern gate remains traversable in both directions without crossing fence", () => {
  for (const [from, to] of [[point(600, 1320), point(600, 1700)], [point(600, 1700), point(600, 1320)]]) {
    const path = nav.path(from, to);
    assert.ok(path.length);
    let position = { ...from };
    for (let i = 0; path.length && i < 1000; i++) {
      position = advancePath(position, path, 1.6, nav);
      assert.ok(nav.walkable(position));
    }
    assert.ok(Math.hypot(position.x - to.x, position.y - to.y) < 0.2);
  }
});

test("saved positions inside scenery relocate and routes around the clearing remain valid", () => {
  const corrected = nav.nearest(point(904, 1420));
  assert.ok(corrected && nav.walkable(corrected));
  const spawn = { x: 350, y: 200 };
  assert.ok(nav.walkable(spawn));
  for (const target of [point(1100, 1150), point(1550, 1480), point(600, 1700)]) {
    const path = nav.path(spawn, target);
    assert.ok(path.length);
    let previous = spawn;
    for (const p of path) { assert.ok(nav.clear(previous, p)); previous = p; }
  }
});

test("corrections preserve original data and ignore unknown maps", () => {
  assert.equal(withSceneGeometry("unknown", raw), raw);
  assert.equal(raw.obstacles, undefined);
});
