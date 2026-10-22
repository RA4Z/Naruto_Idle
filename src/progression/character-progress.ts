import { t } from "../i18n/core.ts";
import type { Save } from "../model";
import type { CharacterId } from "../config/characters";
import type { CombatLoadout } from "./combat-stats";
export const CHARACTER_IDS: Record<CharacterId, string> = {
  naruto: "11000101",
  sasuke: "11000211",
  sakura: "11000301",
};
export type CharacterProgress = CombatLoadout & {
  xp: number;
};
export const newCharacterProgress = (): CharacterProgress => ({
  level: 1,
  xp: 0,
  upgrades: 0,
  equipment: {},
});
export const needed = (level: number) => Math.floor(80 * Math.pow(level, 1.35));
export const FUTURE_CHARACTERS = new Set(["11000201"]);
export const activeCharacterId = (s: Save) =>
  s.activeEntityId || CHARACTER_IDS[s.character];
export const starterCharacter = (s: Save) =>
  (Object.keys(CHARACTER_IDS) as CharacterId[]).find(
    (key) => CHARACTER_IDS[key] === activeCharacterId(s),
  );
export function selectCharacter(s: Save, id: string) {
  if (!s.collection?.includes(id) || FUTURE_CHARACTERS.has(id))
    throw new Error(t("progression.character-progress.ffc1895c38"));
  syncCharacterProgress(s);
  const p = characterProgress(s, id);
  s.activeEntityId = id;
  s.character =
    (Object.keys(CHARACTER_IDS) as CharacterId[]).find(
      (key) => CHARACTER_IDS[key] === id,
    ) || "naruto";
  s.level = p.level;
  s.xp = p.xp;
  s.upgrades = p.upgrades;
  s.equipment = { ...p.equipment };
  s.partyIds = [];
  delete s.companionId;
}
// The legacy fields remain the active protagonist's projection for existing game systems.
// Never copy them into a different member's record during migration or recruitment.
export function syncCharacterProgress(s: Save) {
  s.characterProgress ??= {};
  s.collection = [
    ...new Set([
      ...(s.collection || Object.values(CHARACTER_IDS)),
      activeCharacterId(s),
    ]),
  ];
  for (const id of s.collection)
    s.characterProgress[id] ??= newCharacterProgress();
  s.characterProgress[activeCharacterId(s)] = {
    level: s.level,
    xp: s.xp,
    upgrades: s.upgrades,
    equipment: { ...s.equipment },
  };
}
export function characterProgress(
  s: Save,
  id = activeCharacterId(s),
): CharacterProgress {
  // Avoid rewriting the roster in the per-frame combat/movement path.
  if (!s.characterProgress?.[id]) syncCharacterProgress(s);
  if (!s.collection?.includes(id))
    throw new Error(t("progression.character-progress.47b7ee984e"));
  if (id === activeCharacterId(s)) {
    const p = s.characterProgress![id];
    p.level = s.level;
    p.xp = s.xp;
    p.upgrades = s.upgrades;
    p.equipment = s.equipment || {};
  }
  return s.characterProgress![id];
}
export function addCharacterXp(s: Save, xp: number, id = activeCharacterId(s)) {
  const p = characterProgress(s, id);
  if (!Number.isSafeInteger(Math.floor(xp)) || xp <= 0) return;
  p.xp += Math.floor(xp);
  while (p.xp >= needed(p.level)) {
    p.xp -= needed(p.level);
    p.level++;
  }
  if (id === activeCharacterId(s)) {
    s.level = p.level;
    s.xp = p.xp;
  }
}
export function trainCharacter(s: Save, id = activeCharacterId(s)) {
  const p = characterProgress(s, id);
  if (p.upgrades >= 10000)
    throw new Error(t("progression.character-progress.a597630b25"));
  if (s.coins < 25)
    throw new Error(t("progression.character-progress.2becb8cdaa"));
  s.coins -= 25;
  p.upgrades++;
  if (id === activeCharacterId(s)) s.upgrades = p.upgrades;
}
export function characterLoadout(
  s: Save,
  character: CharacterId,
): CombatLoadout {
  if (
    !s.collection?.includes(CHARACTER_IDS[character]) &&
    character !== s.character
  )
    return { level: 1, upgrades: 0, equipment: {} };
  const p = characterProgress(s, CHARACTER_IDS[character]);
  return {
    level: p.level,
    upgrades: p.upgrades,
    equipment: { ...p.equipment },
  };
}
