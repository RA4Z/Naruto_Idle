// Uses the actual runtime validator and verifies every referenced MP3 byte hash.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateActorAudio } from '../src/audio/entity-audio.ts';
const presentation = JSON.parse(await readFile('public/assets/presentation.json', 'utf8'));
const clips = new Map(), results = [];
for (const [id, ref] of Object.entries(presentation.entityAudio || {})) {
  const data = validateActorAudio(JSON.parse(await readFile('public'+ref.url, 'utf8')), id);
  assert.equal(data.name,ref.name);
  for (const [action, events] of Object.entries(data.actions)) {
    for (const event of events) {
      assert.ok(event.time < data.durations[action], `${id}/${action}: event outside timeline`);
      assert.ok(Math.abs(event.time-event.frame*1000/data.fps)<.001, `${id}: changed frame timing`);
    }
  }
  for (const sound of Object.values(data.sounds)) {
    if(sound.sourceGroups)assert.equal(sound.voice,sound.sourceGroups.includes('voice'));
    else assert.equal(typeof sound.voice,'boolean');
    for (const clip of sound.clips) {
      const bytes = await readFile('public'+clip.url);
      const sha = createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha,clip.sha256); assert.equal(bytes.length,clip.bytes);
      const padding=clip.leadingPaddingBytes||0;
      assert.ok(padding>=0&&padding<=4096&&bytes.subarray(0,padding).every(b=>b===0));
      assert.ok(bytes.subarray(0,3).toString()==='ID3'||(bytes[padding]===255&&(bytes[padding+1]&224)===224));
      if(clips.has(clip.url))assert.equal(clips.get(clip.url),sha);
      clips.set(clip.url,sha);
    }
  }
  for(const event of data.unresolvedEvents || [])assert.ok(!data.sounds[event.sound] || event.reason.includes('action is absent'));
  results.push({id,events:Object.values(data.actions).reduce((n,events)=>n+events.length,0),silentEvents:data.silentEvents?.length||0,unresolvedEvents:data.unresolvedEvents?.length||0,status:data.status||'previous-stage'});
}
const report={scope:'Native A_1hit/C_dead only; actual runtime schema, event frames/durations and full MP3 SHA256. Original zero padding retained. Zero-clip native packages preserve silence. Other actions and absent packages remain pending.',models:results.length,clips:clips.size,events:results.reduce((n,r)=>n+r.events,0),silentEvents:results.reduce((n,r)=>n+r.silentEvents,0),unresolvedEvents:results.reduce((n,r)=>n+r.unresolvedEvents,0),state:'validated',results};
await writeFile('reports/actor-audio-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({models:report.models,clips:report.clips,events:report.events,unresolvedEvents:report.unresolvedEvents,state:report.state}));
