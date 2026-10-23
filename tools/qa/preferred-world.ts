import Phaser from 'phaser';
import { EntityActor, queueActor, registerActor } from '../../src/entities/actor';
import type { EntityManifest } from '../../src/entities/types';
const rows: { id:string; before:EntityManifest; after:EntityManifest }[] = await fetch('./preferred-world-data.json').then(r=>r.json());
const status=document.querySelector<HTMLOutputElement>('#status')!,frame=document.querySelector<HTMLInputElement>('#frame')!,direction=document.querySelector<HTMLSelectElement>('#direction')!,pause=document.querySelector<HTMLButtonElement>('#pause')!;
class Preview extends Phaser.Scene {
  private actors:EntityActor[]=[];
  private paused=false;
  preload(){ for(const row of rows)for(const manifest of [row.before,row.after])queueActor(this,manifest,'companion'); }
  create(){
    const zoom=2.2;this.cameras.main.setZoom(zoom).centerOn(450/zoom,300/zoom);
    rows.forEach((row,index)=>{
      const y=65+index*85;
      this.add.line(0,0,30,y+4,380,y+4,0x829572,.2).setOrigin(0);
      for(const [column,manifest] of [row.before,row.after].entries()){
        registerActor(this,manifest,'companion');
        const actor=new EntityActor(this,100+column*205,y,manifest,'companion');actor.play('world','run_0',true);this.actors.push(actor);
      }
    });
    pause.disabled=frame.disabled=false;
    pause.onclick=()=>{this.paused=!this.paused;pause.textContent=this.paused?'Continuar':'Pausar';};
    frame.oninput=()=>{this.paused=true;pause.textContent='Continuar';for(const actor of this.actors){const anim=actor.visual.anims.currentAnim!;actor.visual.anims.setCurrentFrame(anim.frames[Number(frame.value)]);actor.tick(true);}};
    direction.onchange=()=>{for(const actor of this.actors)actor.play('world','run_'+direction.value,true);};
  }
  update(){
    for(const actor of this.actors)actor.tick(this.paused);
    if(!this.actors.length)return;
    const sourceFrame=this.actors[0].visual.anims.currentFrame!.index-1;frame.value=String(sourceFrame);
    status.textContent=JSON.stringify({renderer:this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas',actors:this.actors.length,direction:direction.value,sourceFrame,paused:this.paused,textureFrames:this.actors.map(a=>a.visual.frame.name),uniqueBefore:rows[0].before.modes.world!.animations['run_'+direction.value].frames,uniqueAfter:rows[0].after.modes.world!.animations['run_'+direction.value].frames,sourceTimelineFrames:20,realAccountChanged:false});
  }
}
new Phaser.Game({type:Phaser.AUTO,parent:'stage',width:900,height:600,backgroundColor:'#153329',scene:Preview,audio:{noAudio:true}});
