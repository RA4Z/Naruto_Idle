import type Phaser from "phaser";
import type { AnimationDef } from "../entities/types";
import { animationOrigin } from "../entities/animation-origin";
import { effectFrameForBody } from "./native-clock";

export type NativeSkillBinding = {
  modelId: string;
  action: string;
  effectId: string;
  startFrame: number;
  bodyFps: number;
  animation: AnimationDef;
  attachment: "native-ground-origin";
};
export const nativeEffectKey = (binding: NativeSkillBinding) => "native-skill:" + binding.effectId;

/** Effects with a proven common origin only. No timer or invented projectile travel. */
export class NativeEffectPlayer {
  private current?: { body: Phaser.GameObjects.Sprite; sprite: Phaser.GameObjects.Sprite; key: string; binding: NativeSkillBinding };
  private played = 0;
  constructor(private scene: Phaser.Scene) {
    scene.events.on("postupdate", this.update, this);
  }
  play(body: Phaser.GameObjects.Sprite, binding: NativeSkillBinding) {
    this.clear();
    const key = body.anims.currentAnim?.key;
    if (!key || !key.endsWith("-" + binding.action) || !this.scene.textures.exists(nativeEffectKey(binding))) return false;
    const sprite = this.scene.add.sprite(body.x, body.y, nativeEffectKey(binding), "0");
    this.current = { body, sprite, key, binding }; this.played++; this.update(); return true;
  }
  private update = () => {
    const current = this.current;
    if (!current) return;
    const { body, sprite, key, binding } = current;
    if (!body.active || body.visible === false || body.anims.currentAnim?.key !== key || (!body.anims.isPlaying && !body.anims.isPaused)) { this.clear(); return; }
    const frame = effectFrameForBody((body.anims.currentFrame?.index || 1) - 1, binding.bodyFps, binding.startFrame, binding.animation.fps, binding.animation.timeline?.length || binding.animation.frames);
    sprite.setVisible(frame !== undefined);
    if (frame === undefined) return;
    const unique = binding.animation.timeline?.[frame] ?? frame;
    sprite.setFrame(String(unique)); sprite.setOrigin(...animationOrigin(binding.animation, unique, body.flipX));
    // A pose's crop must never change the character/effect scale ratio.
    const pixelScale = binding.animation.sourcePixelScale || 1;
    sprite.setPosition(body.x, body.y).setScale(body.scaleX / pixelScale, body.scaleY / pixelScale).setFlipX(body.flipX).setDepth(body.depth + .1).setAlpha(body.alpha ?? 1);
  };
  clear() { this.current?.sprite.destroy(); this.current = undefined; }
  snapshot() { return { active: this.current ? 1 : 0, played: this.played, frame: this.current?.sprite.frame.name }; }
  dispose() { this.clear(); this.scene.events.off("postupdate", this.update, this); }
}
