import type { Save } from "../model";
import type { CharacterId } from "../config/characters";
import type { CombatLoadout } from "./combat-stats";

export const CHARACTER_IDS: Record<CharacterId, string> = {
  naruto: "11000101", sasuke: "11000201", sakura: "11000301",
};
export type CharacterProgress = CombatLoadout & { xp: number };
export const newCharacterProgress = (): CharacterProgress => ({
  level: 1, xp: 0, upgrades: 0, equipment: {},
});
export const needed = (level: number) => Math.floor(80 * Math.pow(level, 1.35));
export const activeCharacterId = (s: Save) => CHARACTER_IDS[s.character];

// The legacy fields remain the active protagonist's projection for existing game systems.
// Never copy them into a different member's record during migration or recruitment.
export function syncCharacterProgress(s: Save) {
  s.characterProgress ??= {};
  s.collection = [...new Set([...(s.collection || Object.values(CHARACTER_IDS)), activeCharacterId(s)])];
  for (const id of s.collection)
    s.characterProgress[id] ??= newCharacterProgress();
  s.characterProgress[activeCharacterId(s)] = {
    level: s.level, xp: s.xp, upgrades: s.upgrades, equipment: { ...s.equipment },
  };
}
export function characterProgress(s: Save, id = activeCharacterId(s)): CharacterProgress {
  // Avoid rewriting the roster in the per-frame combat/movement path.
  if (!s.characterProgress?.[id]) syncCharacterProgress(s);
  if (!s.collection?.includes(id)) throw new Error("Personagem fora da sua coleção.");
  if (id === activeCharacterId(s)) {
    const p = s.characterProgress![id];
    p.level = s.level; p.xp = s.xp; p.upgrades = s.upgrades;
    p.equipment = s.equipment || {};
  }
  return s.characterProgress![id];
}
export function addCharacterXp(s: Save, xp: number, id = activeCharacterId(s)) {
  const p = characterProgress(s, id);
  if (!Number.isFinite(xp) || xp <= 0 || p.level >= 100) return;
  p.xp += Math.floor(xp);
  while (p.level < 100 && p.xp >= needed(p.level)) {
    p.xp -= needed(p.level);
    p.level++;
  }
  if (p.level === 100) p.xp = 0;
  if (id === activeCharacterId(s)) { s.level = p.level; s.xp = p.xp; }
}
export function awardPartyXp(s: Save, xp: number) {
  const ids = new Set([activeCharacterId(s), ...(s.partyIds || [])]);
  for (const id of ids)
    if (s.collection?.includes(id) || id === activeCharacterId(s)) addCharacterXp(s, xp, id);
}
export function trainCharacter(s: Save, id = activeCharacterId(s)) {
  const p = characterProgress(s, id);
  if (p.upgrades >= 10000) throw new Error("Limite de treinos atingido.");
  if (s.coins < 25) throw new Error("Você precisa de 25 moedas para treinar.");
  s.coins -= 25;
  p.upgrades++;
  if (id === activeCharacterId(s)) s.upgrades = p.upgrades;
}
export function characterLoadout(s: Save, character: CharacterId): CombatLoadout {
  if (!s.collection?.includes(CHARACTER_IDS[character]) && character !== s.character)
    return { level: 1, upgrades: 0, equipment: {} };
  const p = characterProgress(s, CHARACTER_IDS[character]);
  return { level: p.level, upgrades: p.upgrades, equipment: { ...p.equipment } };
}
