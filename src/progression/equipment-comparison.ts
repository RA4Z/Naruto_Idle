import { stats, type Save } from "../model.ts";
import { ITEMS } from "./rules.ts";

export function compareEquipment(save: Save, itemId: string) {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Unknown item");
  // Simulate ownership for shop previews without purchasing or mutating the save.
  const preview = structuredClone(save);
  preview.inventory[item.id] = Math.max(1, preview.inventory[item.id] || 0);
  preview.equipment = { ...preview.equipment, [item.slot]: item.id };
  const before = stats(structuredClone(save)),
    after = stats(preview);
  return {
    attack: after.attack - before.attack,
    hp: after.maxHp - before.maxHp,
    chakra: after.maxChakra - before.maxChakra,
    regen: after.chakraRegen - before.chakraRegen,
  };
}
