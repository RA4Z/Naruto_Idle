import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NativeNavigation } from "../src/world/navigation";
import { withSceneGeometry } from "../src/world/scene-geometry";
import { mapEnemyHomes } from "../src/world/spawn";

test("forest and existing hunt maps have distributed, unique, reachable homes", () => {
  const maps=JSON.parse(readFileSync(new URL("../public/assets/maps/index.json",import.meta.url),"utf8")).maps;
  for (const map of maps.filter((m:{kind:string})=>m.kind==="adventure")) {
    const grid=JSON.parse(readFileSync(new URL("../public"+map.navigation,import.meta.url),"utf8"));
    const nav=new NativeNavigation(withSceneGeometry(map.id,grid));
    const homes=mapEnemyHomes(map.id,nav,map.spawn);
    assert.equal(homes.length,6,map.id+": six existing spawn slots");
    assert.equal(new Set(homes.map(p=>`${p.x},${p.y}`)).size,homes.length);
    for(const point of homes) {
      assert.ok(nav.walkable(point),map.id+": valid terrain");
      assert.ok(point.x>=0&&point.y>=0&&point.x<=map.width&&point.y<=map.height,map.id+": visible map bounds");
      const entry=nav.nearest(map.spawn)!;
      assert.ok(nav.path(entry,point).length||Math.hypot(entry.x-point.x,entry.y-point.y)<.01,map.id+": reachable from map entry");
    }
    assert.deepEqual(mapEnemyHomes(map.id,nav,map.spawn),homes,map.id+": deterministic on reconnect");
    if(map.id==="10005") assert.ok(homes.some(p=>Math.hypot(p.x-map.spawn.x,p.y-map.spawn.y)>400),"forest population must extend past the entrance neighborhood");
  }
});

test("map homes exclude disconnected islands and do not duplicate tiny populations", () => {
  const nav=new NativeNavigation({sourceWidth:400,sourceHeight:400,columns:40,rows:40,cellWidth:10,cellHeight:10,unitsPerSourcePixel:1,
    cells:Array.from({length:1600},(_,i)=>[i%40,Math.floor(i/40)] as [number,number]),
    obstacles:[[{x:190,y:-500},{x:210,y:-500},{x:210,y:800},{x:190,y:800}]]});
  const homes=mapEnemyHomes("islands",nav,{x:140,y:100});
  assert.equal(homes.length,6);assert.ok(homes.every(p=>p.x<190));
  const tiny=new NativeNavigation({sourceWidth:40,sourceHeight:40,columns:2,rows:2,cellWidth:20,cellHeight:20,unitsPerSourcePixel:1,cells:[[0,0]]});
  assert.equal(mapEnemyHomes("tiny",tiny,tiny.points[0]).length,1);
  assert.deepEqual(mapEnemyHomes("empty",new NativeNavigation({...tiny.grid,cells:[]}),{x:0,y:0}),[]);
});
