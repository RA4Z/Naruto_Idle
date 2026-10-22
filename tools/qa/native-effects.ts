import { nativeEffectBounds } from "../../src/effects/native-bounds";
import { NativeEffectPlayer, nativeEffectKey, type NativeSkillBinding } from "../../src/effects/native-player";
import Phaser from "phaser";
import { queueAnimation, animationFrames } from "../../src/entities/animation-texture";
import { animationOrigin } from "../../src/entities/animation-origin";
import { effectFrameForBody } from "../../src/effects/native-clock";
import { mountNativeEffectReview } from "../../src/effects/native-review";
import type { AnimationDef, EntityManifest } from "../../src/entities/types";

const select = document.querySelector<HTMLSelectElement>("#effect")!, state = document.querySelector<HTMLOutputElement>("#state")!, stage = document.querySelector<HTMLElement>("#stage")!;
const index = await (await fetch("/assets/effects/native/index.json")).json();
const entries = Object.values(index.effects) as any[];
for (const entry of entries) select.append(new Option(`${entry.id} · ${entry.definition.res.split("/").pop()}`, entry.id));
const requested = new URLSearchParams(location.search).get("effect");
if (requested && entries.some(e => e.id === requested)) select.value = requested;
let game: Phaser.Game | undefined, dispose: (() => void) | undefined;
async function load() {
  select.disabled = true;
  state.textContent = "Carregando";
  for (const id of ["pause","mirror","frame"]) document.getElementById(id)!.hidden = true;
  dispose?.(); dispose = undefined;
  if (game) {
    const previous = game; game = undefined;
    await new Promise<void>(resolve => { previous.events.once(Phaser.Core.Events.DESTROY, resolve); previous.destroy(true); previous.loop.wake(); });
  }
  stage.replaceChildren();
  const entry = entries.find(e => e.id === select.value)!;
  if (new URLSearchParams(location.search).has("review")) {
    dispose = mountNativeEffectReview(stage, entry); select.disabled = false; state.textContent = "Visualizador usado pelo admin · somente leitura"; return;
  }
  const binding = entry.bindings.find((b: any) => b.startFrames.length);
  const manifest: EntityManifest | undefined = binding ? await (await fetch(binding.manifestUrl)).json() : undefined;
  const body = manifest?.modes.battle?.animations[binding?.action];
  const effect: AnimationDef = entry.layers[0].animation;
  const nativeBinding: NativeSkillBinding = { modelId:binding?.modelId || "", action:binding?.action || "",effectId:entry.id,animation:effect,bodyFps:body?.fps || 24,startFrame:binding?.startFrames[0] || 0,attachment:"native-ground-origin" };
  const effectKey = nativeEffectKey(nativeBinding), bodyKey = "battle-" + binding?.action;
  const overlay = new URLSearchParams(location.search).has("overlay") && entry.id === "2015" && body;

  class Preview extends Phaser.Scene {
    private effectSprite!: Phaser.GameObjects.Sprite;
    private actor?: Phaser.GameObjects.Sprite;
    private native?: NativeEffectPlayer;
    private layers: {sprite:Phaser.GameObjects.Sprite; animation:AnimationDef;plane:string}[] = [];
    preload() {
      entry.layers.forEach((layer:any,i:number)=>queueAnimation(this,i ? effectKey+":"+i : effectKey,layer.animation));
      if (body) queueAnimation(this, bodyKey, body);
      this.load.on("loaderror", (file: { key: string }) => { state.textContent = "Erro de carregamento: " + file.key; });
    }
    create() {
      this.add.text(20, 22, overlay ? "Rasengan · corpo e efeito sincronizados" : "Corpo · relógio original", {fontSize:"17px",color:"#e8d5a3"});
      if (!overlay) {
        this.add.text(385, 22, "Efeito · origem preservada", {fontSize:"17px",color:"#e8d5a3"});
        this.add.line(0,0,350,0,350,500,0x53665d).setOrigin(0);
      }
      this.layers = entry.layers.map((layer:any,i:number)=>({sprite:this.add.sprite(550,350,i ? effectKey+":"+i : effectKey,"0").setDepth(i),animation:layer.animation,plane:layer.plane}));
      this.effectSprite = this.layers[0].sprite;
      this.anims.create({ key:effectKey, frames:animationFrames(effectKey,effect), frameRate:effect.fps, repeat:-1 });
      if (body) {
        this.anims.create({key:bodyKey,frames:animationFrames(bodyKey,body),frameRate:body.fps,repeat:-1});
        this.actor = this.add.sprite(overlay ? 180 : 160,overlay ? 380 : 350,bodyKey).setScale(overlay ? .8 : .9).play(bodyKey);
      } else this.effectSprite.play(effectKey);
      if (overlay && this.actor) {
        for (const id of ["pause","mirror","frame"]) document.getElementById(id)!.hidden = false;
        this.effectSprite.destroy(); this.native = new NativeEffectPlayer(this); this.native.play(this.actor,nativeBinding);
        const pause = document.querySelector<HTMLButtonElement>("#pause")!, mirror = document.querySelector<HTMLButtonElement>("#mirror")!, seek = document.querySelector<HTMLInputElement>("#frame")!;
        seek.max = String(this.anims.get(bodyKey).frames.length - 1);
        pause.onclick = () => { if (this.actor!.anims.isPaused) this.actor!.anims.resume(); else this.actor!.anims.pause(); };
        mirror.onclick = () => { this.actor!.setFlipX(!this.actor!.flipX); this.actor!.x = this.actor!.flipX ? 800 : 180; };
        seek.oninput = () => { this.actor!.anims.pause(); this.actor!.anims.setCurrentFrame(this.anims.get(bodyKey).frames[Number(seek.value)]); };
        this.events.on("postupdate",()=> {
          state.textContent = JSON.stringify({effect:entry.id,renderer:this.game.renderer.type===Phaser.WEBGL?"WebGL":"Canvas",bodyFrame:(this.actor!.anims.currentFrame?.index || 1)-1,productionPlayer:this.native?.snapshot(),nativeFrames:body!.timeline?.length,attachment:"native-ground-origin",sourceFps:effect.fps,paused:this.actor!.anims.isPaused,mirrored:this.actor!.flipX});
        });
        this.events.once("shutdown",()=>{this.native?.dispose();pause.onclick=null;mirror.onclick=null;seek.oninput=null;});
      }
      select.disabled = false;
    }
    update() {
      if (!this.effectSprite) return;
      if (overlay && this.actor && body) {
        this.actor.setOrigin(...animationOrigin(body,this.actor.frame.name,this.actor.flipX));
        return;
      }
      if (body && this.actor) this.actor.setOrigin(...animationOrigin(body,this.actor.frame.name,this.actor.flipX));
      const [left,top,right,bottom] = nativeEffectBounds(this.layers.map(layer=>layer.animation));
      const scale = Math.min(1,570/Math.max(1,right-left),400/Math.max(1,bottom-top));
      for (const layer of this.layers) {
        const nativeFrame = body && this.actor
          ? effectFrameForBody((this.actor.anims.currentFrame?.index || 1)-1,body.fps,binding.startFrames[0],layer.animation.fps,layer.animation.timeline?.length || layer.animation.frames)
          : effectFrameForBody((this.effectSprite.anims.currentFrame?.index || 1)-1,effect.fps,0,layer.animation.fps,layer.animation.timeline?.length || layer.animation.frames);
        layer.sprite.setVisible(nativeFrame !== undefined);
        if(nativeFrame !== undefined) layer.sprite.setFrame(String(layer.animation.timeline?.[nativeFrame] ?? nativeFrame));
        layer.sprite.setOrigin(...animationOrigin(layer.animation,layer.sprite.frame.name));
        layer.sprite.setPosition(385-left*scale,70-top*scale).setScale(scale);
      }
      state.textContent = JSON.stringify({effect:entry.id,renderer:this.game.renderer.type===Phaser.WEBGL?"WebGL":"Canvas",bodyFrame:(this.actor?.anims.currentFrame?.index || 1)-1,textureFrame:this.effectSprite.frame.name,sourceFps:effect.fps,visible:this.effectSprite.visible,layers:this.layers.map(layer=>({plane:layer.plane,visible:layer.sprite.visible,frame:layer.sprite.frame.name})),sharedPlane:true,attachment:"under-review",textures:this.textures.getTextureKeys().length});
    }
  }
  game = new Phaser.Game({type:new URLSearchParams(location.search).has("canvas")?Phaser.CANVAS:Phaser.WEBGL,parent:stage,width:1000,height:500,backgroundColor:"#14252d",scene:Preview,audio:{noAudio:true},render:{antialias:true}});
}
select.onchange = () => void load().catch(error => { state.textContent=String(error);select.disabled=false; });
await load();
