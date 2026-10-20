import { EntityActor } from "../entities/actor";
import {
  NativeNavigation,
  advancePath,
  facing,
  type Point,
} from "./navigation";
type Resident = {
  actor: EntityActor;
  home: Point;
  route: Point[];
  wait: number;
  sequence: number;
  direction: number;
};
export class Residents {
  private entries: Resident[] = [];
  reset(actors: EntityActor[]) {
    this.entries = actors.map((actor, i) => ({
      actor,
      home: { x: actor.x, y: actor.y },
      route: [],
      wait: 700 + i * 1300,
      sequence: i * 19 + 3,
      direction: 0,
    }));
  }
  update(delta: number, nav: NativeNavigation, paused: boolean) {
    for (const resident of this.entries) {
      const { actor, home } = resident;
      actor.tick(paused);
      if (paused || !actor.manifest.capabilities.companion) continue;
      if (!resident.route.length) {
        resident.wait -= delta;
        actor.play("world", "idle_" + resident.direction);
        if (resident.wait > 0) continue;
        const candidates = nav.points.filter(
          (p) =>
            Math.hypot(p.x - home.x, p.y - home.y) < 90 &&
            Math.hypot(p.x - actor.x, p.y - actor.y) > 25,
        );
        const target =
          candidates[(resident.sequence++ * 137) % candidates.length];
        if (target) resident.route = nav.path(actor, target, 12);
        resident.wait = 1800 + (resident.sequence % 4) * 550;
      }
      const next = advancePath(actor, resident.route, delta * 0.026, nav),
        dx = next.x - actor.x,
        dy = next.y - actor.y;
      if (Math.hypot(dx, dy) > 0.03) {
        resident.direction = facing(dx, dy);
        actor.setPosition(next.x, next.y);
        actor.play("world", "run_" + resident.direction);
      }
    }
  }
}
