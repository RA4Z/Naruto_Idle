import type { Save } from "../model";
import { activeCharacterId } from "./character-progress";

/** One owner per reserved copy, without counting the active projection twice. */
export function equipmentOwners(s: Save, item: string): string[] {
  const active = activeCharacterId(s);
  return [...new Set([...(s.collection || []), active])].filter((id) =>
    Object.values(
      id === active
        ? s.equipment || {}
        : s.characterProgress?.[id]?.equipment || {},
    ).includes(item),
  );
}

/** Inventory stores total owned copies, including those currently equipped. */
export function equipmentCopies(
  s: Save,
  item: string,
  exceptCharacter?: string,
) {
  const active = activeCharacterId(s);
  let used = 0;
  for (const id of new Set([...(s.collection || []), active])) {
    if (id === exceptCharacter) continue;
    const equipment =
      id === active ? s.equipment : s.characterProgress?.[id]?.equipment;
    used += Object.values(equipment || {}).filter(
      (value) => value === item,
    ).length;
  }
  const total = s.inventory[item] || 0;
  return { total, used, available: Math.max(0, total - used) };
}

/** Repair legacy shared unlocks without creating items or deleting owned copies.
 * Keep the active character first, then collection order. Presets reserve nothing.
 * Called after restore has validated all slots and synchronized the active record.
 */
export function reconcileEquipmentCopies(s: Save) {
  const active = activeCharacterId(s);
  const remaining = { ...s.inventory };
  for (const id of new Set([active, ...(s.collection || [])])) {
    const equipment = s.characterProgress?.[id]?.equipment;
    if (!equipment) continue;
    for (const [slot, item] of Object.entries(equipment)) {
      if ((remaining[item] || 0) > 0) remaining[item]--;
      else delete equipment[slot as keyof typeof equipment];
    }
  }
  s.equipment = { ...s.characterProgress?.[active]?.equipment };
}
