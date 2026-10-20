import type { CombatLoadout } from "../progression/combat-stats";
// Arena stats are independent of editable local saves and PvE equipment.
export const ARENA_FIGHTERS = {
  naruto: {
    name: "Naruto",
    folder: "naruto-kid",
    hp: 180,
    attack: 25,
    skill: "Rasengan",
    damage: 58,
    heal: 0,
  },
  sasuke: {
    name: "Sasuke",
    folder: "sasuke-kid",
    hp: 170,
    attack: 27,
    skill: "Chidori",
    damage: 62,
    heal: 0,
  },
  sakura: {
    name: "Sakura",
    folder: "sakura-kid",
    hp: 190,
    attack: 26,
    skill: "Cura",
    damage: 0,
    heal: 52,
  },
} as const;
export const ARENA_RULES = {
  chakra: 100,
  skillCost: 35,
  regen: 8,
  charge: 30,
  skillCooldown: 2,
  turnMs: 30000,
  disconnectMs: 60000,
  waitingMs: 900000,
  retentionMs: 300000,
  maxMatchMs: 7200000,
  maxRooms: 100,
} as const;
export type ArenaCharacter = keyof typeof ARENA_FIGHTERS;
export type ArenaAction = "attack" | "skill" | "guard" | "charge";
export type ArenaMode = "balanced" | "journey";
export type ArenaPlayer = {
  attack: number;
  skillDamage: number;
  skillHeal: number;
  maxChakra: number;
  chakraRegen: number;
  loadout: CombatLoadout | null;
  character: ArenaCharacter;
  hp: number;
  maxHp: number;
  chakra: number;
  guarding: boolean;
  cooldown: number;
  connected: boolean;
};
export type ArenaEvent = {
  id: number;
  seat: number;
  action: ArenaAction | "timeout" | "leave";
  damage: number;
  heal: number;
  text: string;
};
export type ArenaState = {
  mode: ArenaMode;
  code: string;
  revision: number;
  status: "waiting" | "active" | "finished" | "expired";
  players: ArenaPlayer[];
  turn: number;
  turnNumber: number;
  deadline: number;
  serverTime: number;
  winner: number | null;
  reason: string | null;
  log: ArenaEvent[];
  rules: typeof ARENA_RULES;
};
export type ArenaSession = { room: ArenaState | null; seat: number | null };
