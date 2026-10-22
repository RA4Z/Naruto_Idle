import type Phaser from "phaser";
import { t } from "../i18n/core.ts";
import { visionDebugEnabled } from "../admin/debug-state";
import { enemyProfile, type EnemyProfile } from "./enemy-profiles";
import { EntityActor } from "../entities/actor";
import { meleeApproach, meleeReachable } from "./melee";
import { mapEnemyHomes } from "./spawn";
import type { EntityManifest } from "../entities/types";
import {
  NativeNavigation,
  advancePath,
  facing,
  type Point,
} from "./navigation";
import {
  freshAwareness,
  updateAwareness,
  visionRadius,
  SIGHT,
  type Awareness,
} from "./awareness";
export type Mob = {
  id: string;
  actor: EntityActor;
  home: Point;
  path: Point[];
  wait: number;
  alive: boolean;
  respawn: number;
  sequence: number;
  incarnation: number;
  direction: number;
  heading: Point;
  awareness: Awareness;
  repathMs: number;
  pursuitDestination?: Point;
  stuckMs: number;
  profile: EnemyProfile;
};
export class EnemyField {
  mapId = "";
  members: Mob[] = [];
  private zones: Phaser.GameObjects.Graphics;
  constructor(
    private scene: Phaser.Scene,
    private bind: (actor: EntityActor) => void = () => {},
  ) {
    this.zones = scene.add.graphics().setDepth(1).setVisible(false);
  }
  reset(
    mapId: string,
    pool: EntityManifest[],
    entry: Point,
    nav: NativeNavigation,
    safe: boolean,
  ) {
    this.members.forEach((m) => m.actor.destroy());
    this.members = [];
    this.mapId = mapId;
    this.zones.clear();
    if (safe || !pool.length) return;
    const homes = mapEnemyHomes(mapId, nav, entry);
    for (let i = 0; i < homes.length; i++) {
      const home = homes[i],
        manifest = pool[i % pool.length];
      const actor = new EntityActor(
          this.scene,
          home.x,
          home.y,
          manifest,
          "enemy",
        ),
        profile = enemyProfile(manifest.id, i === 5);
      actor.setCombatLabel(
        `${profile.elite ? "★ " + t("balance.elite") + " · " : ""}${manifest.name} · ${t(`balance.enemy.${profile.kind}`)}`,
        profile.elite,
      );
      this.members.push({
        id: `${mapId}:${i}`,
        actor,
        home: { ...home },
        path: [],
        wait: i * 550,
        alive: true,
        respawn: 0,
        sequence: i * 23 + 1,
        incarnation: 0,
        direction: 0,
        heading: { x: 0, y: 1 },
        awareness: freshAwareness(),
        repathMs: 0,
        stuckMs: 0,
        profile,
      });
      this.bind(actor);
      if (manifest.capabilities.companion) actor.play("world", "idle_0");
    }
  }
  nearest(hero: Point) {
    return this.members
      .filter((m) => m.alive && m.actor.visible)
      .sort(
        (a, b) =>
          Math.hypot(a.actor.x - hero.x, a.actor.y - hero.y) -
          Math.hypot(b.actor.x - hero.x, b.actor.y - hero.y),
      )[0]?.actor;
  }
  member(actor: EntityActor) {
    return this.members.find((m) => m.actor === actor);
  }
  byId(id: string) {
    return this.members.find((m) => m.id === id);
  }
  profileFor(actor: EntityActor) {
    return this.member(actor)?.profile || enemyProfile(actor.manifest.id);
  }
  inRange(m: Mob, hero: Point, nav: NativeNavigation) {
    return m.alive && meleeReachable(m.actor, hero, nav);
  }
  alert(actor: EntityActor) {
    const m = this.member(actor);
    if (m?.alive) {
      m.awareness = { alerted: true, returning: false, unseenMs: 0 };
      m.path = [];
      m.repathMs = 0;
      m.stuckMs = 0;
    }
  }
  defeat(actor: EntityActor) {
    const m = this.member(actor);
    if (m) {
      m.alive = false;
      m.respawn = 12000;
      m.path = [];
      m.awareness = freshAwareness();
    }
  }
  disengage(actor: EntityActor) {
    const m = this.member(actor);
    if (m) {
      actor.setPosition(m.home.x, m.home.y).setVisible(true);
      m.path = [];
      m.awareness = freshAwareness();
      m.repathMs = 0;
      m.stuckMs = 0;
    }
  }
  disengageAll() {
    for (const m of this.members) if (m.alive) this.disengage(m.actor);
  }
  update(
    delta: number,
    nav: NativeNavigation,
    hero: Point,
    engaged: ReadonlySet<string>,
    paused: boolean,
    suppress = false,
  ) {
    for (const mob of this.members) {
      const { actor } = mob;
      actor.tick(paused);
      if (paused) continue;
      if (!mob.alive) {
        mob.respawn -= delta;
        if (mob.respawn <= 0) {
          mob.incarnation++;
          this.scene.tweens.killTweensOf(actor);
          mob.alive = true;
          mob.awareness = freshAwareness();
          mob.heading = { x: 0, y: 1 };
          mob.path = [];
          mob.repathMs = 0;
          mob.stuckMs = 0;
          actor
            .setPosition(mob.home.x, mob.home.y)
            .setVisible(true)
            .setAlpha(1);
          actor.angle = 0;
          this.idle(mob);
        }
        continue;
      }
      if (suppress) {
        this.stopLocomotion(mob);
        continue;
      }
      const was = mob.awareness.alerted;
      updateAwareness(
        mob.awareness,
        actor,
        mob.heading,
        hero,
        mob.home,
        mob.profile,
        (a, b) => nav.clear(a, b),
        delta,
      );
      if (was !== mob.awareness.alerted) {
        mob.path = [];
        mob.repathMs = 0;
        mob.stuckMs = 0;
      }
      mob.repathMs = Math.max(0, mob.repathMs - delta);
      if (mob.awareness.alerted) {
        if (this.inRange(mob, hero, nav)) {
          mob.path = [];
          mob.stuckMs = 0;
          mob.heading = { x: hero.x - actor.x, y: hero.y - actor.y };
          actor.face(hero.x < actor.x);
          if (!actor.visual.anims.currentAnim?.key.includes(":battle:"))
            actor.play("battle", "C_idle");
          continue;
        }
        if (mob.repathMs <= 0) {
          const end = mob.path.at(-1),
            previous = mob.pursuitDestination;
          if (
            !end ||
            !previous ||
            Math.hypot(hero.x - previous.x, hero.y - previous.y) > 8 ||
            !meleeReachable(end, hero, nav)
          ) {
            mob.path = meleeApproach(
              actor,
              hero,
              this.members.indexOf(mob),
              nav,
            );
            mob.pursuitDestination = { x: hero.x, y: hero.y };
          }
          mob.repathMs = 400;
        }
      } else if (mob.awareness.returning) {
        if (mob.repathMs <= 0) {
          mob.path = nav.path(actor, mob.home);
          mob.repathMs = 800;
        }
      } else if (!mob.path.length) {
        if (!engaged.has(mob.id)) this.idle(mob);
        mob.wait -= delta;
        if (mob.wait > 0) continue;
        const options = nav
          .pointsWithin(mob.home, mob.profile.radius)
          .filter((p) => Math.hypot(p.x - actor.x, p.y - actor.y) > 18);
        const target = options[(mob.sequence++ * 103) % options.length];
        if (target) mob.path = nav.path(actor, target);
        mob.wait = 1000 + (mob.sequence % 4) * 400;
      }
      const speed =
        mob.awareness.alerted || mob.awareness.returning
          ? Math.max(60, mob.profile.speed * 2.5)
          : mob.profile.speed;
      const p = advancePath(actor, mob.path, (delta * speed) / 1000, nav),
        dx = p.x - actor.x,
        dy = p.y - actor.y;
      if (Math.hypot(dx, dy) > 0.02) {
        mob.stuckMs = 0;
        mob.heading = { x: dx, y: dy };
        mob.direction = facing(dx, dy);
        actor.setPosition(p.x, p.y);
        if (actor.manifest.capabilities.companion)
          actor.play("world", "run_" + mob.direction);
        else {
          actor.face(dx < 0);
          actor.play("battle", "C_idle");
        }
      } else {
        this.stopLocomotion(mob);
        if (mob.awareness.alerted) {
          mob.stuckMs += delta;
          if (mob.stuckMs >= SIGHT.stuckMs) {
            mob.awareness = { alerted: false, returning: true, unseenMs: 0 };
            mob.path = [];
            mob.repathMs = 0;
          }
        }
      }
    }
    this.drawZones();
  }
  private idle(m: Mob) {
    m.actor.play(
      m.actor.manifest.capabilities.companion ? "world" : "battle",
      m.actor.manifest.capabilities.companion
        ? "idle_" + m.direction
        : "C_idle",
    );
  }
  private stopLocomotion(m: Mob) {
    if (m.actor.visual.anims.currentAnim?.key.includes(":world:run_"))
      this.idle(m);
  }
  private drawZones() {
    const g = this.zones;
    g.setVisible(visionDebugEnabled());
    g.clear();
    if (!g.visible) return;
    for (const m of this.members) {
      if (!m.alive || !m.actor.visible) continue;
      const color = m.awareness.alerted
        ? 0xef8072
        : m.awareness.returning
          ? 0x9aa69a
          : 0xe7d799;
      const { x, y } = m.actor,
        angle = Math.atan2(m.heading.y, m.heading.x),
        radius = visionRadius(m.profile);
      g.fillStyle(color, 0.035).fillCircle(x, y, SIGHT.proximity);
      g.lineStyle(0.7, color, 0.25).strokeCircle(x, y, SIGHT.proximity);
      g.fillStyle(color, 0.045).beginPath().moveTo(x, y);
      g.arc(
        x,
        y,
        radius,
        angle - SIGHT.halfAngle,
        angle + SIGHT.halfAngle,
        false,
      )
        .closePath()
        .fillPath();
      g.lineStyle(0.7, color, 0.25).strokePath();
      if (m.awareness.alerted)
        g.lineStyle(1, 0xef8072, 0.9).strokeEllipse(x, y, 30, 11);
    }
  }
  get visionVisible() {
    return this.zones.visible;
  }
}
