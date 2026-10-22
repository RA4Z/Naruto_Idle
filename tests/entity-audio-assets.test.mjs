import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
test("four actor manifests preserve native attack frames, death mappings, shared clips and MP3 hashes", async () => {
  const presentation = JSON.parse(await readFile("public/assets/presentation.json", "utf8"));
  const expected = { "19000101": [9,3,"587"], "19000201": [4,3,"586"], "19004301": [0,4,"585"], "19002301": [12,2,"587"] };
  const clips = new Set();
  for (const [id, [frame, count, death]] of Object.entries(expected)) {
    const ref = presentation.entityAudio[id];
    const data = JSON.parse(await readFile("public"+ref.url, "utf8"));
    assert.equal(data.id, id); assert.equal(data.name, ref.name); assert.equal(data.fps, 24);
    assert.equal(data.actions.A_1hit.length, count);
    assert.ok(data.actions.A_1hit.every(e => e.frame === frame && e.time === frame*1000/24));
    assert.equal(data.actions.C_dead[0].sound, death);
    assert.equal(data.actions.C_dead[0].source, "deathSoundConfig");
    assert.equal(data.actions.C_dead[0].time, 0);
    for (const [sid, sound] of Object.entries(data.sounds)) {
      assert.ok([1,2].includes(sound.method)); assert.ok(sound.maxPlayback <= 4);
      if (presentation.sounds[sid]) assert.deepEqual(sound.clips.map(c=>c.url), presentation.sounds[sid].urls);
      for (const clip of sound.clips) {
        clips.add(clip.url);
        const bytes = await readFile("public"+clip.url);
        assert.equal(bytes.length, clip.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), clip.sha256);
        assert.ok(bytes.toString("ascii",0,3)==="ID3" || (bytes[0]===255 && (bytes[1]&224)===224));
      }
    }
  }
  assert.equal(clips.size, 42);
});

test("expanded actor audio keeps matching IDs, native frames, partial dependencies and every MP3 hash", async () => {
  const presentation=JSON.parse(await readFile('public/assets/presentation.json','utf8'));
  const proof=JSON.parse(await readFile('reports/actor-audio-source-validation.json','utf8'));
  assert.equal(Object.keys(presentation.entityAudio).length,proof.models);
  const hashes=new Map();let events=0,unresolved=0,silent=0;
  for(const [id,ref] of Object.entries(presentation.entityAudio)){
    const actor=JSON.parse(await readFile('public'+ref.url,'utf8'));
    assert.equal(actor.id,id);assert.equal(actor.name,ref.name);
    assert.ok(proof.results.some(r=>r.id===id));
    for(const [action,rows] of Object.entries(actor.actions))for(const e of rows){
      events++;assert.ok(['A_1hit','C_dead'].includes(action));
      assert.ok(Math.abs(e.time-e.frame*1000/actor.fps)<.001);assert.ok(e.time<actor.durations[action]);
      assert.ok(actor.sounds[e.sound]);
    }
    for(const e of actor.unresolvedEvents||[]){unresolved++;assert.ok(e.reason);assert.ok(!actor.sounds[e.sound]||e.reason.includes('action is absent'));}
    for(const e of actor.silentEvents||[]){silent++;assert.equal(e.state,'original-silent-package');assert.ok(!actor.sounds[e.sound]);}
    if(actor.status)assert.equal(actor.status,actor.unresolvedEvents.length?'partial':'ready');
    for(const sound of Object.values(actor.sounds))for(const clip of sound.clips){
      if(!hashes.has(clip.url))hashes.set(clip.url,createHash('sha256').update(await readFile('public'+clip.url)).digest('hex'));
      assert.equal(hashes.get(clip.url),clip.sha256);
    }
  }
  assert.equal(events+unresolved+silent,proof.nativeEventsMatched);assert.equal(unresolved,proof.unresolvedEvents);assert.equal(silent,proof.silentEvents);
  assert.equal(proof.sourceHashesPreserved,true);
  const temari=JSON.parse(await readFile('public'+presentation.entityAudio['11001401'].url,'utf8'));
  assert.ok(temari.unresolvedEvents.some(e=>e.sound==='871'),'missing Temari package remains explicit');
  assert.equal(temari.sounds['871'],undefined);
});
