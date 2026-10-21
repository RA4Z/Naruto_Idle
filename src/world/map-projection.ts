import type { Point } from "./navigation";
export function mapProjection(
  width: number,
  height: number,
  viewWidth = 320,
  viewHeight = 200,
) {
  const scale = Math.min(
    (viewWidth - 16) / Math.max(1, width),
    (viewHeight - 16) / Math.max(1, height),
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
