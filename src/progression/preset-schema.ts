import { ITEMS, type Slot } from "./rules";
export const PRESET_IDS = ["damage", "survival", "chakra"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export type Equipment = Partial<Record<Slot, string>>;
export type EquipmentPresets = Record<
  string,
  Partial<Record<PresetId, Equipment>>
>;
export function validPresets(
  value: unknown,
  collection: string[],
): value is EquipmentPresets {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([id, presets]) =>
      collection.includes(id) &&
      presets &&
      typeof presets === "object" &&
      !Array.isArray(presets) &&
      Object.entries(presets).every(
        ([key, gear]) =>
          PRESET_IDS.includes(key as PresetId) &&
          gear &&
          typeof gear === "object" &&
          !Array.isArray(gear) &&
          Object.entries(gear).every(([slot, item]) =>
            ITEMS.some((i) => i.slot === slot && i.id === item),
          ),
      ),
  );
}
