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
  constructor(private scene: Phaser.Scene) {}
  add(manifest: EntityManifest, hero: Point) {
    if (this.members.some((m) => m.manifest.id === manifest.id))
      throw new Error("Este personagem já está no grupo.");
    if (this.members.length >= 3)
      throw new Error(
        "O grupo comporta até três convidados. Remova alguém antes de convidar outro.",
      );
    const behind = this.pointBehind(28 * (this.members.length + 1));
    const position = behind || hero;
    this.members.push(
      new EntityActor(
        this.scene,
        position.x,
        position.y,
        manifest,
        "companion",
      ).setVisible(!!behind),
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
  reset(hero: Point) {
    this.trail = [{ x: hero.x, y: hero.y }];
    this.members.forEach((m) =>
      m.setPosition(hero.x, hero.y).setVisible(false),
    );
  }
  update(hero: Point, delta: number, nav: NativeNavigation, paused: boolean) {
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
      const route = nav.clear(member, target)
        ? [target]
        : nav.path(member, target, 12);
      const p = advancePath(member, route, delta * 0.115, nav),
        dx = p.x - member.x,
        dy = p.y - member.y;
      member.setPosition(p.x, p.y);
      member.play(
        "world",
        Math.hypot(dx, dy) > 0.05
          ? "run_" + facing(dx, dy)
          : "idle_" + (member.visual.anims.currentAnim?.key.at(-1) || "0"),
      );
    }
  }
}
