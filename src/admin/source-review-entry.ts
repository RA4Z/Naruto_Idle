import type { AnimationDef } from "../entities/types";
import type { NativeEffectEntry } from "../effects/native-review";

export type SourceReviewItem = {
  id: string; source: string; action: string; kind: "battle" | "scene";
  status: "ready" | "sequence" | "invalid"; preview?: NativeEffectEntry;
};
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);
const safeUrl = (value: unknown) => typeof value === "string" && value.startsWith("/assets/effects/native/") && !/[\\?#]/.test(value) && !value.split("/").includes("..");

/** Source-only data never inherits a live skill binding or fallback body animation. */
export function sourceReviewItem(value: unknown): SourceReviewItem | undefined {
  if (!object(value) || value.sourceOnly !== true || typeof value.id !== "string" || !/^source:[a-f0-9]{16}:[a-f0-9]{12}$/.test(value.id)) return;
  if (!object(value.definition) || typeof value.definition.res !== "string" || typeof value.definition.frontAction !== "string") return;
  const kind = value.sourceKind === "scene-exported-sprite" ? "scene" : "battle";
  const row: SourceReviewItem = { id: value.id, source: value.definition.res, action: value.definition.frontAction, kind, status: "invalid" };
  if (value.sourceKind !== undefined && !["scene-exported-sprite", "battle-effect-exported-sprite"].includes(value.sourceKind)) return row;
  if (!row.source.startsWith(kind === "scene" ? "assets/role/npc/scene/npcres/" : "assets/battle/effect/")) return row;
  if (!Array.isArray(value.layers) || value.layers.length !== 1 || !object(value.layers[0]) || value.layers[0].action !== row.action) return row;
  const layer = value.layers[0];
  if (layer.sourceSequence) return { ...row, status: "sequence" };
  const a = layer.animation;
  if (!object(a) || a.sourcePixelScale !== 1 || !Number.isFinite(a.fps) || a.fps <= 0 || !Number.isInteger(a.frames) || a.frames < 1 || !Array.isArray(a.timeline) || !a.timeline.length || a.timeline.length > 480) return row;
  if (!a.timeline.every((index: unknown) => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < a.frames)) return row;
  if (![a.frameWidth, a.frameHeight].every(n => Number.isFinite(n) && n > 0) || !safeUrl(a.url) || !safeUrl(a.packedAtlasUrl)) return row;
  if (a.atlasPageUrls && (!Array.isArray(a.atlasPageUrls) || !a.atlasPageUrls.length || a.atlasPageUrls.length > 16 || !a.atlasPageUrls.every(safeUrl))) return row;
  const definition = Object.fromEntries(Object.entries(value.definition).filter(([, item]) => typeof item === "string")) as Record<string, string>;
  return { ...row, status: "ready", preview: { id: row.id, definition, bindings: [], layers: [{ action: row.action, plane: String(layer.plane || "front"), animation: a as AnimationDef }] } };
}
