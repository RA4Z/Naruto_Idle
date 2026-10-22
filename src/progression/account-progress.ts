import type { Save } from "../model";
import {
  activeCharacterId,
  FUTURE_CHARACTERS,
  needed,
} from "./character-progress";

/** Account and character levels intentionally share the exact same XP curve. */
export const accountNeeded = needed;

/** Seed missing accounts from the furthest owned ninja, once. Historical total
 * XP was never recorded; summing per-level history would be unbounded work.
 * The retired Sasuke record may mirror the replacement and is ignored.
 */
export function ensureAccountProgress(s: Save) {
  if (s.accountLevel !== undefined && s.accountXp !== undefined) return;
  let best = { level: 1, xp: 0 };
  const active = activeCharacterId(s);
  for (const id of new Set([...(s.collection || []), active])) {
    if (FUTURE_CHARACTERS.has(id)) continue;
    const p = id === active ? s : s.characterProgress?.[id];
    if (
      p &&
      (p.level > best.level || (p.level === best.level && p.xp > best.xp))
    )
      best = { level: p.level, xp: p.xp };
  }
  s.accountLevel = best.level;
  s.accountXp = 0;
  addAccountXp(s, best.xp);
}

export function addAccountXp(s: Save, xp: number) {
  ensureAccountProgress(s);
  if (!Number.isSafeInteger(Math.floor(xp)) || xp <= 0) return;
  s.accountXp! += Math.floor(xp);
  while (s.accountXp! >= needed(s.accountLevel!)) {
    s.accountXp! -= needed(s.accountLevel!);
    s.accountLevel!++;
  }
}

export function validAccountProgress(s: Save) {
  if (s.accountLevel === undefined && s.accountXp === undefined) return true;
  return (
    Number.isSafeInteger(s.accountLevel) &&
    s.accountLevel! >= 1 &&
    Number.isSafeInteger(s.accountXp) &&
    s.accountXp! >= 0 &&
    s.accountXp! < needed(s.accountLevel!)
  );
}
