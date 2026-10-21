import { t } from "../i18n/core.ts";
import type { Save } from "../model";
import { syncCharacterProgress } from "./character-progress.ts";
export type Slot = "weapon" | "armor" | "charm";
export type Item = {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  attack: number;
  hp: number;
  chakra: number;
  regen: number;
  ninjutsu?: number;
  speed?: number;
  defense?: number;
  level: number;
  tier: number;
  path: "damage" | "survival" | "chakra";
  description: string;
};
export const ITEMS: Item[] = [
  {
    id: "kunai-treino",
    level: 1,
    tier: 1,
    path: "damage",
    name: t("progression.rules.a4da266cf9"),
    slot: "weapon" as Slot,
    price: 45,
    attack: 3,
    hp: 0,
    chakra: 0,
    regen: 0,
    description: t("progression.rules.834f4c4d6f"),
  },
  {
    id: "kunai-reforcada",
    level: 1,
    tier: 1,
    path: "damage",
    name: t("progression.rules.a98e982537"),
    slot: "weapon" as Slot,
    price: 140,
    attack: 8,
    hp: 0,
    chakra: 0,
    regen: 0,
    description: t("progression.rules.d77d892f13"),
  },
  {
    id: "colete-shinobi",
    level: 1,
    tier: 1,
    path: "survival",
    name: t("progression.rules.0144c71e0e"),
    slot: "armor" as Slot,
    price: 70,
    attack: 0,
    hp: 28,
    chakra: 0,
    regen: 0,
    description: t("progression.rules.3b00dfee97"),
  },
  {
    id: "amuleto-chakra",
    level: 1,
    tier: 1,
    path: "chakra",
    name: t("progression.rules.5cc8774199"),
    slot: "charm" as Slot,
    price: 65,
    attack: 0,
    hp: 0,
    chakra: 25,
    regen: 1.5,
    description: t("progression.rules.9fd4817d46"),
  },
];
const branches = [
  {
    id: "lamina-assalto",
    name: "balance.gear.blade",
    slot: "weapon",
    path: "damage",
    attack: 12,
    hp: -12,
    speed: 2,
    defense: -3,
  },
  {
    id: "bastao-guardiao",
    name: "balance.gear.staff",
    slot: "weapon",
    path: "survival",
    attack: 5,
    hp: 22,
    defense: 8,
    speed: -4,
  },
  {
    id: "selo-canalizador",
    name: "balance.gear.focus",
    slot: "weapon",
    path: "chakra",
    attack: -2,
    ninjutsu: 20,
    chakra: 20,
    regen: 1,
  },
  {
    id: "traje-assalto",
    name: "balance.gear.outfit",
    slot: "armor",
    path: "damage",
    attack: 6,
    hp: 16,
    speed: 3,
    defense: -3,
  },
  {
    id: "armadura-guardiao",
    name: "balance.gear.armor",
    slot: "armor",
    path: "survival",
    hp: 65,
    defense: 14,
    speed: -7,
  },
  {
    id: "manto-canalizador",
    name: "balance.gear.robe",
    slot: "armor",
    path: "chakra",
    hp: 20,
    chakra: 40,
    ninjutsu: 10,
    regen: 1.5,
  },
  {
    id: "talisma-assalto",
    name: "balance.gear.fang",
    slot: "charm",
    path: "damage",
    attack: 5,
    speed: 4,
    chakra: -15,
    hp: -8,
  },
  {
    id: "talisma-guardiao",
    name: "balance.gear.ward",
    slot: "charm",
    path: "survival",
    hp: 35,
    defense: 10,
    speed: -3,
  },
  {
    id: "talisma-canalizador",
    name: "balance.gear.seal",
    slot: "charm",
    path: "chakra",
    chakra: 55,
    regen: 2.5,
    ninjutsu: 6,
  },
] as const;
for (const tier of [2, 3])
  for (const branch of branches) {
    const factor = tier === 2 ? 1 : 1.8;
    const item: Item = {
      id: `${branch.id}-${tier}`,
      name: `${t(branch.name)} ${tier === 2 ? "II" : "III"}`,
      slot: branch.slot,
      path: branch.path,
      tier,
      level: tier === 2 ? 5 : 12,
      price: tier === 2 ? 260 : 950,
      attack: 0,
      hp: 0,
      chakra: 0,
      regen: 0,
      description: t(
        branch.path === "damage"
          ? "balance.gear.damage"
          : branch.path === "survival"
            ? "balance.gear.survival"
            : "balance.gear.chakra",
      ),
    };
    for (const key of [
      "attack",
      "hp",
      "chakra",
      "regen",
      "ninjutsu",
      "speed",
      "defense",
    ] as const) {
      const value = (branch as Partial<Record<typeof key, number>>)[key] || 0;
      item[key] =
        key === "regen"
          ? Math.round(value * factor * 10) / 10
          : Math.round(value * factor);
    }
    ITEMS.push(item);
  }
