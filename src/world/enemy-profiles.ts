export type EnemyProfile = {
  kind:
    | "balanced"
    | "hunter"
    | "brute"
    | "assassin"
    | "armored"
    | "caster"
    | "medic";
  elite: boolean;
  hp: number;
  attack: number;
  interval: number;
  defense: number;
  ninjutsuDefense: number;
  xp: number;
  coins: number;
  speed: number;
  radius: number;
  behavior: "patrol" | "chase" | "retreat";
  specialEvery: number;
  specialPower: number;
  pierce: number;
  heal: number;
};
const profiles: Record<
  EnemyProfile["kind"],
  Omit<EnemyProfile, "kind" | "elite">
> = {
  balanced: {
    hp: 1,
    attack: 1,
    interval: 1450,
    defense: 0,
    ninjutsuDefense: 0,
    xp: 1,
    coins: 1,
    speed: 23,
    radius: 65,
    behavior: "patrol",
    specialEvery: 0,
    specialPower: 1,
    pierce: 0,
    heal: 0,
  },
  hunter: {
    hp: 0.85,
    attack: 0.8,
    interval: 1120,
    defense: 3,
    ninjutsuDefense: 0,
    xp: 0.95,
    coins: 0.9,
    speed: 32,
    radius: 85,
    behavior: "chase",
    specialEvery: 3,
    specialPower: 1.5,
    pierce: 0,
    heal: 0,
  },
  brute: {
    hp: 1.4,
    attack: 1.45,
    interval: 1850,
    defense: 8,
    ninjutsuDefense: 2,
    xp: 1.3,
    coins: 1.2,
    speed: 22,
    radius: 60,
    behavior: "chase",
    specialEvery: 3,
    specialPower: 1.6,
    pierce: 0,
    heal: 0,
  },
  assassin: {
    hp: 0.9,
    attack: 1,
    interval: 1200,
    defense: 4,
    ninjutsuDefense: 4,
    xp: 1.1,
    coins: 1.15,
    speed: 30,
    radius: 75,
    behavior: "chase",
    specialEvery: 3,
    specialPower: 1.3,
    pierce: 0.35,
    heal: 0,
  },
  armored: {
    hp: 1.2,
    attack: 1.15,
    interval: 1680,
    defense: 28,
    ninjutsuDefense: 5,
    xp: 1.25,
    coins: 1.35,
    speed: 18,
    radius: 40,
    behavior: "patrol",
    specialEvery: 3,
    specialPower: 1.4,
    pierce: 0,
    heal: 0,
  },
  caster: {
    hp: 0.85,
    attack: 1.1,
    interval: 1500,
    defense: 0,
    ninjutsuDefense: 24,
    xp: 1.15,
    coins: 1.2,
    speed: 26,
    radius: 75,
    behavior: "retreat",
    specialEvery: 3,
    specialPower: 1.5,
    pierce: 0.25,
    heal: 0,
  },
  medic: {
    hp: 1.1,
    attack: 0.75,
    interval: 1550,
    defense: 5,
    ninjutsuDefense: 14,
    xp: 1.2,
    coins: 1.3,
    speed: 20,
    radius: 45,
    behavior: "retreat",
    specialEvery: 3,
    specialPower: 1,
    pierce: 0,
    heal: 0.08,
  },
};
const kinds: Record<string, EnemyProfile["kind"]> = {
  "19000301": "hunter",
  "19000701": "hunter",
  "19000401": "brute",
  "19000901": "assassin",
  "19001001": "armored",
  "19001701": "assassin",
  "19001801": "caster",
  "19002301": "armored",
  "19000101": "caster",
  "19000201": "caster",
  "19004301": "medic",
};
export function enemyProfile(id = "", elite = false): EnemyProfile {
  const kind = kinds[id] || "balanced",
    base = profiles[kind];
  const blackWolf = id === "19000701";
  return {
    ...base,
    kind,
    elite,
    hp: base.hp * (blackWolf ? 1.15 : 1) * (elite ? 1.8 : 1),
    attack: base.attack * (blackWolf ? 1.12 : 1) * (elite ? 1.2 : 1),
    interval: Math.round(base.interval * (elite ? 0.9 : 1)),
    defense: base.defense + (elite ? 8 : 0),
    ninjutsuDefense: base.ninjutsuDefense + (elite ? 8 : 0),
    xp: base.xp * (blackWolf ? 1.1 : 1) * (elite ? 2.5 : 1),
    coins: base.coins * (blackWolf ? 1.1 : 1) * (elite ? 2.5 : 1),
  };
}
