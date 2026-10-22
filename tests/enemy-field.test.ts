import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { NativeNavigation } from "../src/world/navigation.ts";
import type { EntityManifest } from "../src/entities/types.ts";

// Exercise the production actor/field with a tiny rendering boundary. This is
// not a WebGL test: no browser, network, real account or save is involved.
const phaserStub =
  "data:text/javascript," +
  encodeURIComponent(`
  class Container {
    constructor(scene,x,y) { Object.assign(this,{scene,x,y,active:true,visible:true,alpha:1,angle:0}); }
    add() { return this; }
    setDepth() { return this; }
    setPosition(x,y) { Object.assign(this,{x,y}); return this; }
    setVisible(visible) { this.visible=visible; return this; }
    setAlpha(alpha) { this.alpha=alpha; return this; }
    destroy() { this.active=false; }
  }
  export default {GameObjects:{Container}};
`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../admin/debug-state")
      return next(
        "data:text/javascript,export const visionDebugEnabled=()=>false",
        context,
      );
    return next(specifier === "phaser" ? phaserStub : specifier, context);
  },
});
const { EnemyField } = await import("../src/world/enemies.ts");
const { EntityActor } = await import("../src/entities/actor.ts");

function graphic() {
  return {
    visible: false,
    setDepth() {
      return this;
    },
    setVisible(v: boolean) {
      this.visible = v;
      return this;
    },
    clear() {
      return this;
    },
    setOrigin() {
      return this;
    },
    setResolution() {
      return this;
    },
    setText() {
      return this;
    },
    setColor() {
      return this;
    },
    setStrokeStyle() {
      return this;
    },
  };
}
function scene() {
  const killed: unknown[] = [];
  return {
    killed,
    tweens: {
      killTweensOf(actor: unknown) {
        killed.push(actor);
      },
    },
    anims: {
      exists() {
        return true;
      },
    },
    add: {
      existing() {},
      graphics: graphic,
      text: graphic,
      ellipse: graphic,
      sprite() {
        return {
          origin: [0, 0],
          flipX: false,
          starts: 0,
          frame: { name: 0 },
          anims: {
            currentAnim: undefined as
              | undefined
              | { key: string; duration: number },
            isPlaying: true,
            timeScale: 1,
            pause() {},
            resume() {},
          },
          setOrigin(...values: number[]) {
            this.origin = values;
            return this;
          },
          setScale() {
            return this;
          },
          setFlipX(value: boolean) {
            this.flipX = value;
            return this;
          },
          play(key: string) {
            this.anims.currentAnim = { key, duration: 450 };
            this.starts++;
            this.frame.name = 0;
            return this;
          },
        };
      },
    },
  };
}
const animation = {
  url: "unused",
  frameWidth: 10,
  frameHeight: 10,
  frames: 2,
  fps: 24,
  origin: [0.5, 1],
  frameOrigins: [
    [0.5, 1],
    [0.2, 0.8],
  ],
  status: "ready",
};
const manifest = {
  id: "19000101",
  name: "Ninja",
  capabilities: { companion: true },
  modes: {
    world: {
      referenceHeight: 120,
      animations: Object.fromEntries(
        [...Array.from({ length: 8 }, (_, i) => "run_" + i), "idle_0"].map(
          (key) => [key, animation],
        ),
      ),
    },
    battle: {
      referenceHeight: 120,
      animations: Object.fromEntries(
        ["C_idle", "A_1hit", "C_hurt", "C_dead"].map((key) => [key, animation]),
      ),
    },
  },
} as unknown as EntityManifest;
function setup() {
  const render = scene();
  const nav = new NativeNavigation({
    sourceWidth: 400,
    sourceHeight: 400,
    columns: 40,
    rows: 40,
    cellWidth: 10,
    cellHeight: 10,
    unitsPerSourcePixel: 1,
    cells: Array.from({ length: 1600 }, (_, n) => [n % 40, Math.floor(n / 40)]),
    obstacles: [
      [
        { x: 190, y: -100 },
        { x: 200, y: -100 },
        { x: 200, y: 105 },
        { x: 190, y: 105 },
      ],
      [
        { x: 190, y: 119 },
        { x: 200, y: 119 },
        { x: 200, y: 319 },
        { x: 190, y: 319 },
      ],
    ],
  });
  const hero = { x: 180, y: 98 };
  const field = new EnemyField(render as never);
  field.reset("test", [manifest], hero, nav, false);
  field.members = field.members.slice(0, 1);
  const mob = field.members[0];
  mob.actor.setPosition(230, 98);
  mob.home = { x: 230, y: 98 };
  return { render, nav, hero, field, mob };
}

test("repeating a movement animation preserves its current frame origin and playback", () => {
  const actor = new EntityActor(scene() as never, 0, 0, manifest, "enemy");
  actor.play("world", "run_0");
  const visual = actor.visual as unknown as ReturnType<
    ReturnType<typeof scene>["add"]["sprite"]
  >;
  visual.frame.name = 1;
  actor.tick(false);
  const starts = visual.starts;
  actor.play("world", "run_0");
  assert.deepEqual(visual.origin, [0.2, 0.8]);
  assert.equal(visual.starts, starts);
  actor.play("world", "run_0", true);
  assert.equal(visual.starts, starts + 1);
  assert.deepEqual(visual.origin, [0.5, 1]);
});

test("the actual enemy field reaches melee through a doorway instead of stalling at a blocked slot", () => {
  const { field, mob, nav, hero } = setup();
  field.alert(mob.actor);
  for (let frame = 0; frame < 80 && !field.inRange(mob, hero, nav); frame++) {
    const previous = { x: mob.actor.x, y: mob.actor.y };
    field.update(100, nav, hero, new Set([mob.id]), false);
    assert.ok(nav.clear(previous, mob.actor));
  }
  assert.ok(field.inRange(mob, hero, nav));
  assert.equal(mob.awareness.alerted, true);
  assert.equal(mob.stuckMs, 0);
});

test("respawn cancels old visual tweens, resets appearance and starts a distinct life", () => {
  const { field, mob, nav, hero, render } = setup();
  const incarnation = mob.incarnation;
  field.defeat(mob.actor);
  mob.actor.setAlpha(0.1).setVisible(false);
  mob.actor.angle = 5;
  mob.stuckMs = 7500;
  field.update(12000, nav, hero, new Set(), true);
  assert.equal(mob.alive, false); // Pausing cannot spend the respawn timer.
  field.update(12000, nav, hero, new Set(), false);
  assert.equal(mob.alive, true);
  assert.equal(mob.incarnation, incarnation + 1);
  assert.deepEqual(render.killed, [mob.actor]);
  assert.equal(mob.actor.alpha, 1);
  assert.equal(mob.actor.visible, true);
  assert.equal(mob.actor.angle, 0);
  assert.equal(mob.stuckMs, 0);
  assert.deepEqual({ x: mob.actor.x, y: mob.actor.y }, mob.home);
});

test("deliberately re-alerting a returning foe clears its previous stuck timeout", () => {
  const { field, mob, nav, hero } = setup();
  mob.awareness.returning = true;
  mob.stuckMs = 7500;
  field.alert(mob.actor);
  assert.equal(mob.stuckMs, 0);
  field.update(100, nav, hero, new Set(), false);
  assert.equal(mob.awareness.alerted, true);
  assert.equal(mob.awareness.returning, false);
});
