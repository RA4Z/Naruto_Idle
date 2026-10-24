import type Phaser from "phaser";
import type { EntityActor } from "../entities/actor";

// Copies the visible alpha silhouette behind the sprite. Works with WebGL and Canvas
// and follows packed atlas frames without changing the main actor's tint or animation.
export class PlayerHover {
  private outlines: Phaser.GameObjects.Sprite[] = [];
  private active = false;
  constructor(private actor: EntityActor) {
    actor.visual.setInteractive({
      pixelPerfect: true,
      alphaTolerance: 64,
      useHandCursor: true,
    });
    actor.visual.on("pointerover", () => this.set(true));
    actor.visual.on("pointerout", () => this.set(false));
    const leave = () => this.set(false);
    actor.scene.input.on("gameout", leave);
    actor.once("destroy", () => actor.scene.input.off("gameout", leave));
  }
  get visible() {
    return this.active;
  }
  set(active: boolean) {
    this.active = active;
    if (active && !this.outlines.length) {
      const v = this.actor.visual;
      this.outlines = Array.from({ length: 8 }, () =>
        this.actor.scene.add
          .sprite(0, 0, v.texture.key, v.frame.name)
          .setTintFill(0xffce70),
      );
      this.actor.addAt(this.outlines, 1);
    }
    this.update();
  }
  update() {
    if (this.active && document.querySelector("dialog[open]"))
      this.active = false;
    const v = this.actor.visual;
    const offsets = [
      [-0.7, 0],
      [0.7, 0],
      [0, -0.7],
      [0, 0.7],
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ];
    this.outlines.forEach((outline, i) => {
      outline.setVisible(this.active && v.visible);
      if (!this.active) return;
      outline
        .setTexture(v.texture.key, v.frame.name)
        .setOrigin(v.originX, v.originY)
        .setScale(v.scaleX, v.scaleY)
        .setFlip(v.flipX, v.flipY)
        .setRotation(v.rotation)
        .setPosition(v.x + offsets[i][0], v.y + offsets[i][1]);
    });
  }
}
