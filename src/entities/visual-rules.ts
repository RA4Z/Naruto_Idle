import type { ActorMode } from "./types";

// The side-facing battle artwork for these quadrupeds is wider than their
// equivalent world poses. Match its body size without changing other actors.
const battleSize: Record<string, number> = {
  "19000301": 0.75,
  "19000701": 0.75,
  "19000401": 0.7,
};

export function actorVisualScale(id: string, mode: ActorMode, referenceHeight: number, rigScale = 1) {
  return 45 / Math.max(1, referenceHeight) / rigScale * (mode === "battle" ? (battleSize[id] ?? 1) : 1);
}

export function shouldReturnToBattleIdle(key: string | undefined, playing: boolean) {
  return !playing && !!key && key.includes(":battle:") && !key.endsWith(":C_dead");
}

export function resetWorldMirror(mode: ActorMode, previousKey: string | undefined) {
  return mode === "world" && !!previousKey && previousKey.includes(":battle:");
}

export function deathFadeDelay(frames: number, fps: number) {
  return fps > 0 && frames > 0 ? Math.max(0, frames * 1000 / fps * 0.75 - 250) : 0;
}
