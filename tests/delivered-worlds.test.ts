import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { IMPLEMENTED_MAP_IDS } from "../src/config/maps.ts";
import { NativeNavigation } from "../src/world/navigation.ts";
import { withSceneGeometry } from "../src/world/scene-geometry.ts";
import { fresh, restore } from "../src/model.ts";
import { cloudSnapshot } from "../src/cloud/snapshot.ts";
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const maps = json("public/assets/maps/index.json").maps;
const planned = json("tools/world-expansion-specs.json");

test("every delivered map is registered with native navigation, valid spawn and portable runtime files", () => {
  assert.equal(maps.length, 145);
  assert.equal(new Set(maps.map((m: any) => m.id)).size, 145);
  assert.deepEqual(
    [...IMPLEMENTED_MAP_IDS].sort(),
    maps.map((m: any) => m.id).sort(),
  );
  for (const map of maps) {
    for (const field of ["background", "foreground", "thumbnail", "navigation"])
      assert.ok(
        map[field].startsWith("/assets/") && existsSync("public" + map[field]),
        map.id + " " + field,
      );
    const nav = new NativeNavigation(
      withSceneGeometry(map.id, json("public" + map.navigation)),
    );
    const spawn = nav.nearest(map.spawn);
    assert.ok(spawn && nav.walkable(spawn), map.id + " reachable spawn");
    if (planned[map.id])
      assert.ok(nav.walkable(map.spawn), map.id + " native spawn");
    assert.ok(
      map.spawn.x >= 0 &&
        map.spawn.y >= 0 &&
        map.spawn.x < map.width &&
        map.spawn.y < map.height,
    );
    assert.ok(map.nativeAlpha && existsSync("public" + map.nativeAlpha.url));
    const plan = planned[map.id];
    if (plan) {
      assert.equal(map.collection, plan.collection);
      assert.equal(map.kind, plan.kind);
      if (plan.collection !== "world") {
        assert.equal(map.kind, "exploration");
        assert.deepEqual(map.enemies, []);
      }
    }
  }
});

test("cloud snapshot and reload preserve every destination including safe scenarios", () => {
  for (const map of maps) {
    const save = fresh("sasuke", 1000);
    save.location = map.id;
    save.visitedMaps = maps.map((m: any) => m.id);
    save.worldPosition = { mapId: map.id, ...map.spawn };
    save.autoHunt = false;
    const snapshot = cloudSnapshot(save);
    const loaded = restore(
      { read: () => JSON.stringify(snapshot), write: () => {} },
      1000,
    );
    assert.ok(loaded, map.id);
    assert.equal(loaded.save.location, map.id);
    assert.deepEqual(loaded.save.worldPosition, save.worldPosition);
    assert.deepEqual(loaded.save.visitedMaps, save.visitedMaps);
    assert.equal(loaded.save.activeEntityId, "11000211");
  }
});
