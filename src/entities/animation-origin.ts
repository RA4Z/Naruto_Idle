type Origins = { origin: [number, number]; frameOrigins?: [number, number][] };

// Origins are indexed by unique texture frame, not by repeated timeline entry.
export function animationOrigin(
  animation: Origins,
  frame: number | string,
): [number, number] {
  const candidate = animation.frameOrigins?.[Number(frame)];
  return candidate?.length === 2 && candidate.every(Number.isFinite)
    ? candidate
    : animation.origin;
}
