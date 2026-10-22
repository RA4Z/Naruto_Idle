type Origins = { origin: [number, number]; frameOrigins?: [number, number][] };

// Origins are indexed by unique texture frame, not by repeated timeline entry.
export function animationOrigin(
  animation: Origins,
  frame: number | string,
  flipX = false,
): [number, number] {
  const candidate = animation.frameOrigins?.[Number(frame)];
  const origin = candidate?.length === 2 && candidate.every(Number.isFinite)
    ? candidate
    : animation.origin;
  // Phaser flipX mirrors within the crop's bounds. Mirror its registration too
  // so compact poses and effects reflect around their shared ground point.
  return flipX ? [1 - origin[0], origin[1]] : origin;
}
