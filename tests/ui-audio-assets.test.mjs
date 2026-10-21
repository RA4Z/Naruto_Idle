import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
test("UI cues retain native IDs and MP3 symbol hashes instead of borrowing a character voice",async()=>{
 const index=JSON.parse(await readFile("public/assets/audio/ui/index.json","utf8"));
 const presentation=JSON.parse(await readFile("public/assets/presentation.json","utf8"));
 const expected={click:["1","216"],close:["2","217"],battleStart:["4","253"],levelUp:["14","263"],victory:["18","267"],defeat:["19","268"]};
 for(const [event,[uiId,sid]] of Object.entries(expected)){
  const native=index.events[event];assert.equal(native.uiId,uiId);assert.equal(native.sourceMapping.sound,sid);
  assert.equal(presentation.uiCues[event],sid);
  assert.deepEqual(presentation.sounds[sid].urls,native.clips.map(c=>c.url));
  for(const clip of native.clips){
   const bytes=await readFile("public"+clip.url);
   assert.equal(bytes.length,clip.bytes);
   assert.equal(createHash("sha256").update(bytes).digest("hex"),clip.sha256);
   assert.ok(bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224));
  }
 }
});
