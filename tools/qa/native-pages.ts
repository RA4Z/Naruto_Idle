import Phaser from "phaser";
import { queueAnimation, animationFrames } from "../../src/entities/animation-texture";
import { animationOrigin } from "../../src/entities/animation-origin";
import type { AnimationDef } from "../../src/entities/types";
const index=await(await fetch('/assets/effects/native/index.json')).json(), animation:AnimationDef=index.effects['2038'].layers[0].animation;
const status=document.querySelector<HTMLOutputElement>('#status')!,slider=document.querySelector<HTMLInputElement>('#frame')!;
class Preview extends Phaser.Scene{
 private sprite!:Phaser.GameObjects.Sprite;
 preload(){queueAnimation(this,'effect',animation);}
 create(){
  const [left,top,right,bottom]=animation.sourceBounds!.map(v=>v/20),scale=Math.min(1000/(right-left),420/(bottom-top));
  this.anims.create({key:'effect-play',frames:animationFrames('effect',animation),frameRate:animation.fps,repeat:-1});
  this.sprite=this.add.sprite(35-left*scale,30-top*scale,'effect').setScale(scale).play('effect-play');
  document.querySelector<HTMLButtonElement>('#pause')!.onclick=()=>{if(this.sprite.anims.isPaused)this.sprite.anims.resume();else this.sprite.anims.pause();};
  document.querySelector<HTMLButtonElement>('#mirror')!.onclick=()=>{this.sprite.setFlipX(!this.sprite.flipX);this.sprite.setX(35+(this.sprite.flipX?right:-left)*scale);};
  slider.max=String(animation.timeline!.length-1);slider.oninput=()=>{this.sprite.anims.pause();this.sprite.anims.setCurrentFrame(this.anims.get('effect-play').frames[Number(slider.value)]);};
  for(const id of ['pause','mirror','frame'])document.querySelector<HTMLButtonElement>('#'+id)!.disabled=false;
 }
 update(){if(!this.sprite)return;const unique=Number(this.sprite.frame.name),origin=animationOrigin(animation,unique,this.sprite.flipX);this.sprite.setOrigin(...origin);
  const sourceFrame=this.sprite.anims.currentFrame!.index-1;slider.value=String(sourceFrame);
  status.textContent=JSON.stringify({effect:'2038',renderer:this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas',pages:animation.atlasPageUrls!.length,loadedPages:this.textures.get('effect').source.length,sourceFrame,textureFrame:unique,page:animation.framePages![unique],paused:this.sprite.anims.isPaused,mirrored:this.sprite.flipX,sourcePixelScale:animation.sourcePixelScale});
 }
}
new Phaser.Game({type:Phaser.AUTO,parent:'stage',width:1100,height:500,backgroundColor:'#14252d',scene:Preview,audio:{noAudio:true}});
