import { advancePath, NativeNavigation, type Point } from "./navigation";

/** Local steering only: small corridor alignment, collision-safe sliding, no
 * teleporting and no route following after the player releases/changes input.
 */
export class KeyboardNavigator {
  private route: Point[] = [];
  private heading: Point = { x: 0, y: 0 };
  private retryMs = 0;
  private side = 1;
  assisted = false;
  reset() {
    this.route = [];
    this.heading = { x: 0, y: 0 };
    this.retryMs = 0;
    this.assisted = false;
  }
  move(
    from: Point,
    dx: number,
    dy: number,
    speed: number,
    delta: number,
    nav: NativeNavigation,
  ): Point {
    this.assisted = false;
    const norm = Math.hypot(dx, dy);
    if (!norm || delta <= 0 || speed <= 0) {
      this.reset();
      return { x: from.x, y: from.y };
    }
    const u = { x: dx / norm, y: dy / norm };
    const changed = u.x * this.heading.x + u.y * this.heading.y < 0.95;
    if (changed) this.reset();
    this.heading = u;
    const distance = (speed * Math.min(delta, 100)) / 1000;
    const direct = nav.move(from, u.x * distance, u.y * distance);
    const progress = (direct.x - from.x) * u.x + (direct.y - from.y) * u.y;
    const look = Math.max(
      20,
      Math.min(34, nav.grid.cellWidth * nav.grid.unitsPerSourcePixel * 2),
    );
    const ahead = { x: from.x + u.x * look, y: from.y + u.y * look };
    if (progress >= distance * 0.9 && nav.clear(from, ahead)) {
      this.route = [];
      return direct;
    }
    this.retryMs = Math.max(0, this.retryMs - delta);
    if (!this.route.length && this.retryMs <= 0) {
      this.retryMs = 160;
      let best = Infinity;
      for (const offset of [
        0,
        this.side * 8,
        -this.side * 8,
        this.side * 16,
        -this.side * 16,
        this.side * 24,
        -this.side * 24,
      ]) {
        const target = { x: ahead.x - u.y * offset, y: ahead.y + u.x * offset };
        if (!nav.walkable(target)) continue;
        const route = nav.path(from, target, 3, 80);
        if (!route.length) continue;
        let length = 0,
          previous = from;
        for (const p of route) {
          length += Math.hypot(p.x - previous.x, p.y - previous.y);
          previous = p;
        }
        const first = route.find(
          (p) => Math.hypot(p.x - from.x, p.y - from.y) > 0.1,
        );
        if (
          !first ||
          (first.x - from.x) * u.x + (first.y - from.y) * u.y < -0.5 ||
          length > look * 2
        )
          continue;
        const score =
          length + Math.abs(offset) * 0.4 + (offset * this.side < 0 ? 2 : 0);
        if (score < best) {
          best = score;
          this.route = route;
        }
      }
    }
    if (this.route.length) {
      const next = advancePath(from, this.route, distance, nav);
      if (Math.hypot(next.x - from.x, next.y - from.y) > 0.01) {
        this.assisted = true;
        return next;
      }
    }
    // Fan along nearby tangents when the grid's X/Y slide catches a diagonal edge.
    let next = direct,
      bestProgress = progress;
    for (const degrees of [15, -15, 30, -30, 45, -45, 60, -60]) {
      const angle = (degrees * this.side * Math.PI) / 180;
      const x = u.x * Math.cos(angle) - u.y * Math.sin(angle);
      const y = u.x * Math.sin(angle) + u.y * Math.cos(angle);
      const candidate = nav.move(from, x * distance, y * distance);
      const forward =
        (candidate.x - from.x) * u.x + (candidate.y - from.y) * u.y;
      if (forward > bestProgress + 0.01 && nav.clear(from, candidate)) {
        next = candidate;
        bestProgress = forward;
        this.assisted = true;
      }
    }
    return next;
  }
}
