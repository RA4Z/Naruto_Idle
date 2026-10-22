import Phaser from "phaser";
import { EnemyField } from "../../src/world/enemies";
import { queueActor, registerActor } from "../../src/entities/actor";
import { NativeNavigation } from "../../src/world/navigation";
import { withSceneGeometry } from "../../src/world/scene-geometry";
const catalog=await(await fetch("/assets/catalog/entities.json")).json(), maps=await(await fetch("/assets/maps/index.json")).json();
const map=maps.maps.find((m:any)=>m.id==="10005"), ref=catalog.entities.find((e:any)=>e.id===map.enemies[0]);
const manifest=await(await fetch(ref.manifestUrl)).json(),grid=await(await fetch(map.navigation)).json();
const nav=new NativeNavigation(withSceneGeometry(map.id,grid)), status=document.querySelector<HTMLOutputElement>("#status")!;
const entry=nav.nearest(map.spawn)!,far=nav.points.reduce((best,p)=>Math.hypot(p.x-entry.x,p.y-entry.y)>Math.hypot(best.x-entry.x,best.y-entry.y)?p:best,entry);
class Preview extends Phaser.Scene {
  private field!:EnemyField; private initial?:string; private markers:Phaser.GameObjects.GameObject[]=[];
  preload(){this.load.image("map",map.background);queueActor(this,manifest,"enemy");if(manifest.capabilities.companion)queueActor(this,manifest,"companion");}
  create(){
    this.add.image(0,0,"map").setOrigin(0).setDisplaySize(map.width,map.height).setDepth(-1000);
    registerActor(this,manifest,"enemy");if(manifest.capabilities.companion)registerActor(this,manifest,"companion");this.field=new EnemyField(this);
    document.querySelector<HTMLButtonElement>("#gate")!.onclick=()=>this.reconnect(entry,"portão");document.querySelector<HTMLButtonElement>("#far")!.onclick=()=>this.reconnect(far,"outro canto");
    for(const id of ["gate","far"])document.querySelector<HTMLButtonElement>("#"+id)!.disabled=false;
    this.reconnect(entry,"portão");
  }
  private reconnect(position:{x:number;y:number},where:string){
    this.field.reset(map.id,[manifest],map.spawn,nav,false);
    this.markers.forEach(marker=>marker.destroy());this.markers=[];
    for(const [index,mob] of this.field.members.entries()) {
      this.markers.push(this.add.circle(mob.home.x,mob.home.y,16,0xffce55,.35).setStrokeStyle(2,0xffdc73).setDepth(5000));
      this.markers.push(this.add.text(mob.home.x,mob.home.y-44,String(index+1),{fontSize:"20px",color:"#ffe7a0",stroke:"#18282d",strokeThickness:4}).setOrigin(.5).setDepth(5001));
    }
    this.markers.push(this.add.circle(position.x,position.y,12,0x3aebdf,.8).setStrokeStyle(3,0xd2ffff).setDepth(6000));
    const homes=this.field.members.map(m=>m.home),serialized=JSON.stringify(homes);this.initial??=serialized;
    status.textContent=JSON.stringify({retomada:where,posicaoSalva:position,inimigos:homes.length,mesmosSpawns:serialized===this.initial,origens:homes,contaRealAlterada:false});
  }
  update(){for(const mob of this.field?.members||[])mob.actor.tick(false);}
}
new Phaser.Game({type:Phaser.AUTO,parent:"stage",width:map.width,height:map.height,backgroundColor:"#102126",scene:Preview,audio:{noAudio:true}});
