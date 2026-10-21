// Exercise the selector against every shipped map's actual navigation/obstacles.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { NativeNavigation } from "../src/world/navigation.ts";
import { withSceneGeometry } from "../src/world/scene-geometry.ts";
import { AutoHuntNavigator } from "../src/world/auto-hunt.ts";
const maps = JSON.parse(
  await readFile("public/assets/maps/index.json", "utf8"),
).maps;
const results = [];
for (const map of maps) {
  const grid = JSON.parse(await readFile("public" + map.navigation, "utf8"));
  const nav = new NativeNavigation(withSceneGeometry(map.id, grid));
  const hero = nav.nearest(map.spawn);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function cost(to) {
    if (distance(hero, to) < 28 && nav.clear(hero, to)) return 0;
    const path = nav.path(hero, to),
      end = path.at(-1);
    if (!end || distance(end, to) >= 28 || !nav.clear(end, to)) return Infinity;
    let sum = distance(end, to),
      previous = hero;
    for (const point of path) {
      sum += distance(previous, point);
      previous = point;
    }
    return Math.max(0, sum - 28);
  }
  const candidates = Array.from({ length: 6 }, (_, i) => ({
    ...nav.points[((i + 1) * 137) % nav.points.length],
  }));
  const hunt = new AutoHuntNavigator();
  const expected = Math.min(...candidates.map(cost));
  const chosen = hunt.update(hero, candidates, 16, nav);
  assert.ok(chosen.target, `${map.id}: no reachable target`);
  assert.ok(
    Math.abs(cost(chosen.target) - expected) < 0.01,
    `${map.id}: chose a longer route`,
  );
  let previous = hero;
  for (const point of chosen.path) {
    assert.ok(nav.clear(previous, point));
    previous = point;
  }
  const near = nav
    .pointsWithin(hero, 55)
    .find((p) => distance(hero, p) > 30 && nav.clear(hero, p));
  const far = nav.points.find(
    (p) => distance(hero, p) > 160 && Number.isFinite(cost(p)),
  );
  assert.ok(near && far, `${map.id}: missing test positions`);
  const switching = new AutoHuntNavigator();
  assert.equal(switching.update(hero, [far], 16, nav).target, far);
  assert.equal(switching.update(hero, [far, near], 500, nav).target, near);
  results.push({
    mapId: map.id,
    candidates: 6,
    shortestRoute: Math.round(expected),
    nearbyRespawnSelected: true,
    walkable: true,
  });
}
await writeFile(
  "reports/auto-hunt-navigation-validation.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      results,
      scope:
        "Real navigation grids for all shipped maps; selection and closer respawn, not rendered browser coverage",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    maps: results.length,
    shortestRoutes: true,
    nearbyRespawns: true,
  }),
);
