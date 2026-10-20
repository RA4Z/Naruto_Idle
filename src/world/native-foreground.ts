import Phaser from "phaser";
import type { WorldMap } from "./maps";
import { foregroundPlan } from "./foreground-plan";

export class NativeForegroundLayer {
  readonly image: Phaser.GameObjects.Image;
  alpha?: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    this.image=scene.add.image(0,0,"__WHITE").setOrigin(0).setDepth(10000);
  }
  setMap(map: WorldMap) {
    this.image.clearMask(true);this.alpha?.destroy();this.alpha=undefined;
    const plan=foregroundPlan(map,this.scene.game.renderer.type===Phaser.WEBGL);
    this.image.setTexture(plan.colorTexture).setDisplaySize(map.width,map.height);
    if(plan.masked){
      this.alpha=this.scene.make.image({x:0,y:0,key:"map-"+map.id+"-foreground",add:false}).setOrigin(0).setScale(this.image.scaleX,this.image.scaleY);
      this.image.setMask(this.alpha.createBitmapMask());
    }
  }
  destroy(){this.image.clearMask(true);this.alpha?.destroy();this.alpha=undefined;this.image.destroy();}
}
