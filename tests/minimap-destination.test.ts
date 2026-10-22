import test from "node:test";
import assert from "node:assert/strict";
import { radarProjection } from "../src/world/map-projection.ts";
import { RouteOverlay } from "../src/world/route-overlay.ts";
import { Minimap } from "../src/world/minimap.ts";

test("local minimap centers the hero, follows movement and roundtrips nearby clicks", () => {
  for (const [width, height] of [
    [1000, 1000],
    [5000, 400],
    [400, 5000],
  ]) {
    const hero = { x: width / 2, y: height / 2 };
    const p = radarProjection(width, height, hero);
    assert.deepEqual(p.project(hero), { x: 120, y: 120 });
    for (const point of [hero, { x: hero.x + 50, y: hero.y - 50 }]) {
      const q = p.project(point);
      assert.ok(Math.hypot(q.x - 120, q.y - 120) < 117);
      const back = p.unproject(q)!;
      assert.ok(
        Math.abs(back.x - point.x) < 0.001 &&
          Math.abs(back.y - point.y) < 0.001,
      );
    }
    assert.equal(p.unproject({ x: 0, y: 0 }), undefined);
    assert.equal(p.unproject({ x: 240, y: 120 }), undefined);
    const moved = { x: hero.x + 20, y: hero.y + 30 };
    const next = radarProjection(width, height, moved);
    assert.deepEqual(next.project(moved), { x: 120, y: 120 });
    assert.ok(next.project(hero).x < 120 && next.project(hero).y < 120);
    assert.equal(p.scale, next.scale, "Walking never changes zoom");
  }
});

test("local minimap rejects clicks beyond map edges and keeps the same nearby scale on large maps", () => {
  const edge = radarProjection(1000, 1000, { x: 0, y: 0 });
  assert.equal(edge.unproject({ x: 100, y: 120 }), undefined);
  assert.equal(edge.unproject({ x: 120, y: 100 }), undefined);
  assert.deepEqual(edge.unproject({ x: 120, y: 120 }), { x: 0, y: 0 });
  assert.ok(edge.unproject({ x: 150, y: 150 }));
  const large = radarProjection(5000, 5000, { x: 2500, y: 2500 });
  assert.equal(edge.scale, large.scale);
  assert.ok(Math.abs(large.project({ x: 2720, y: 2500 }).x - 236) < 0.001);
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

test("per-frame following reuses markers and keeps their world position between HUD refreshes", () => {
  let created = 0;
  class Element {
    attrs = new Map<string, string>();
    children: Element[] = [];
    textContent = "";
    dataset = {};
    constructor() {
      created++;
    }
    setAttribute(k: string, v: string) {
      this.attrs.set(k, String(v));
    }
    removeAttribute(k: string) {
      this.attrs.delete(k);
    }
    append(...nodes: Element[]) {
      this.children.push(...nodes);
    }
    replaceChildren() {
      this.children = [];
    }
    addEventListener() {}
    remove() {}
  }
  const oldDoc = globalThis.document,
    oldObserver = globalThis.ResizeObserver;
  Object.assign(globalThis, {
    document: {
      createElement: () => new Element(),
      createElementNS: () => new Element(),
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  try {
    const minimap = new Minimap(new Element() as any, () => true);
    minimap.setMap(
      {
        id: "test",
        width: 1000,
        height: 1000,
        spawn: { x: 500, y: 500 },
        thumbnail: "test.jpg",
      } as any,
      [],
    );
    const state = {
      hero: { x: 500, y: 500 },
      enemies: [{ x: 550, y: 500, elite: false, name: "Enemy" }],
      npcs: [],
      path: [],
      auto: false,
      view: { x: 0, y: 0, width: 1000, height: 1000 },
    };
    minimap.update(state);
    const before = created;
    const markers = (minimap as any).moving as Element;
    const enemy = markers.children.find((n) =>
      n.children.some((t) => t.textContent === "Enemy"),
    )!;
    const oldX = Number(enemy.attrs.get("cx"));
    const next = { x: 510, y: 500 };
    minimap.follow(next);
    assert.equal(
      created,
      before,
      "Animation frames must not create SVG elements",
    );
    assert.ok(markers.children.includes(enemy));
    const offset =
      radarProjection(1000, 1000, next).x -
      radarProjection(1000, 1000, state.hero).x;
    assert.equal(markers.attrs.get("transform"), `translate(${offset} 0)`);
    assert.ok(
      Math.abs(
        oldX +
          offset -
          radarProjection(1000, 1000, next).project({ x: 550, y: 500 }).x,
      ) < 0.001,
    );
    minimap.update({ ...state, hero: next });
    assert.equal(
      markers.attrs.has("transform"),
      false,
      "HUD refresh resets the pan origin without doubling the offset",
    );
    minimap.destroy();
  } finally {
    Object.assign(globalThis, {
      document: oldDoc,
      ResizeObserver: oldObserver,
    });
  }
});
