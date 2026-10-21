import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("scene music runtime links preserve source hashes, share files and distinguish prototype fallback", async () => {
 const index=JSON.parse(await readFile("public/assets/audio/scenes/index.json","utf8"));
 const presentation=JSON.parse(await readFile("public/assets/presentation.json","utf8"));
 assert.deepEqual(Object.keys(index.maps).sort(),["10005","10006","10007","10008","10009","30008","300131"]);
 assert.equal(index.maps["10007"].sceneId,"2010001");
 assert.equal(index.maps["10005"].sceneId,"1003001");
 assert.deepEqual(index.maps["10006"].tracks,index.maps["10007"].tracks);
 assert.equal(presentation.sceneAudio["10001"],undefined);
 for(const [id,map] of Object.entries(index.maps)){
  const runtime=presentation.sceneAudio[id];
  assert.equal(runtime.sceneId,map.sceneId);
  assert.deepEqual(runtime.tracks,map.tracks);assert.equal(runtime.environment,map.environment);
  assert.equal(runtime.intervalMs,10000);
  for(const url of [...runtime.tracks,runtime.environment]){
   const file=index.files[url];assert.ok(file);const bytes=await readFile("public"+url);
   assert.equal(bytes.length,file.bytes);
   assert.equal(createHash("sha256").update(bytes).digest("hex"),file.sha256);
   assert.ok(bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224));
  }
 }
 assert.equal(Object.keys(index.files).length,11);
 assert.equal(index.maps["30008"].fadeInMs,2000);
 assert.equal(index.maps["30008"].fadeOutMs,2000);
 assert.equal(index.maps["300131"].sceneId,"2015006");
});
