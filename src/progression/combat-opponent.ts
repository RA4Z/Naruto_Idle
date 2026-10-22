import type { EnemyProfile } from "../world/enemy-profiles";
export type CombatOpponent = {
  id: string;
  profile: EnemyProfile;
  hp: number;
  maxHp: number;
  clock: number;
  attacks: number;
  windup: boolean;
  windupMs: number;
  healsLeft: number;
  inRange: boolean;
  rewarded: boolean;
};
export function combatOpponent(
  id: string,
  profile: EnemyProfile,
  hp: number,
  opening: number,
): CombatOpponent {
  return {
    id,
    profile: { ...profile },
    hp,
    maxHp: hp,
    clock: Math.max(0, profile.interval - opening),
    attacks: 0,
    windup: false,
    windupMs: 0,
    healsLeft: 3,
    inRange: true,
    rewarded: false,
  };
}
