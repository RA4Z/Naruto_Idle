import type { Phase } from "../model";
/** Movement is independent from melee state, but never from defeat/recovery. */
export function canMoveInPhase(phase: Phase) {
  return [
    "explorando",
    "iniciando combate",
    "combatendo",
    "recompensas",
  ].includes(phase);
}
