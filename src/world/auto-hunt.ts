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
  status: "searching" | "chasing" | "waiting" | "unreachable" = "searching";
  private checkpoint?: Point;
  private stalled = 0;
  private pursuit = 0;

  reset() {
    this.target = undefined;
    this.destination = undefined;
    this.route = [];
    this.retry = 0;
    this.time = 0;
    this.skipped.clear();
    this.checkpoint = undefined;
    this.stalled = this.pursuit = 0;
    this.status = "searching";
  }

  update(hero: Point, candidates: T[], delta: number, nav: NativeNavigation) {
    delta = Math.max(0, Math.min(1000, delta));
    this.time += delta;
    this.retry -= delta;
    if (this.target) {
      this.pursuit += delta;
      if (
        !this.checkpoint ||
        Math.hypot(hero.x - this.checkpoint.x, hero.y - this.checkpoint.y) >= 3
      ) {
        this.checkpoint = { x: hero.x, y: hero.y };
        this.stalled = 0;
      } else this.stalled += delta;
      const inRange =
        Math.hypot(hero.x - this.target.x, hero.y - this.target.y) < 28 &&
        nav.clear(hero, this.target);
      if (!inRange && (this.stalled >= 2500 || this.pursuit >= 20000)) {
        this.skipped.set(this.target, this.time + 5000);
        this.target = undefined;
        this.destination = undefined;
        this.route = [];
        this.retry = 0;
        this.stalled = this.pursuit = 0;
        this.checkpoint = undefined;
      }
    }
    for (const [candidate, until] of this.skipped) {
      if (until <= this.time || !candidates.includes(candidate))
        this.skipped.delete(candidate);
    }
    if (this.target && !candidates.includes(this.target)) {
      this.target = undefined;
      this.destination = undefined;
      this.route = [];
      this.retry = 0;
      this.stalled = this.pursuit = 0;
      this.checkpoint = undefined;
    }
    if (!this.target && this.retry <= 0) {
      this.target = candidates
        .filter((candidate) => !this.skipped.has(candidate))
        .sort(
          (a, b) =>
            Math.hypot(a.x - hero.x, a.y - hero.y) -
            Math.hypot(b.x - hero.x, b.y - hero.y),
        )[0];
      this.stalled = this.pursuit = 0;
      this.checkpoint = { x: hero.x, y: hero.y };
    }
    const target = this.target;
    if (target && this.retry <= 0) {
      const moved =
        !this.destination ||
        Math.hypot(
          target.x - this.destination.x,
          target.y - this.destination.y,
        ) > 16;
      const segmentBlocked =
        this.route.length > 0 && !nav.clear(hero, this.route[0]);
      if (!this.route.length || moved || segmentBlocked) {
        this.destination = { x: target.x, y: target.y };
        if (
          Math.hypot(target.x - hero.x, target.y - hero.y) < 28 &&
          nav.clear(hero, target)
        ) {
          this.route = [];
        } else {
          this.route = nav.path(hero, target);
          const end = this.route.at(-1);
          const gap = end
            ? Math.hypot(end.x - target.x, end.y - target.y)
            : Infinity;
          if (!end || gap >= 28 || (gap > 0.1 && !nav.clear(end, target))) {
            this.route = [];
            this.skipped.set(target, this.time + 3000);
            this.target = undefined;
            this.destination = undefined;
          }
        }
      }
      this.retry = 500;
    }
    this.status = this.target
      ? "chasing"
      : !candidates.length
        ? "waiting"
        : this.skipped.size
          ? "unreachable"
          : "searching";
    return { target: this.target, path: this.route };
  }
}
