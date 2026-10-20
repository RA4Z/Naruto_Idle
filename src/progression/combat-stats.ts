import { CHARACTERS, type CharacterId } from "../config/characters.ts";
import { ITEMS, type Slot } from "./rules.ts";
export type CombatLoadout = {
  level: number;
  upgrades: number;
  equipment: Partial<Record<Slot, string>>;
};
export type CombatProfile = CombatLoadout & {
  character: CharacterId;
  inventory: Record<string, number>;
};
export function combatStats(s: CombatProfile) {
  const c = CHARACTERS[s.character];
  const gear = { attack: 0, hp: 0, chakra: 0, regen: 0 };
  for (const [slot, id] of Object.entries(s.equipment || {})) {
    const item = ITEMS.find((i) => i.id === id && i.slot === slot);
    if (item && (s.inventory[item.id] || 0) > 0)
      for (const key of ["attack", "hp", "chakra", "regen"] as const)
        gear[key] += item[key];
  }
  return {
    maxHp: c.hp + (s.level - 1) * 12 + s.upgrades * 9 + gear.hp,
    attack: c.attack + (s.level - 1) * 2 + s.upgrades * 3 + gear.attack,
    maxChakra: 100 + gear.chakra,
    chakraRegen: 5 + gear.regen,
    interval: c.interval,
  };
}
// PvP journey mode imports a local build for friendly duels, never a ranked identity.
// Derive every combat value here; clients cannot supply attack, HP or item bonuses.
export function validateArenaLoadout(input: unknown): CombatLoadout {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Build inválida.");
  const s = input as Record<string, unknown>;
  if (
    Object.keys(s).some((k) => !["level", "upgrades", "equipment"].includes(k))
  )
    throw new Error("Atributos de combate são calculados pelo servidor.");
  if (
    !Number.isSafeInteger(s.level) ||
    (s.level as number) < 1 ||
    (s.level as number) > 100 ||
    !Number.isSafeInteger(s.upgrades) ||
    (s.upgrades as number) < 0 ||
    (s.upgrades as number) > 10000
  )
    throw new Error("Nível ou treinos fora dos limites do duelo.");
  if (
    !s.equipment ||
    typeof s.equipment !== "object" ||
    Array.isArray(s.equipment)
  )
    throw new Error("Equipamento inválido.");
  const equipment: Partial<Record<Slot, string>> = {};
  for (const [slot, id] of Object.entries(s.equipment)) {
    if (!ITEMS.some((i) => i.id === id && i.slot === slot))
      throw new Error("Item desconhecido ou no slot incorreto.");
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
