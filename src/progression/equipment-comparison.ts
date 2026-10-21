import { stats, type Save } from "../model.ts";
import { ITEMS } from "./rules.ts";

export function compareEquipment(save: Save, itemId: string) {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Unknown item");
  // Simulate ownership for shop previews without purchasing or mutating the save.
  const preview = structuredClone(save);
  preview.level = Math.max(preview.level, item.level);
  const before = stats(structuredClone(preview));
  preview.inventory[item.id] = Math.max(1, preview.inventory[item.id] || 0);
  preview.equipment = { ...preview.equipment, [item.slot]: item.id };
  const after = stats(preview);
  return {
    attack: after.attack - before.attack,
    hp: after.maxHp - before.maxHp,
    chakra: after.maxChakra - before.maxChakra,
    regen: after.chakraRegen - before.chakraRegen,
    skillDamage: after.skillDamage - before.skillDamage,
    attackRate: 1000 / after.interval - 1000 / before.interval,
    moveSpeed: after.moveSpeed - before.moveSpeed,
    defense: after.defense - before.defense,
  };
}
