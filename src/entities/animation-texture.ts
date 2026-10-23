import type Phaser from "phaser";
import type { AnimationDef } from "./types";

export function queueAnimation(scene: Phaser.Scene, key: string, animation: AnimationDef) {
  if (animation.multiAtlas && animation.packedAtlasUrl)
    scene.load.multiatlas(key, animation.packedAtlasUrl, animation.url.slice(0, animation.url.lastIndexOf("/") + 1));
  else if (animation.packedAtlasUrl)
    scene.load.atlas(key, animation.url, animation.packedAtlasUrl);
  else scene.load.spritesheet(key, animation.url, {
    frameWidth: animation.frameWidth,
    frameHeight: animation.frameHeight,
    endFrame: animation.frames - 1,
  });
}

export function animationFrames(key: string, animation: AnimationDef) {
  return (animation.timeline || Array.from({ length: animation.frames }, (_, i) => i))
    .map(frame => ({ key, frame: animation.packedAtlasUrl ? String(frame) : frame }));
}

export type FrameRectangle = { x: number; y: number; w: number; h: number };
export type PackedAtlas = { frames: Record<string, { frame: FrameRectangle }> };

export function frameRectangle(animation: AnimationDef, frame: number, imageWidth: number, atlas?: PackedAtlas): FrameRectangle {
  if (animation.packedAtlasUrl) {
    const rect = atlas?.frames[String(frame)]?.frame;
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0)
      throw new Error("Packed animation frame unavailable");
    return rect;
  }
  const columns = Math.floor(imageWidth / animation.frameWidth);
  if (columns < 1) throw new Error("Invalid animation sheet width");
  return { x: frame % columns * animation.frameWidth, y: Math.floor(frame / columns) * animation.frameHeight, w: animation.frameWidth, h: animation.frameHeight };
}
