import { t } from "../i18n/core.ts";
import { CHARACTERS, type CharacterId } from "../config/characters.ts";
import { ITEMS, type Slot } from "./rules.ts";
import type { recruitProfile } from "./recruit-profiles.ts";
export type CombatLoadout = {
  level: number;
  upgrades: number;
  equipment: Partial<Record<Slot, string>>;
};
export type CombatProfile = CombatLoadout & {
  character: CharacterId;
  inventory: Record<string, number>;
};
export const ATTRIBUTE_LABELS = {
  vitality: t("progression.combat-stats.a38c1cc924"),
  strength: t("progression.combat-stats.52ec3a29b9"),
  ninjutsu: t("progression.combat-stats.338f89bb9f"),
  speed: t("progression.combat-stats.7780d60ca0"),
  chakra: t("progression.combat-stats.b1663b5db6"),
  control: t("progression.combat-stats.ba81bb0346"),
  resistance: t("progression.combat-stats.fdbe35e20b"),
} as const;
export type Attributes = Record<keyof typeof ATTRIBUTE_LABELS, number>;
export function damageAfterResistance(damage: number, resistance: number) {
  return Math.max(
    1,
    Math.round((Math.max(0, damage) * 100) / (100 + Math.max(0, resistance))),
  );
}
export function strikeDuration(special: boolean, interval: number) {
  return Math.min(special ? 700 : 450, interval * (special ? 0.8 : 0.65));
}
export function combatStats(
  s: CombatProfile,
  base: Attributes = CHARACTERS[s.character].attributes,
  recruit?: ReturnType<typeof recruitProfile>,
) {
  const gear = {
    attack: 0,
    hp: 0,
    chakra: 0,
    regen: 0,
    ninjutsu: 0,
    speed: 0,
    defense: 0,
  };
  for (const [slot, id] of Object.entries(s.equipment || {})) {
    const item = ITEMS.find((i) => i.id === id && i.slot === slot);
    if (item && s.level >= item.level && (s.inventory[item.id] || 0) > 0)
      for (const key of [
        "attack",
        "hp",
        "chakra",
        "regen",
        "ninjutsu",
        "speed",
        "defense",
      ] as const)
        gear[key] += item[key] || 0;
  }
  const level = Math.max(0, s.level - 1),
    training = Math.max(0, s.upgrades);
  const growth = recruit?.growth || {
    vitality: 12,
    strength: 2,
    ninjutsu: 2,
    speed: 0.75,
    chakra: 2,
    control: 0.1,
    resistance: 0.5,
  };
  const attributes: Attributes = {
    vitality: Math.max(
      1,
      base.vitality + level * growth.vitality + training * 9 + gear.hp,
    ),
    strength: Math.max(
      1,
      base.strength + level * growth.strength + training * 3 + gear.attack,
    ),
    ninjutsu: Math.max(
      0,
      base.ninjutsu + level * growth.ninjutsu + training * 2 + gear.ninjutsu,
    ),
    speed: Math.max(
      1,
      base.speed + level * growth.speed + training * 0.5 + gear.speed,
    ),
    chakra: Math.max(
      1,
      base.chakra + level * growth.chakra + training * 2 + gear.chakra,
    ),
    control: Math.max(
      0,
      base.control + level * growth.control + training * 0.2 + gear.regen * 2,
    ),
    resistance: Math.max(
      0,
      base.resistance +
        level * growth.resistance +
        training * 0.5 +
        gear.defense,
    ),
  };
  return {
    attributes,
    maxHp: Math.round(attributes.vitality),
    attack: Math.round(attributes.strength),
    skillCost: recruit?.cost || 35,
    skillPhysical: recruit?.physical || false,
    skillGuard: recruit?.guard || 0,
    skillDamage: Math.round(
      recruit
        ? attributes.strength * recruit.power[0] +
            attributes.ninjutsu * recruit.power[1]
        : attributes.strength + attributes.ninjutsu,
    ),
    skillHeal: Math.round(
      recruit
        ? recruit.heal
          ? attributes.vitality * recruit.heal + attributes.ninjutsu * 0.9
          : 0
        : attributes.vitality * 0.15 + attributes.ninjutsu * 0.5,
    ),
    maxChakra: Math.round(attributes.chakra),
    chakraRegen: attributes.control * 0.5,
    interval: Math.max(
      450,
      Math.min(1600, Math.round(110000 / attributes.speed)),
    ),
    moveSpeed: Math.max(72, Math.min(180, (96 * attributes.speed) / 100)),
    defense: attributes.resistance,
  };
}
// PvP journey mode imports a local build for friendly duels, never a ranked identity.
// Derive every combat value here; clients cannot supply attack, HP or item bonuses.
export function validateArenaLoadout(input: unknown): CombatLoadout {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(t("progression.combat-stats.703121fff1"));
  const s = input as Record<string, unknown>;
  if (
    Object.keys(s).some((k) => !["level", "upgrades", "equipment"].includes(k))
  )
    throw new Error(t("progression.combat-stats.b789670ff8"));
  if (
    !Number.isSafeInteger(s.level) ||
    (s.level as number) < 1 ||
    (s.level as number) > 100 ||
    !Number.isSafeInteger(s.upgrades) ||
    (s.upgrades as number) < 0 ||
    (s.upgrades as number) > 10000
  )
    throw new Error(t("progression.combat-stats.289a4a8c3a"));
  if (
    !s.equipment ||
    typeof s.equipment !== "object" ||
    Array.isArray(s.equipment)
  )
    throw new Error(t("progression.combat-stats.db9f0cc42b"));
  const equipment: Partial<Record<Slot, string>> = {};
  for (const [slot, id] of Object.entries(s.equipment)) {
    if (
      !ITEMS.some(
        (i) => i.id === id && i.slot === slot && i.level <= (s.level as number),
      )
    )
      throw new Error(t("progression.combat-stats.ae5c7a5f49"));
    equipment[slot as Slot] = id as string;
  }
  return {
    level: s.level as number,
    upgrades: s.upgrades as number,
    equipment,
  };
}
export function arenaJourneyStats(
  character: CharacterId,
  loadout: CombatLoadout,
) {
  return combatStats({
    character,
    ...loadout,
    inventory: Object.fromEntries(
      Object.values(loadout.equipment).map((id) => [id, 1]),
    ),
  });
}
