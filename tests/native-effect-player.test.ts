import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { NativeEffectPlayer, type NativeSkillBinding } from "../src/effects/native-player";

function fixture() {
  const events = new EventEmitter();
  const binding: NativeSkillBinding = { modelId:"11000101", action:"SP_skill1", effectId:"2015", startFrame:1, bodyFps:24, attachment:"native-ground-origin", animation:{url:"/effect.png",packedAtlasUrl:"/atlas.json",frames:2,timeline:[0,0,1],fps:24,frameWidth:30,frameHeight:40,origin:[0,1],frameOrigins:[[0,1],[-2,3]],status:"ready"} };
  const effect = {
    frame:{name:"0"}, active:true, visible:true, x:0,y:0,scaleX:1,scaleY:1,flipX:false,depth:0,origin:[0,0],alpha:1,
    setVisible(v:boolean){this.visible=v;return this;}, setFrame(f:string){this.frame.name=f;return this;},
    setOrigin(x:number,y:number){this.origin=[x,y];return this;}, setPosition(x:number,y:number){this.x=x;this.y=y;return this;},
    setScale(x:number,y:number){this.scaleX=x;this.scaleY=y;return this;}, setFlipX(v:boolean){this.flipX=v;return this;}, setDepth(d:number){this.depth=d;return this;}, setAlpha(a:number){this.alpha=a;return this;}, destroy(){this.active=false;},
  };
  const scene = {events,textures:{exists:()=>true},add:{sprite:()=>effect}};
  const body = {active:true,x:101,y:77,scaleX:.4,scaleY:.4,flipX:true,depth:500,anims:{currentAnim:{key:"battle-SP_skill1"},currentFrame:{index:1},isPlaying:true,isPaused:false}};
  const player = new NativeEffectPlayer(scene as never);
  return {events,binding,effect,body,player};
}
test("effect follows original body timeline and frame origins, not repeated texture names or an independent timer",()=>{
  const f=fixture(); assert.equal(f.player.play(f.body as never,f.binding),true); assert.equal(f.effect.visible,false);
  f.body.anims.currentFrame.index=4; f.events.emit("postupdate");
  assert.equal(f.effect.frame.name,"1");assert.deepEqual(f.effect.origin,[3,3]);
  assert.equal(f.effect.x,101);assert.equal(f.effect.y,77);assert.equal(f.effect.scaleX,.4);assert.equal(f.effect.flipX,true);assert.equal(f.effect.depth,500.1);
  f.body.x=133;f.events.emit("postupdate");assert.equal(f.effect.x,133);
  f.player.dispose();assert.equal(f.events.listenerCount("postupdate"),0);
});
test("pause retains the effect and interrupted animation clears it without leaving a sprite",()=>{
  const f=fixture();f.player.play(f.body as never,f.binding);f.body.anims.isPlaying=false;f.body.anims.isPaused=true;f.events.emit("postupdate");assert.equal(f.player.snapshot().active,1);
  f.body.anims.currentAnim.key="world-idle_0";f.events.emit("postupdate");assert.equal(f.player.snapshot().active,0);assert.equal(f.effect.active,false);f.player.dispose();
});
test("completed or destroyed bodies cannot leave an active native effect",()=>{
  const f=fixture();f.player.play(f.body as never,f.binding);f.body.active=false;f.events.emit("postupdate");assert.equal(f.player.snapshot().active,0);f.player.dispose();
});
