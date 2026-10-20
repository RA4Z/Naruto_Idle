import type { NativeNavigation, Point } from "./navigation";

// Keep the chosen target and its route together. An unreachable target is
// temporarily skipped instead of running pathfinding again every frame.
export class AutoHuntNavigator<T extends Point> {
  private target?: T;
  private destination?: Point;
  private retry = 0;
  private time = 0;
  private skipped = new Map<T, number>();
  private route: Point[] = [];

  reset() {
    this.target = undefined;
    this.destination = undefined;
    this.route = [];
    this.retry = 0;
    this.time = 0;
    this.skipped.clear();
  }

  update(hero: Point, candidates: T[], delta: number, nav: NativeNavigation) {
    this.time += delta;
    this.retry -= delta;
    for (const [candidate, until] of this.skipped) {
      if (until <= this.time || !candidates.includes(candidate)) this.skipped.delete(candidate);
    }
    if (this.target && !candidates.includes(this.target)) {
      this.target = undefined;
      this.destination = undefined;
      this.route = [];
      this.retry = 0;
    }
    if (!this.target && this.retry <= 0) {
      this.target = candidates
        .filter(candidate => !this.skipped.has(candidate))
        .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y))[0];
    }
    const target = this.target;
    if (target && this.retry <= 0) {
      const moved = !this.destination || Math.hypot(target.x - this.destination.x, target.y - this.destination.y) > 16;
      if (!this.route.length || moved) {
        this.destination = { x: target.x, y: target.y };
        if (Math.hypot(target.x - hero.x, target.y - hero.y) < 28 && nav.clear(hero, target)) {
          this.route = [];
        } else {
          this.route = nav.path(hero, target);
          if (!this.route.length) {
            this.skipped.set(target, this.time + 3000);
            this.target = undefined;
            this.destination = undefined;
          }
        }
        this.retry = 500;
      }
    }
    return { target: this.target, path: this.route };
  }
}
