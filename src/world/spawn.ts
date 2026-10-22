import type { NativeNavigation, Point } from "./navigation";

/** Stable map homes on the entry's reachable component, independent of a saved player position. */
export function mapEnemyHomes(mapId: string, nav: NativeNavigation, entry: Point, count = 6): Point[] {
  if (!Number.isInteger(count) || count <= 0 || !nav.points.length) return [];
  const width = nav.grid.sourceWidth * nav.grid.unitsPerSourcePixel,
    height = nav.grid.sourceHeight * nav.grid.unitsPerSourcePixel;
  const points = nav.points.filter(p => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height)
    .slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const start = nav.nearest(entry);
  if (!start || !points.length) return [];
  const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const root = points.slice().sort((a, b) => distance(a, start) - distance(b, start))
    .find(point => nav.clear(start, point));
  if (!root) return [];
  const key = (x: number, y: number) => `${x},${y}`;
  const cells = new Map(points.map(p => [key(...nav.cell(p)), p]));
  const seen = new Set([key(...nav.cell(root))]), queue = [root];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index], [x, y] = nav.cell(current);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const id = key(nx, ny), next = cells.get(id);
      if (!next || seen.has(id) || !nav.clear(current, next)) continue;
      seen.add(id); queue.push(next);
    }
  }
  const reachable = points.filter(p => seen.has(key(...nav.cell(p))));
  const outsideEntry = reachable.filter(p => distance(p, start) > 85 ** 2);
  const candidates = outsideEntry.length ? outsideEntry : reachable;
  let seed = 2166136261;
  for (const char of mapId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const chosen = [candidates[seed % candidates.length]];
  const separation = candidates.map(point => distance(point, chosen[0]));
  while (chosen.length < Math.min(count, candidates.length)) {
    let best = -1, farthest = 0;
    for (let i = 0; i < candidates.length; i++) if (separation[i] > farthest) {
      best = i; farthest = separation[i];
    }
    if (best < 0) break;
    const next = candidates[best]; chosen.push(next);
    for (let i = 0; i < candidates.length; i++) separation[i] = Math.min(separation[i], distance(candidates[i], next));
  }
  return chosen.map(point => ({ ...point }));
}
