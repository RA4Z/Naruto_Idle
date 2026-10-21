import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NativeNavigation } from "../src/world/navigation";
import { fresh, restore } from "../src/model";
const maps = JSON.parse(readFileSync("public/assets/maps/index.json","utf8")).maps;
test("Valley, canyon and five-seal worlds preserve native identity, empty layers, routes and saves",()=>{
 for(const [id, scene, empty] of [["10012","2014001",false],["10013","2014002",true],["10016","2006001",true],["10021","2013001",false]] as const){
  const map=maps.find((m:any)=>m.id===id),nav=new NativeNavigation(JSON.parse(readFileSync("public"+map.navigation,"utf8")));
  assert.equal(map.sourceScene.id,scene);assert.ok(nav.walkable(map.spawn));assert.equal(map.layers.nativeForeground.emptyNativeLayer,empty);
  if(empty){assert.equal(map.layers.foregroundTiles,0);assert.equal(map.layers.nativeForeground.nontransparentPixels,0);}
  for(const point of nav.pointsWithin(map.spawn,150)){
   if(Math.hypot(point.x-map.spawn.x,point.y-map.spawn.y)<.1)continue;
   const path=nav.path(map.spawn,point);assert.ok(path.length>0);
   assert.ok(path.every(p=>nav.walkable(p)&&p.x>=0&&p.y>=0&&p.x<map.width&&p.y<map.height));
  }
  const save=fresh("naruto",1000);save.location=id;save.visitedMaps=maps.map((m:any)=>m.id);save.worldPosition={mapId:id,...map.spawn};
  const restored=restore({read:()=>JSON.stringify(save),write:()=>{}},1000);
  assert.ok(restored);assert.equal(restored.save.location,id);assert.deepEqual(restored.save.worldPosition,save.worldPosition);
 }
});
