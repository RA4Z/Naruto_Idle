import type { Point } from "./navigation";

/** Local radar: keep the hero centered and reject clicks outside the disc/map. */
export function radarProjection(width: number, height: number, hero: Point) {
  const radius = 116;
  const range = 220;
  const scale = radius / range;
  const x = 120 - hero.x * scale;
  const y = 120 - hero.y * scale;
  return {
    x,
    y,
    scale,
    range,
    width: width * scale,
    height: height * scale,
    project: (point: Point) => ({
      x: x + point.x * scale,
      y: y + point.y * scale,
    }),
    unproject: (point: Point): Point | undefined => {
      if (Math.hypot(point.x - 120, point.y - 120) > radius) return;
      const p = { x: (point.x - x) / scale, y: (point.y - y) / scale };
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return;
      return p;
    },
  };
}
export function mapProjection(
  width: number,
  height: number,
  viewWidth = 320,
  viewHeight = 200,
  padding = 8,
) {
  const scale = Math.min(
    (viewWidth - padding * 2) / Math.max(1, width),
    (viewHeight - padding * 2) / Math.max(1, height),
  );
  const x = (viewWidth - width * scale) / 2,
    y = (viewHeight - height * scale) / 2;
  return {
    x,
    y,
    scale,
    width: width * scale,
    height: height * scale,
    project: (point: Point) => ({
      x: x + point.x * scale,
      y: y + point.y * scale,
    }),
    unproject: (point: Point): Point | undefined =>
      point.x < x ||
      point.y < y ||
      point.x > x + width * scale ||
      point.y > y + height * scale
        ? undefined
        : { x: (point.x - x) / scale, y: (point.y - y) / scale },
  };
}
