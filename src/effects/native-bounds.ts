import type { AnimationDef } from "../entities/types";
/** One registration plane for all front/back layers; never center them separately. */
export function nativeEffectBounds(animations: AnimationDef[]): [number, number, number, number] {
  const bounds = animations.flatMap(animation => {
    if (animation.sourceBounds?.length === 4 && animation.sourceBounds.every(Number.isFinite))
      return [animation.sourceBounds.map(value => value / 20)];
    return (animation.frameOrigins || [animation.origin]).map((origin, index) => {
      const [width, height] = animation.frameSizes?.[index] || [animation.frameWidth, animation.frameHeight];
      return [-origin[0] * width, -origin[1] * height, (1 - origin[0]) * width, (1 - origin[1]) * height];
    });
  });
  return bounds.length ? [Math.min(...bounds.map(b => b[0])), Math.min(...bounds.map(b => b[1])), Math.max(...bounds.map(b => b[2])), Math.max(...bounds.map(b => b[3]))] : [0, 0, 1, 1];
}
