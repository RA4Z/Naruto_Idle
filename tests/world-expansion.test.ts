import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IMPLEMENTED_MAP_IDS } from "../src/config/maps.ts";
import { fresh,restore } from "../src/model.ts";
import { NativeNavigation } from "../src/world/navigation.ts";
const maps=JSON.parse(readFileSync("public/assets/maps/index.json","utf8")).maps;
test("save map registry stays aligned with integrated destinations and supports reloading the new maps",()=>{
 assert.deepEqual([...IMPLEMENTED_MAP_IDS].sort(),maps.map(m=>m.id).sort());
 for(const id of ["10007","10009"]){
  const save=fresh("naruto",1000);save.location=id;save.visitedMaps=["10001",id];save.autoHunt=false;
  const map=maps.find(m=>m.id===id);save.worldPosition={mapId:id,...map.spawn};
  const result=restore({read:()=>JSON.stringify(save),write:()=>{}},1000);
  assert.ok(result);assert.equal(result.save.location,id);assert.ok(result.save.visitedMaps!.includes(id));
 }
});
test("new worlds have real source identities, valid native spawns and usable enemy populations",()=>{
 for(const id of ["10007","10009"]){
  const map=maps.find(m=>m.id===id),grid=JSON.parse(readFileSync("public"+map.navigation,"utf8"));
  const nav=new NativeNavigation(grid);assert.ok(nav.walkable(map.spawn));
  assert.ok(map.spawn.x>=0&&map.spawn.y>=0&&map.spawn.x<map.width&&map.spawn.y<map.height);
  assert.equal(map.sourceScene.mapId,id);assert.ok(map.name.includes(id==="10007"?"Costa Verde":"Floresta da Morte"));
  assert.ok(map.enemies.length>=2);assert.ok(grid.cells.length>500);assert.ok(map.nativeAlpha);
  if(id==="10007")assert.equal(grid.sourceRegion,2);
  for(const enemy of map.enemies){
   const catalog=JSON.parse(readFileSync("public/assets/catalog/entities.json","utf8"));
   assert.ok(catalog.entities.find(e=>e.id===enemy)?.capabilities.enemy);
  }
 }
});
