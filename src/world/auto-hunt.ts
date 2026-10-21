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

  private plan(hero: Point, target: T, nav: NativeNavigation, reuse = false) {
    const direct = Math.hypot(target.x - hero.x, target.y - hero.y);
    if (direct < 28 && nav.clear(hero, target))
      return { path: [] as Point[], cost: 0 };
    const path = reuse ? this.route : nav.path(hero, target);
    const end = path.at(-1);
    const gap = end ? Math.hypot(end.x - target.x, end.y - target.y) : Infinity;
    if (!end || gap >= 28 || (gap > 0.1 && !nav.clear(end, target))) return;
    let length = gap,
      previous = hero;
    for (const point of path) {
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return { path, cost: Math.max(0, length - 28) };
  }

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
    if (this.retry <= 0) {
      const previous = this.target;
      let reuse =
        !!previous &&
        !!this.destination &&
        Math.hypot(
          previous.x - this.destination.x,
          previous.y - this.destination.y,
        ) <= 16 &&
        this.route.length > 0 &&
        nav.clear(hero, this.route[0]);
      let current = previous
        ? this.plan(hero, previous, nav, reuse)
        : undefined;
      if (!current && previous && reuse) {
        reuse = false;
        current = this.plan(hero, previous, nav);
      }
      if (previous && !current) this.skipped.set(previous, this.time + 3000);
      let chosen = current ? previous : undefined;
      let best = current;
      // Euclidean distance is a lower bound, not the selection score. Avoid
      // pathfinding for enemies that cannot improve on an already valid route.
      const nearby = candidates
        .filter(
          (candidate) => candidate !== previous && !this.skipped.has(candidate),
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - hero.x, a.y - hero.y) -
            Math.hypot(b.x - hero.x, b.y - hero.y),
        );
      for (const candidate of nearby) {
        const lowerBound = Math.max(
          0,
          Math.hypot(candidate.x - hero.x, candidate.y - hero.y) - 28,
        );
        if (best && lowerBound >= best.cost) break;
        const plan = this.plan(hero, candidate, nav);
        if (!plan) {
          this.skipped.set(candidate, this.time + 3000);
          continue;
        }
        if (!best || plan.cost < best.cost) {
          chosen = candidate;
          best = plan;
        }
      }
      // Keep near ties stable, but immediately prefer an enemy already in range.
      if (
        current &&
        best &&
        chosen !== previous &&
        best.cost > 0 &&
        current.cost - best.cost < Math.max(24, current.cost * 0.25)
      ) {
        chosen = previous;
        best = current;
      }
      if (chosen !== previous) {
        this.stalled = this.pursuit = 0;
        this.checkpoint = { x: hero.x, y: hero.y };
      }
      this.target = chosen;
      this.route = best?.path || [];
      this.destination =
        chosen === previous && reuse && best === current
          ? this.destination
          : chosen
            ? { x: chosen.x, y: chosen.y }
            : undefined;
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
