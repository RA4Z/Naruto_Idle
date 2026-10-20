import test from "node:test";
import assert from "node:assert/strict";
import { foregroundPlan } from "../src/world/foreground-plan.ts";
import type { WorldMap } from "../src/world/maps.ts";
test("native foreground reuses map RGB in WebGL and retains a complete Canvas fallback",()=>{
 const map={id:"10001",foreground:"/fallback.webp",nativeAlpha:{url:"/mask.png",width:3000,height:3000,sha256:"source"}} as WorldMap;
 assert.deepEqual(foregroundPlan(map,true),{url:"/mask.png",masked:true,colorTexture:"map-10001"});
 assert.deepEqual(foregroundPlan(map,false),{url:"/fallback.webp",masked:false,colorTexture:"map-10001-foreground"});
 assert.equal(foregroundPlan({...map,nativeAlpha:undefined},true).url,"/fallback.webp");
});
