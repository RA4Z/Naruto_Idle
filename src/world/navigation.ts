export type Point = { x: number; y: number };
export type NativeGrid = {
  sourceWidth: number;
  sourceHeight: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  unitsPerSourcePixel: number;
  cells: [number, number][];
  obstacles?: Point[][];
  walkways?: Point[][];
};
function insidePolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export class NativeNavigation {
  private allowed: Set<number>;
  private readonly buckets = new Map<string, number[]>();
  private readonly bucketSize = 64;
  private readonly obstacles: { points: Point[]; minX: number; minY: number; maxX: number; maxY: number }[];
  readonly points: Point[];
  constructor(readonly grid: NativeGrid) {
    this.allowed = new Set(grid.cells.map(([x, y]) => this.key(x, y)));
    this.obstacles = (grid.obstacles || []).filter(p => p.length >= 3).map(points => ({
      points, minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)),
      maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)),
    }));
    if (grid.walkways?.length) {
      for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.columns; x++) {
        const center = this.center(x, y);
        if (grid.walkways.some(polygon => insidePolygon(center, polygon))) this.allowed.add(this.key(x, y));
      }
    }
    this.points = [...this.allowed].map(id => this.center(id % grid.columns, Math.floor(id / grid.columns))).filter(p => this.walkable(p));
    this.points.forEach((point, index) => {
      const key = this.bucketKey(point.x, point.y);
      const bucket = this.buckets.get(key) || [];
      bucket.push(index);
      this.buckets.set(key, bucket);
    });
  }
  private bucketKey(x: number, y: number) {
    return `${Math.floor(x / this.bucketSize)},${Math.floor(y / this.bucketSize)}`;
  }
  pointsWithin(center: Point, radius: number): Point[] {
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(radius) || radius < 0) return [];
    const indices: number[] = [];
    const minX = Math.floor((center.x - radius) / this.bucketSize), maxX = Math.floor((center.x + radius) / this.bucketSize);
    const minY = Math.floor((center.y - radius) / this.bucketSize), maxY = Math.floor((center.y + radius) / this.bucketSize);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      for (const index of this.buckets.get(`${x},${y}`) || []) {
        const p = this.points[index], dx = p.x - center.x, dy = p.y - center.y;
        if (dx * dx + dy * dy < radius * radius) indices.push(index);
      }
    }
    indices.sort((a, b) => a - b);
    return indices.map(index => this.points[index]);
  }
  private key(x: number, y: number) {
    return y * this.grid.columns + x;
  }
  private has(x: number, y: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.grid.columns &&
      y < this.grid.rows &&
      this.allowed.has(this.key(x, y))
    );
  }
  cell(p: Point): [number, number] {
    const g = this.grid,
      x = p.x / g.unitsPerSourcePixel - g.sourceWidth / 2,
      y = p.y / g.unitsPerSourcePixel + g.sourceWidth / 4;
    return [
      Math.floor(x / g.cellWidth + y / g.cellHeight),
      Math.floor(y / g.cellHeight - x / g.cellWidth),
    ];
  }
  center(x: number, y: number): Point {
    const g = this.grid;
    return {
      x:
        (((x - y) * g.cellWidth) / 2 + g.sourceWidth / 2) *
        g.unitsPerSourcePixel,
      y:
        (((x + y + 1) * g.cellHeight) / 2 - g.sourceWidth / 4) *
        g.unitsPerSourcePixel,
    };
  }
  walkable(p: Point, radius = 1.5) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    return [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ].every(([dx, dy]) => {
      const point = { x: p.x + dx, y: p.y + dy };
      return (this.has(...this.cell(point)) || !!this.grid.walkways?.some(polygon => insidePolygon(point, polygon))) && !this.obstacles.some(obstacle =>
        point.x >= obstacle.minX && point.x <= obstacle.maxX && point.y >= obstacle.minY && point.y <= obstacle.maxY && insidePolygon(point, obstacle.points));
    });
  }
  nearest(p: Point, maxDistance = Infinity): Point | undefined {
    if (this.walkable(p)) return { ...p };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || maxDistance < 0) return undefined;
    let best: Point | undefined,
      distance = maxDistance * maxDistance;
    for (const q of Number.isFinite(maxDistance) ? this.pointsWithin(p, maxDistance) : this.points) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < distance && this.walkable(q)) {
        best = q;
        distance = d;
      }
    }
    return best ? { ...best } : undefined;
  }
  clear(a: Point, b: Point) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 0; i <= steps; i++)
      if (
        !this.walkable({
          x: a.x + ((b.x - a.x) * i) / steps,
          y: a.y + ((b.y - a.y) * i) / steps,
        })
      )
        return false;
    return true;
  }
  path(from: Point, requested: Point, snap = 36): Point[] {
    const start = this.nearest(from, 20),
      end = this.nearest(requested, snap);
    if (!start || !end) return [];
    if (this.clear(start, end))
      return Math.hypot(end.x - from.x, end.y - from.y) > 0.1 ? [end] : [];
    const [sx, sy] = this.cell(start),
      [ex, ey] = this.cell(end),
      goal = this.key(ex, ey),
      first = this.key(sx, sy);
    if (first === goal) return [];
    const open: [number, number][] = [
        [first, Math.abs(ex - sx) + Math.abs(ey - sy)],
      ],
      costs = new Map([[first, 0]]),
      previous = new Map<number, number>(),
      closed = new Set<number>();
    const push = (item: [number, number]) => {
      open.push(item);
      let i = open.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (open[p][1] <= item[1]) break;
        open[i] = open[p];
        i = p;
      }
      open[i] = item;
    };
    const pop = () => {
      const best = open[0],
        tail = open.pop()!;
      if (open.length) {
        let i = 0;
        while (i * 2 + 1 < open.length) {
          let n = i * 2 + 1;
          if (n + 1 < open.length && open[n + 1][1] < open[n][1]) n++;
          if (open[n][1] >= tail[1]) break;
          open[i] = open[n];
          i = n;
        }
        open[i] = tail;
      }
      return best[0];
    };
    while (open.length) {
      const id = pop();
      if (closed.has(id)) continue;
      if (id === goal) break;
      closed.add(id);
      const x = id % this.grid.columns,
        y = Math.floor(id / this.grid.columns),
        cost = costs.get(id)! + 1;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const next = this.key(nx, ny);
        if (
          !this.has(nx, ny) ||
          closed.has(next) ||
          cost >= (costs.get(next) ?? Infinity)
        )
          continue;
        const fromPoint = id === first ? start : this.center(x, y);
        const toPoint = next === goal ? end : this.center(nx, ny);
        if (!this.clear(fromPoint, toPoint)) continue;
        costs.set(next, cost);
        previous.set(next, id);
        push([next, cost + Math.abs(ex - nx) + Math.abs(ey - ny)]);
      }
    }
    if (!costs.has(goal)) return [];
    const route = [end];
    let id = previous.get(goal)!;
    while (id !== first) {
      route.push(
        this.center(id % this.grid.columns, Math.floor(id / this.grid.columns)),
      );
      id = previous.get(id)!;
    }
    route.push(start);
    route.reverse();
    const smooth: Point[] = [];
    let index = 0;
    while (index < route.length - 1) {
      let far = index + 1;
      if (!this.clear(route[index], route[far])) return [];
      for (let j = far + 1; j < route.length; j++) {
        if (this.clear(route[index], route[j])) far = j;
      }
      smooth.push(route[far]);
      index = far;
    }
    return smooth;
  }
  move(from: Point, dx: number, dy: number): Point {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 1.5));
    let p = { x: from.x, y: from.y };
    for (let i = 0; i < steps; i++) {
      const nx = p.x + dx / steps,
        ny = p.y + dy / steps;
      if (this.walkable({ x: nx, y: ny })) p = { x: nx, y: ny };
      else if (this.walkable({ x: nx, y: p.y })) p.x = nx;
      else if (this.walkable({ x: p.x, y: ny })) p.y = ny;
    }
    return p;
  }
}
export function facing(dx: number, dy: number) {
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 14) % 8;
}
export function advancePath(
  position: Point,
  path: Point[],
  distance: number,
  nav: NativeNavigation,
) {
  let p = { x: position.x, y: position.y };
  while (path.length && distance > 0) {
    const q = path[0],
      dx = q.x - p.x,
      dy = q.y - p.y,
      d = Math.hypot(dx, dy);
    if (d < 0.1) {
      path.shift();
      continue;
    }
    const step = Math.min(d, distance);
    const next = nav.move(p, (dx / d) * step, (dy / d) * step);
    if (Math.hypot(next.x - p.x, next.y - p.y) < 0.01 || Math.hypot(q.x - next.x, q.y - next.y) >= d - 0.001) {
      path.length = 0;
      break;
    }
    p = next;
    distance -= step;
    if (Math.hypot(q.x - p.x, q.y - p.y) < 0.1) path.shift();
  }
  return p;
}
