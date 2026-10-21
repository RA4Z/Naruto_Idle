import type Phaser from "phaser";
import type { Point } from "./navigation";
export class RouteOverlay {
  private graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(2);
  }
  update(hero: Point, path: Point[], target: Point | undefined, auto: boolean) {
    const g = this.graphics;
    g.clear();
    const color = auto ? 0x72e5ef : 0xffdc8b;
    if (path.length) {
      g.lineStyle(1.5, color, 0.65);
      g.beginPath();
      g.moveTo(hero.x, hero.y);
      for (const point of path) g.lineTo(point.x, point.y);
      g.strokePath();
      const end = path.at(-1)!;
      g.lineStyle(1, color, 0.9).strokeEllipse(end.x, end.y, 12, 6);
    }
    if (target)
      g.lineStyle(1.8, 0x72e5ef, 1).strokeEllipse(target.x, target.y, 34, 13);
  }
}
