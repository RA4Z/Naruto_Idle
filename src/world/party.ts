import type Phaser from "phaser";
import { EntityActor } from "../entities/actor";
import type { EntityManifest } from "../entities/types";
import {
  NativeNavigation,
  advancePath,
  facing,
  type Point,
} from "./navigation";
export class ExplorationParty {
  members: EntityActor[] = [];
  private trail: Point[] = [];
  private routes = new WeakMap<EntityActor, { target: Point; path: Point[]; retry: number }>();
  constructor(private scene: Phaser.Scene) {}
  add(manifest: EntityManifest, hero: Point, nav?: NativeNavigation) {
    if (this.members.some((m) => m.manifest.id === manifest.id))
      throw new Error("Este personagem já está no grupo.");
    if (this.members.length >= 3)
      throw new Error(
        "O grupo comporta até três convidados. Remova alguém antes de convidar outro.",
      );
    const behind = this.pointBehind(28 * (this.members.length + 1));
    const position =
      behind || (nav ? this.formation(hero, this.members.length, nav) : hero);
    this.members.push(
      new EntityActor(
        this.scene,
        position.x,
        position.y,
        manifest,
        "companion",
      ).setVisible(!!behind || !!nav),
    );
    if (!this.trail.length) this.trail = [{ x: hero.x, y: hero.y }];
  }
  private pointBehind(required: number) {
    let distance = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      distance += Math.hypot(
        this.trail[i].x - this.trail[i - 1].x,
        this.trail[i].y - this.trail[i - 1].y,
      );
      if (distance >= required) return this.trail[i - 1];
    }
    return undefined;
  }
  remove(id: string) {
    const i = this.members.findIndex((m) => m.manifest.id === id);
    if (i >= 0) this.members.splice(i, 1)[0].destroy();
  }
  private formation(hero: Point, index: number, nav: NativeNavigation) {
    const desired = {
      x: hero.x - 25 * (index + 1),
      y: hero.y - 15 * (index + 1),
    };
    const candidates = nav.pointsWithin(hero, 35 * (index + 1) + 15).filter(
      (p) =>
        Math.hypot(p.x - hero.x, p.y - hero.y) > 18 &&
        nav.clear(hero, p),
    );
    return (
      candidates.sort((a, b) => {
        const score = (p: Point) =>
          Math.hypot(p.x - desired.x, p.y - desired.y) +
          this.members
            .filter((_, i) => i !== index)
            .reduce(
              (sum, m) =>
                sum + (Math.hypot(m.x - p.x, m.y - p.y) < 18 ? 1000 : 0),
              0,
            );
        return score(a) - score(b);
      })[0] || hero
    );
  }
  reset(hero: Point, nav?: NativeNavigation) {
    this.trail = [{ x: hero.x, y: hero.y }];
    this.routes = new WeakMap();
    this.members.forEach((m, i) => {
      const p = nav ? this.formation(hero, i, nav) : hero;
      m.setPosition(p.x, p.y).setVisible(!!nav);
      m.play("world", "idle_0");
    });
  }
  update(hero: Point, delta: number, nav: NativeNavigation, paused: boolean, leaderSpeed = 96,
    memberSpeed: (id: string) => number = () => leaderSpeed) {
    for (const m of this.members) m.tick(paused);
    if (paused) return;
    const last = this.trail.at(-1);
    if (!last || Math.hypot(hero.x - last.x, hero.y - last.y) >= 1) {
      this.trail.push({ x: hero.x, y: hero.y });
      if (this.trail.length > 600) this.trail.shift();
    }
    for (let index = 0; index < this.members.length; index++) {
      const member = this.members[index];
      const target = this.pointBehind(28 * (index + 1));
      if (!target) continue;
      member.setVisible(true);
      let cached = this.routes.get(member);
      if (!cached) {
        cached = { target: { ...target }, path: [], retry: 0 };
        this.routes.set(member, cached);
      }
      cached.retry -= delta;
      const moved = Math.hypot(target.x - cached.target.x, target.y - cached.target.y);
      if (cached.retry <= 0 && (!cached.path.length || moved > 8)) {
        cached.target = { ...target };
        cached.path = nav.clear(member, target) ? [{ ...target }] : nav.path(member, target, 12);
        cached.retry = 350;
      }
      const route = cached.path;
      const catchingUp = Math.hypot(hero.x - member.x, hero.y - member.y) > 100 + index * 28;
      const followSpeed = Math.max(memberSpeed(member.manifest.id) * 1.2, catchingUp ? leaderSpeed * 1.2 : 0);
      const p = advancePath(member, route, delta * followSpeed / 1000, nav),
        dx = p.x - member.x,
        dy = p.y - member.y;
      member.setPosition(p.x, p.y);
      member.play(
        "world",
        Math.hypot(dx, dy) > 0.05
          ? "run_" + facing(dx, dy)
          : "idle_" + (member.visual.anims.currentAnim?.key.at(-1) || "0"),
      );
      member.visual.anims.timeScale = Math.hypot(dx, dy) > 0.05 ? followSpeed / 115 : 1;
    }
  }
}
