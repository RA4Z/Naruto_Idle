import { t } from "../i18n/core.ts";
import type Phaser from "phaser";
import type { NativeForegroundLayer } from "./native-foreground";
import type { Point } from "./navigation";
// Used only through the DEV diagnostics API, never during ordinary gameplay.
export async function probeNativeForeground(
  scene: Phaser.Scene,
  layer: NativeForegroundLayer,
  hero: Phaser.GameObjects.Sprite,
  source: Point,
) {
  const foreground = layer.image;
  const camera = scene.cameras.main;
  const position = {
    x: foreground.x + source.x * foreground.scaleX,
    y: foreground.y + source.y * foreground.scaleY,
  };
  const texture = scene.textures.getPixel(
    source.x,
    source.y,
    foreground.texture.key,
  );
  const alpha = layer.alpha
    ? scene.textures.getPixel(source.x, source.y, layer.alpha.texture.key)
    : texture;
  if (!texture || !alpha)
    throw new Error(t("world.foreground-diagnostics.dc610a46e2"));
  const scroll = { x: camera.scrollX, y: camera.scrollY };
  camera.stopFollow();
  camera.centerOn(position.x, position.y);
  const marker = scene.add
    .rectangle(position.x, position.y, 16, 16, 0xff00ff)
    .setDepth(foreground.depth - 1);
  try {
    return await new Promise<{
      rendered: number[];
      native: number[];
    }>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error(t("world.foreground-diagnostics.cc0979a88e"))),
        5000,
      );
      scene.game.events.once("postrender", () => {
        const topLeft = camera.getWorldPoint(0, 0);
        scene.game.renderer.snapshotPixel(
          Math.round((position.x - topLeft.x) * camera.zoom),
          Math.round((position.y - topLeft.y) * camera.zoom),
          (value) => {
            window.clearTimeout(timer);
            if (!("red" in value))
              return reject(
                new Error(t("world.foreground-diagnostics.8d2c8bf45d")),
              );
            resolve({
              rendered: [value.red, value.green, value.blue, value.alpha],
              native: [texture.red, texture.green, texture.blue, alpha.alpha],
            });
          },
        );
      });
    });
  } finally {
    marker.destroy();
    camera.startFollow(hero, false, 0.09, 0.09);
    camera.setScroll(scroll.x, scroll.y);
  }
}
