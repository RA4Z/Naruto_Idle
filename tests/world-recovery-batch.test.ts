import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {NativeNavigation} from "../src/world/navigation";
import {fresh,restore} from "../src/model";
const maps=JSON.parse(readFileSync("public/assets/maps/index.json","utf8")).maps;
test("recovered forest and Tenchi retain source identity, connected native paths, spawn and save compatibility",()=>{
 for(const [id,sceneId] of [["30008","1008001"],["300131","2015006"]]){
  const map=maps.find((m:any)=>m.id===id);
  assert.equal(map.sourceScene.id,sceneId);
  const grid=JSON.parse(readFileSync("public"+map.navigation,"utf8"));
  const nav=new NativeNavigation(grid);assert.ok(grid.cells.length>500);assert.ok(nav.walkable(map.spawn));
  for(const point of nav.pointsWithin(map.spawn,80)){
   if(Math.hypot(point.x-map.spawn.x,point.y-map.spawn.y)<=0.1)continue;
   const route=nav.path(map.spawn,point);
   assert.ok(route.length>0);
   assert.ok(route.every((p:any)=>nav.walkable(p)&&p.x>=0&&p.y>=0&&p.x<map.width&&p.y<map.height));
  }
  const save=fresh("naruto",1000);save.location=id;save.visitedMaps=["10001",id];
  save.worldPosition={mapId:id,...map.spawn};
  const loaded=restore({read:()=>JSON.stringify(save),write:()=>{}},1000)!;
  assert.equal(loaded.save.location,id);assert.deepEqual(loaded.save.worldPosition,save.worldPosition);
  assert.equal(loaded.save.partyIds?.length||0,0);
 }
});
