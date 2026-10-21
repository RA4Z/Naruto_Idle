import type { Point } from "./navigation";
import type { EnemyProfile } from "./enemy-profiles";
export const SIGHT = {
  proximity: 36,
  halfAngle: Math.PI / 3,
  memoryMs: 10000,
  leash: 420,
  stuckMs: 7500,
  returnTolerance: 12,
};
export type Awareness = {
  alerted: boolean;
  returning: boolean;
  unseenMs: number;
};
export const freshAwareness = (): Awareness => ({
  alerted: false,
  returning: false,
  unseenMs: 0,
});
export function visionRadius(profile: EnemyProfile) {
  return Math.max(140, profile.radius + 85);
}
export function seesPlayer(
  enemy: Point,
  heading: Point,
  hero: Point,
  radius: number,
  clear: (a: Point, b: Point) => boolean,
) {
  const dx = hero.x - enemy.x,
    dy = hero.y - enemy.y,
    distance = Math.hypot(dx, dy);
  if (distance > radius) return false;
  const facing = Math.hypot(heading.x, heading.y) || 1;
  const inside =
    distance <= SIGHT.proximity ||
    (heading.x * dx + heading.y * dy) / (facing * distance) >=
      Math.cos(SIGHT.halfAngle) - 1e-9;
  return inside && clear(enemy, hero);
}
/** Uses the same solid obstacles as movement; no detection through blocked terrain. */
export function updateAwareness(
  state: Awareness,
  enemy: Point,
  heading: Point,
  hero: Point,
  home: Point,
  profile: EnemyProfile,
  clear: (a: Point, b: Point) => boolean,
  delta: number,
) {
  if (state.returning) {
    if (Math.hypot(enemy.x - home.x, enemy.y - home.y) <= SIGHT.returnTolerance)
      Object.assign(state, freshAwareness());
    return;
  }
  if (Math.hypot(hero.x - home.x, hero.y - home.y) > SIGHT.leash) {
    if (state.alerted) {
      state.alerted = false;
      state.returning = true;
      state.unseenMs = 0;
    }
    return;
  }
  if (seesPlayer(enemy, heading, hero, visionRadius(profile), clear)) {
    state.alerted = true;
    state.unseenMs = 0;
  } else if (state.alerted) {
    state.unseenMs += Math.max(0, delta);
    if (state.unseenMs >= SIGHT.memoryMs) {
      state.alerted = false;
      state.returning = true;
      state.unseenMs = 0;
    }
  }
}
