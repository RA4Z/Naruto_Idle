import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {NativeNavigation} from "../src/world/navigation";
const maps=JSON.parse(readFileSync("public/assets/maps/index.json","utf8")).maps;
const catalog=JSON.parse(readFileSync("public/assets/catalog/entities.json","utf8")).entities;
test("four original worlds retain source scene IDs, arbitrary region IDs and traversable routes",()=>{
 for(const [id,sceneId,region] of [["10010","2009001",0],["10011","2007001",0],["10020","2008001",2],["10015","2011001",0]] as const){
  const map=maps.find((m:any)=>m.id===id);
  assert.equal(map.sourceScene.id,sceneId);
  const grid=JSON.parse(readFileSync("public"+map.navigation,"utf8"));
  assert.equal(grid.sourceRegion,region);assert.ok(grid.cells.length>1000);
  const nav=new NativeNavigation(grid);assert.ok(nav.walkable(map.spawn));
  for(let i=0;i<12;i++){
   const point=nav.points[(i*137+277)%nav.points.length];
   if(Math.hypot(point.x-map.spawn.x,point.y-map.spawn.y)<=0.1)continue;
   const path=nav.path(map.spawn,point);assert.ok(path.length,id+": reachable point "+i);
   let previous=map.spawn;
   for(const step of path){assert.ok(nav.clear(previous,step));previous=step;}
   assert.ok(Math.hypot(previous.x-point.x,previous.y-point.y)<0.01);
  }
  for(const id of map.enemies){const enemy=catalog.find((e:any)=>e.id===id);assert.ok(enemy.capabilities.enemy&&enemy.capabilities.companion);}
  assert.ok(map.nativeAlpha);assert.equal(map.populationPolicy.includes("authored"),true);
 }
});
