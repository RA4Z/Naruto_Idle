import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NativeNavigation } from "../src/world/navigation.ts";
import { withSceneGeometry } from "../src/world/scene-geometry.ts";
import { sceneryProfile } from "../src/world/map-scenery.ts";

const maps = JSON.parse(readFileSync(new URL("../public/assets/maps/index.json", import.meta.url), "utf8")).maps;
for (const map of maps) {
  test(`${map.id}: scenery corrections preserve routes from the spawn and valid actor positions`, () => {
    const raw = JSON.parse(readFileSync(new URL(`../public${map.navigation}`, import.meta.url), "utf8"));
    const grid = withSceneGeometry(map.id, raw), nav = new NativeNavigation(grid);
    if (["10001", "10005", "10006", "10008"].includes(map.id)) assert.ok(grid.obstacles?.length);
    else assert.equal(grid.obstacles, undefined);
    const spawn = nav.nearest(map.spawn)!;
    assert.ok(nav.walkable(spawn));
    assert.ok(nav.points.every(point => nav.walkable(point)));
    for (let i = 0; i < 50; i++) {
      const end = nav.points[(i * 137) % nav.points.length];
      if (Math.hypot(spawn.x - end.x, spawn.y - end.y) < 0.1) continue;
      const path = nav.path(spawn, end);
      assert.ok(path.length, `${map.id}, sample ${i}`);
      let previous = spawn;
      for (const point of path) { assert.ok(nav.clear(previous, point)); previous = point; }
      assert.ok(Math.hypot(previous.x - end.x, previous.y - end.y) < 0.1);
    }
    assert.equal(raw.obstacles, undefined);
    for (const cutout of sceneryProfile(map.id)?.cutouts || []) {
      assert.ok(cutout.groundY > 0);
      assert.ok(cutout.points.every(([x, y]) => x >= 0 && y >= 0 && x <= map.width / raw.unitsPerSourcePixel && y <= map.height / raw.unitsPerSourcePixel));
    }
  });
}
