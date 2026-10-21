import type Phaser from "phaser";
import { t } from "../i18n/core.ts";
import { enemyProfile, type EnemyProfile } from "./enemy-profiles";
import { EntityActor } from "../entities/actor";
import type { EntityManifest } from "../entities/types";
import {
  NativeNavigation,
  advancePath,
  facing,
  type Point,
} from "./navigation";
type Mob = {
  actor: EntityActor;
  home: Point;
  path: Point[];
  wait: number;
  alive: boolean;
  respawn: number;
  sequence: number;
  direction: number;
  profile: EnemyProfile;
};
export class EnemyField {
  mapId = "";
  members: Mob[] = [];
  constructor(private scene: Phaser.Scene) {}
  reset(
    mapId: string,
    pool: EntityManifest[],
    hero: Point,
    nav: NativeNavigation,
    safe: boolean,
  ) {
    this.members.forEach((m) => m.actor.destroy());
    this.members = [];
    this.mapId = mapId;
    if (safe) return;
    const candidates = nav
      .pointsWithin(hero, 320)
      .filter((p) => Math.hypot(p.x - hero.x, p.y - hero.y) > 85);
    for (let i = 0; i < 6; i++) {
      const sorted = candidates
        .map((p) => ({
          p,
          score: this.members.length
            ? Math.min(
                ...this.members.map((m) =>
                  Math.hypot(m.home.x - p.x, m.home.y - p.y),
                ),
              )
            : 180 - Math.abs(Math.hypot(p.x - hero.x, p.y - hero.y) - 115),
        }))
        .sort((a, b) => b.score - a.score);
      const home =
          sorted[Math.min(i * 3, sorted.length - 1)]?.p ||
          nav.points[(i * 179) % nav.points.length],
        manifest = pool[i % pool.length];
      const actor = new EntityActor(
        this.scene,
        home.x,
        home.y,
        manifest,
        "enemy",
      );
      const profile = enemyProfile(manifest.id, i === 5);
      actor.setCombatLabel(
        `${profile.elite ? "★ " + t("balance.elite") + " · " : ""}${manifest.name} · ${t(`balance.enemy.${profile.kind}`)}`,
        profile.elite,
      );
      this.members.push({
        actor,
        home: { ...home },
        path: [],
        wait: i * 550,
        alive: true,
        respawn: 0,
        sequence: i * 23 + 1,
        direction: 0,
        profile,
      });
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
  profileFor(actor: EntityActor) {
    return (
      this.members.find((m) => m.actor === actor)?.profile ||
      enemyProfile(actor.manifest.id)
    );
  }
  defeat(actor: EntityActor) {
    const mob = this.members.find((m) => m.actor === actor);
    if (mob) {
      mob.alive = false;
      mob.respawn = 12000;
      mob.path = [];
    }
  }
  disengage(actor: EntityActor) {
    const mob = this.members.find((m) => m.actor === actor);
    if (mob) {
      actor.setPosition(mob.home.x, mob.home.y).setVisible(true);
      mob.path = [];
    }
  }
  update(
    delta: number,
    nav: NativeNavigation,
    hero: Point,
    engaged: EntityActor | undefined,
    paused: boolean,
  ) {
    for (const mob of this.members) {
      const { actor } = mob;
      actor.tick(paused);
      if (paused) continue;
      if (!mob.alive) {
        mob.respawn -= delta;
        if (mob.respawn <= 0) {
          mob.alive = true;
          actor
            .setPosition(mob.home.x, mob.home.y)
            .setVisible(true)
            .setAlpha(1);
          actor.angle = 0;
          actor.play(
            actor.manifest.capabilities.companion ? "world" : "battle",
            actor.manifest.capabilities.companion ? "idle_0" : "C_idle",
            true,
          );
        }
        continue;
      }
      if (actor === engaged || !actor.manifest.capabilities.companion) continue;
      if (!mob.path.length) {
        actor.play("world", "idle_" + mob.direction);
        mob.wait -= delta;
        if (mob.wait > 0) continue;
        const options = nav
          .pointsWithin(mob.home, mob.profile.radius)
          .filter(
            (p) =>
              Math.hypot(p.x - actor.x, p.y - actor.y) > 18 &&
              (!engaged || Math.hypot(p.x - hero.x, p.y - hero.y) > 40),
          );
        const distance = Math.hypot(hero.x - actor.x, hero.y - actor.y);
        let target = options[(mob.sequence++ * 103) % options.length];
        if (
          !engaged &&
          mob.profile.behavior === "chase" &&
          distance < 95 &&
          Math.hypot(hero.x - mob.home.x, hero.y - mob.home.y) <
            mob.profile.radius
        )
          target = hero;
        else if (
          !engaged &&
          mob.profile.behavior === "retreat" &&
          distance < 65
        )
          target = [...options].sort(
            (a, b) =>
              Math.hypot(b.x - hero.x, b.y - hero.y) -
              Math.hypot(a.x - hero.x, a.y - hero.y),
          )[0];
        if (target) mob.path = nav.path(actor, target);
        mob.wait = 1000 + (mob.sequence % 4) * 400;
      }
      const p = advancePath(
          actor,
          mob.path,
          (delta * mob.profile.speed) / 1000,
          nav,
        ),
        dx = p.x - actor.x,
        dy = p.y - actor.y;
      if (Math.hypot(dx, dy) > 0.02) {
        mob.direction = facing(dx, dy);
        actor.setPosition(p.x, p.y);
        actor.play("world", "run_" + mob.direction);
      }
    }
  }
}
