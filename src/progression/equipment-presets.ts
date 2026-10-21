import type { Save } from "../model";
import { stats } from "../model";
import { activeCharacterId, syncCharacterProgress } from "./character-progress";
import { ITEMS } from "./rules";
import { PRESET_IDS, type PresetId } from "./preset-schema";
export { PRESET_IDS } from "./preset-schema";
import { t } from "../i18n/core";
export function savePreset(s: Save, key: PresetId) {
  if (!PRESET_IDS.includes(key)) throw new Error(t("expansion.presetMissing"));
  const id = activeCharacterId(s);
  s.equipmentPresets ??= {};
  s.equipmentPresets[id] ??= {};
  s.equipmentPresets[id][key] = { ...s.equipment };
}
export function presetEquipment(s: Save, key: PresetId) {
  return s.equipmentPresets?.[activeCharacterId(s)]?.[key];
}
export function applyPreset(s: Save, key: PresetId, allowed: boolean) {
  if (!allowed) throw new Error(t("qol.switchBlocked"));
  const equipment = presetEquipment(s, key);
  if (!equipment) throw new Error(t("expansion.presetMissing"));
  // Validate the whole set before changing any slot. Empty slots unequip items.
  for (const [slot, id] of Object.entries(equipment)) {
    const item = ITEMS.find((i) => i.id === id && i.slot === slot);
    if (!item || !s.inventory[item.id])
      throw new Error(t("expansion.presetUnavailable"));
    if (s.level < item.level)
      throw new Error(t("balance.requireLevel", { level: item.level }));
  }
  s.equipment = { ...equipment };
  syncCharacterProgress(s);
}
export function comparePreset(s: Save, key: PresetId) {
  const equipment = presetEquipment(s, key);
  if (!equipment) return;
  const before = stats(structuredClone(s));
  const preview = structuredClone(s);
  preview.equipment = { ...equipment };
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
