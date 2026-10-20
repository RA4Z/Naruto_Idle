import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NativeNavigation, type NativeGrid } from "../src/world/navigation.ts";
import { fresh, restore } from "../src/model.ts";
const ids = ["10001", "10005", "10006", "10008"];
const maps = ids.map((id) => ({
  id,
  nav: new NativeNavigation(
    JSON.parse(
      readFileSync(
        new URL(`../public/assets/maps/${id}/navigation.json`, import.meta.url),
        "utf8",
      ),
    ) as NativeGrid,
  ),
}));
test("native cell projection round-trips all original map walking cells", () => {
  for (const { nav } of maps)
    for (const [x, y] of nav.grid.cells) {
      assert.deepEqual(nav.cell(nav.center(x, y)), [x, y]);
      assert.ok(nav.walkable(nav.center(x, y)));
    }
});
test("paths across each recovered map stay on native walkable ground", () => {
  for (const { id, nav } of maps)
    for (let i = 0; i < 12; i++) {
      const a = nav.points[(i * 137) % nav.points.length],
        b = nav.points[(i * 431 + 701) % nav.points.length],
        route = nav.path(a, b);
      assert.ok(route.length, `${id}: path ${i}`);
      let previous = a;
      for (const p of route) {
        assert.ok(nav.clear(previous, p), `${id}: blocked segment`);
        previous = p;
      }
      assert.ok(Math.hypot(previous.x - b.x, previous.y - b.y) < 0.01);
    }
});
test("manual movement and large deltas cannot cross a blocked native cell", () => {
  for (const { nav } of maps) {
    let p = nav.points[Math.floor(nav.points.length / 2)];
    for (let i = 0; i < 40; i++) {
      p = nav.move(p, Math.cos(i * 0.7) * 35, Math.sin(i * 0.7) * 35);
      assert.ok(nav.walkable(p));
    }
    assert.equal(nav.walkable({ x: -20, y: -20 }), false);
  }
});
test("lobby and legacy saves do not earn hunt rewards or acquire a default companion", () => {
  for (const legacy of [false, true]) {
    const s = fresh("naruto", 1000);
    if (legacy) {
      delete s.location;
      delete s.autoHunt;
      delete s.partyIds;
      s.companionId = "11000201";
    }
    const result = restore(
      { read: () => JSON.stringify(s), write: () => {} },
      1000 + 3600000,
    )!;
    assert.equal(result.save.location, "10001");
    assert.deepEqual(result.save.partyIds, []);
    assert.equal(result.offline.xp, 0);
    assert.equal(result.save.autoHunt, false);
  }
});
test("party duplicates, invalid maps and invalid world positions are rejected", () => {
  for (const value of [
    { partyIds: ["11000201", "11000201"] },
    { location: "unknown" },
    { worldPosition: { mapId: "10001", x: -2, y: 2 } },
    { autoHunt: "yes" },
  ]) {
    const s = { ...fresh("naruto"), ...value };
    assert.equal(
      restore({ read: () => JSON.stringify(s), write: () => {} }),
      null,
    );
  }
});