export const STARTER_COLLECTION = ["11000101", "11000211", "11000301"];
export const RECRUIT_COST = { coins: 60, fragments: 3 };
export function equipmentBonuses(s: Save) {
  const result = { attack: 0, hp: 0, chakra: 0, regen: 0 };
  for (const [slot, id] of Object.entries(s.equipment || {})) {
    const item = ITEMS.find((i) => i.id === id && i.slot === slot);
    if (item && s.level >= item.level && (s.inventory[item.id] || 0) > 0)
      for (const key of ["attack", "hp", "chakra", "regen"] as const)
        result[key] += item[key];
  }
  return result;
}
export function buyItem(s: Save, id: string) {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(t("progression.rules.1a61e522d4"));
  if (s.inventory[id]) throw new Error(t("progression.rules.d4bf50dfbb"));
  if (s.coins < item.price) throw new Error(t("progression.rules.54f856988d"));
  if (s.level < item.level)
    throw new Error(t("balance.requireLevel", { level: item.level }));
  s.coins -= item.price;
  s.inventory[id] = 1;
  return item;
}
export function equipItem(s: Save, id: string) {
  const item = ITEMS.find((i) => i.id === id);
  if (!item || !s.inventory[id])
    throw new Error(t("progression.rules.f9c528c4c4"));
  if (s.level < item.level)
    throw new Error(t("balance.requireLevel", { level: item.level }));
  s.equipment ??= {};
  s.equipment[item.slot] = id;
  syncCharacterProgress(s);
  return item;
}
export function recruit(s: Save, id: string) {
  if (id === "11000201") throw new Error(t("progression.rules.5d62a61688"));
  if (!/^\d{6,12}$/.test(id))
    throw new Error(t("progression.rules.d34ba284de"));
  s.collection ??= [...STARTER_COLLECTION];
  if (s.collection.includes(id))
    throw new Error(t("progression.rules.fbac7545c8"));
  if (
    s.coins < RECRUIT_COST.coins ||
    (s.inventory.fragmento || 0) < RECRUIT_COST.fragments
  )
    throw new Error(t("progression.rules.b076ad2c01"));
  s.coins -= RECRUIT_COST.coins;
  s.inventory.fragmento -= RECRUIT_COST.fragments;
  s.collection.push(id);
  syncCharacterProgress(s);
}
export const QUESTS = [
  {
    id: "first-victory",
    name: t("progression.rules.b0660f1394"),
    description: t("progression.rules.b4b7a2d93c"),
    target: 1,
    coins: 40,
    xp: 30,
    progress: (s: Save) => s.kills,
  },
  {
    id: "forest-visit",
    name: t("progression.rules.47751e44bf"),
    description: t("progression.rules.8e4edb2822"),
    target: 1,
    coins: 20,
    xp: 15,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10005")),
  },
  {
    id: "training-visit",
    name: t("progression.rules.4968db1825"),
    description: t("progression.rules.867e06e9d0"),
    target: 1,
    coins: 20,
    xp: 15,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10006")),
  },
  {
    id: "ten-victories",
    name: t("progression.rules.cfb0492507"),
    description: t("progression.rules.cf64d17525"),
    target: 10,
    coins: 90,
    xp: 80,
    progress: (s: Save) => s.kills,
  },
  {
    id: "waves-visit",
    name: t("progression.rules.80a44609b8"),
    description: t("progression.rules.ea366e6311"),
    target: 1,
    coins: 30,
    xp: 25,
    progress: (s: Save) => Number(s.visitedMaps?.includes("10008")),
  },
];
export function claimQuest(s: Save, id: string) {
  const quest = QUESTS.find((q) => q.id === id);
  if (!quest) throw new Error(t("progression.rules.4764fa0b27"));
  if (s.questClaims?.includes(id))
    throw new Error(t("progression.rules.c2bb1ab387"));
  if (quest.progress(s) < quest.target)
    throw new Error(t("progression.rules.497852c0b1"));
  s.questClaims ??= [];
  s.questClaims.push(id);
  s.coins += quest.coins;
  return { coins: quest.coins, xp: quest.xp };
}
