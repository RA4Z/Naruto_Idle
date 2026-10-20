export type Point = { x: number; y: number };
// Authored from the visible street edges, independently of the patrol waypoints.
// Only this audited lane is navigable. Roofs, gardens and fenced yards are excluded.
export const STREET: Point[] = [
  { x: 285, y: 177 },
  { x: 329, y: 186 },
  { x: 415, y: 244 },
  { x: 490, y: 291 },
  { x: 554, y: 315 },
  { x: 609, y: 350 },
  { x: 665, y: 390 },
  { x: 677, y: 429 },
  { x: 638, y: 441 },
  { x: 578, y: 408 },
  { x: 519, y: 377 },
  { x: 450, y: 340 },
  { x: 375, y: 285 },
  { x: 302, y: 233 },
  { x: 278, y: 208 },
];
export function isWalkable(p: Point, radius = 6): boolean {
  let inside = false;
  for (let i = 0, j = STREET.length - 1; i < STREET.length; j = i++) {
    const a = STREET[i],
      b = STREET[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
    );
    if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < radius)
      return false;
  }
  return inside;
}
export const CAMERA_ZOOM = 3.1;
export const HERO_HEIGHT = 45;
// Keep the rig scale fixed throughout each mode. Crouching/running poses are
// allowed to change silhouette; never resize individual frames or use world Y.
const referenceHeights = {
  naruto: { world: 107, battle: 118 },
  sasuke: { world: 113, battle: 129 },
  sakura: { world: 119, battle: 130 },
};
export function actorScale(
  character: keyof typeof referenceHeights,
  mode: "world" | "battle",
) {
  return HERO_HEIGHT / referenceHeights[character][mode];
}

// Reflect the next encounter along the return trip at the end of the street.
// Clamping here would respawn a target beside the hero and trap the patrol.
export function nextEncounterIndex(
  target: number,
  step: number,
  length: number,
): number {
  let index = target + step * 2;
  if (index >= length || index < 0) index = target - step * 2;

  return index;
}
