import type { Save } from "../model";
import {
  characterProgress,
  FUTURE_CHARACTERS,
  activeCharacterId,
} from "./character-progress";
import { ITEMS, buyItem, type Slot, type Item } from "./rules";
import { equipmentCopies, equipmentOwners } from "./equipment-ownership";

export type EquipmentCopyCard = { item: Item; key: string; owner?: string };

export function equipmentCopyCard(
  save: Save,
  item: Item,
  key: string,
): EquipmentCopyCard | undefined {
  if (key.startsWith("owner:")) {
    const owner = key.slice(6);
    if (equipmentOwners(save, item.id).includes(owner))
      return { item, key, owner };
  } else if (/^free:\d+$/.test(key)) {
    const index = Number(key.slice(5));
    if (index < equipmentCopies(save, item.id).available) return { item, key };
  }
}

/** Identical copies need no new save format. Owner keys stay stable across roster switches;
 * free keys identify interchangeable inventory units, not permanent item instances.
 * Limit materialization so large stacks never create thousands of DOM nodes.
 */
export function equipmentCopyCards(
  save: Save,
  items: Item[],
  character: string,
  usableOnly = false,
  limit = 60,
) {
  const cards: EquipmentCopyCard[] = [];
  let total = 0;
  for (const item of items) {
    const owners = equipmentOwners(save, item.id);
    const free = Math.max(0, (save.inventory[item.id] || 0) - owners.length);
    const visibleOwners = usableOnly
      ? owners.filter((owner) => owner === character)
      : owners;
    total += visibleOwners.length + free;
    for (const owner of visibleOwners) {
      if (cards.length >= limit) break;
      cards.push({ item, key: `owner:${owner}`, owner });
    }
    const freeLimit = Math.min(free, Math.max(0, limit - cards.length));
    for (let i = 0; i < freeLimit; i++) cards.push({ item, key: `free:${i}` });
  }
  return { cards, total };
}
function shopCharacter(save: Save) {
  return (save.collection || [activeCharacterId(save)])
    .filter((id) => !FUTURE_CHARACTERS.has(id))
    .reduce(
      (best, id) =>
        characterProgress(save, id).level > characterProgress(save, best).level
          ? id
          : best,
      activeCharacterId(save),
    );
}
export const shopLevel = (save: Save) =>
  characterProgress(save, shopCharacter(save)).level;
export const buyShopItem = (save: Save, item: string) =>
  buyItem(save, item, shopCharacter(save));
export type GearFilters = {
  shop: boolean;
  slot?: Slot;
  path?: string;
  availability?: "all" | "usable" | "affordable";
  sort?: "level" | "price" | "priceDescending";
};
export function equipmentCatalog(
  save: Save,
  character: string,
  filters: GearFilters,
) {
  const level = filters.shop
    ? shopLevel(save)
    : characterProgress(save, character).level;
  return ITEMS.filter(
    (item) =>
      (filters.shop || save.inventory[item.id]) &&
      (!filters.slot || item.slot === filters.slot) &&
      (!filters.path || item.path === filters.path) &&
      (filters.availability !== "usable" ||
        (item.level <= level &&
          (filters.shop ||
            equipmentCopies(save, item.id, character).available > 0))) &&
      (filters.availability !== "affordable" ||
        (item.level <= level && item.price <= save.coins)),
  ).sort((a, b) =>
    filters.sort === "price"
      ? a.price - b.price || a.name.localeCompare(b.name)
      : filters.sort === "priceDescending"
        ? b.price - a.price || a.name.localeCompare(b.name)
        : a.level - b.level ||
          a.price - b.price ||
          a.name.localeCompare(b.name),
  );
}
