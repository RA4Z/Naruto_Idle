import type { NativeNavigation, Point } from "./navigation";

export const MELEE_RANGE = 28;

/** Shared diagnostics and gameplay rule. Coordinates are ground/world units;
 * visual texture bounds, crop origins and jutsu pixels never enter this test. */
export function meleeProbe(a: Point, b: Point, nav: NativeNavigation) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const inRange = Number.isFinite(distance) && distance < MELEE_RANGE;
  const clear = inRange && nav.clear(a, b);
  return { distance, reachable: clear, reason: !inRange ? "out-of-range" as const : clear ? "in-range" as const : "blocked" as const };
}
export function meleeReachable(a: Point, b: Point, nav: NativeNavigation) {
  return meleeProbe(a, b, nav).reachable;
}

/** A surrounding slot is useful only if its route actually ends in melee.
 * Thin walls and snapped grid cells must never strand a pursuer beside its prey.
 */
export function meleeApproach(
  from: Point,
  hero: Point,
  slotIndex: number,
  nav: NativeNavigation,
): Point[] {
  if (meleeReachable(from, hero, nav)) return [];
  const angle = (slotIndex * Math.PI) / 3;
  const slot = nav.nearest(
    {
      x: hero.x + Math.cos(angle) * 21,
      y: hero.y + Math.sin(angle) * 21,
    },
    MELEE_RANGE,
  );
  if (slot && meleeReachable(slot, hero, nav)) {
    const route = nav.path(from, slot);
    const end = route.at(-1);
    if (end && meleeReachable(end, hero, nav)) return route;
  }
  const route = nav.path(from, hero);
  const end = route.at(-1);
  return end && meleeReachable(end, hero, nav) ? route : [];
}
