import test from "node:test";
import assert from "node:assert/strict";
import { EntityAudioPlayer, chooseActorClip, validateActorAudio, type ActorAudio, type ActorSound } from "../src/audio/entity-audio";
const sound = (method: 1 | 2 = 1): ActorSound => ({
  method, volume: 1, maxPlayback: 4,
  clips: [1, 2, 3].map(n => ({ url: "/assets/audio/sfx/590/"+n+".mp3", weight: n === 1 ? 50 : 25, enabled: true })),
});
const model = (id = "19000101"): ActorAudio => ({
  id, name: "Ninja", durations: { A_1hit: 1000, C_dead: 500 },
  actions: { A_1hit: [{ time: 500, sound: "590", volume: 0.5 }], C_dead: [{ time: 0, sound: "590", volume: 1 }] },
  sounds: { "590": sound(2) },
});
class Clip {
  src = ""; preload = ""; volume = 1; paused = true;
  onended: ((event: Event) => unknown) | null = null;
  onerror: ((event: string | Event) => unknown) | null = null;
  released = false;
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; this.released = true; }
  load() {}
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(data = model(), loader?: (url: string, signal: AbortSignal) => Promise<ActorAudio>) {
  const jobs: { delay: number; run: () => void; canceled: boolean }[] = [], clips: Clip[] = [];
  let available = 4;
  const player = new EntityAudioPlayer({
    "19000101": { name: "A", url: "/a.json" }, "19000201": { name: "B", url: "/b.json" },
  }, (delay, run) => { const job = { delay, run, canceled: false }; jobs.push(job); return () => { job.canceled = true; }; },
  () => available, () => { const clip = new Clip(); clips.push(clip); return clip; },
  loader || (async () => data), () => 0);
  const flush = () => { const tasks = jobs.splice(0); for (const job of tasks) if (!job.canceled) job.run(); };
  return { player, clips, jobs, flush, setBudget: (n: number) => { available = n; } };
}
test("original weighted choice and unique random exclude only the immediately previous item", () => {
  assert.equal(chooseActorClip(sound(), undefined, 0.49), 0);
  assert.equal(chooseActorClip(sound(), undefined, 0.51), 1);
  assert.equal(chooseActorClip(sound(2), 0, 0), 1);
  assert.equal(chooseActorClip(sound(2), 1, 0), 0);
  assert.equal(chooseActorClip({ ...sound(2), clips: [sound().clips[0]] }, 0, 0), 0);
});
test("actor metadata is optional and lazy; frame timing follows actual scaled animation duration", async () => {
  let loads = 0;
  const s = setup(model(), async () => { loads++; return model(); });
  s.player.setActors(["19000101"]); await tick(); assert.equal(loads, 0);
  s.player.settings(true, 0.4); await tick(); assert.equal(loads, 1);
  s.player.action("19000101", "A_1hit", 450, "enemy");
  assert.equal(s.jobs[0].delay, 225); s.flush();
  assert.equal(s.clips[0].volume, 0.1); assert.equal(s.player.snapshot().played, 1);
  s.player.dispose(); assert.ok(s.clips[0].released);
});
test("replacement action cancels stale events; same model hero and enemy have independent channels", async () => {
  const s = setup(); s.player.setActors(["19000101"]); s.player.settings(true, 0.4); await tick();
  s.player.action("19000101", "A_1hit", 500, "hero");
  s.player.action("19000101", "A_1hit", 500, "enemy");
  s.player.action("19000101", "C_hurt", 1, "enemy"); s.flush();
  assert.equal(s.clips.length, 1); assert.equal(s.player.snapshot().lastPlayed?.owner, "hero");
  s.player.action("19000101", "C_dead", 500, "hero"); s.flush();
  assert.ok(s.clips[0].released); assert.equal(s.player.snapshot().lastPlayed?.action, "C_dead");
  s.player.dispose();
});
test("four shared voices, package limits, priority trimming, pause and mute release correctly", async () => {
  const data = model(); data.actions.A_1hit = Array.from({length: 6}, () => ({ time: 0, sound: "590", volume: 1 }));
  const s = setup(data); s.player.setActors(["19000101"]); s.player.settings(true, 0.4); await tick();
  s.setBudget(3); s.player.action("19000101", "A_1hit", 500, "enemy"); s.flush();
  assert.equal(s.player.snapshot().voices, 3);
  s.player.pause(true); assert.ok(s.clips.every(c => c.paused));
  s.player.pause(false); assert.ok(s.clips.every(c => !c.paused));
  s.setBudget(1); s.player.trim(); assert.equal(s.player.snapshot().voices, 1);
  s.player.settings(false, 0.4); assert.equal(s.player.snapshot().voices, 0);
  assert.deepEqual(s.player.snapshot().ready, []); assert.ok(s.clips.every(c => c.released));
  s.player.dispose();
});
test("death voice reserves one slot by replacing a lower priority actor clip", async () => {
  const data = model(); data.actions.A_1hit = Array.from({length: 4}, () => ({ time: 0, sound: "590", volume: 1 }));
  const s = setup(data); s.player.setActors(["19000101"]); s.player.settings(true, 0.4); await tick();
  s.player.action("19000101", "A_1hit", 500, "hero"); s.flush();
  assert.equal(s.player.snapshot().voices, 4);
  s.player.action("19000101", "C_dead", 500, "enemy"); s.flush();
  assert.equal(s.player.snapshot().voices, 4); assert.equal(s.player.snapshot().lastPlayed?.owner, "enemy");
  assert.equal(s.player.snapshot().lastPlayed?.action, "C_dead"); assert.equal(s.clips[0].released, true);
  s.player.dispose();
});
test("cast changes abort stale metadata and serialize new requests without retaining old models", async () => {
  let finish!: (data: ActorAudio) => void, count = 0, max = 0, active = 0;
  const s = setup(model(), async (url) => {
    count++; active++; max = Math.max(max, active);
    const result = url === "/a.json" ? await new Promise<ActorAudio>(resolve => { finish = resolve; }) : model("19000201");
    active--; return result;
  });
  s.player.setActors(["19000101"]); s.player.settings(true, 0.4); await tick();
  s.player.setActors(["19000201"]); finish(model()); await tick(); await tick();
  assert.equal(max, 1); assert.equal(count, 2); assert.deepEqual(s.player.snapshot().ready, ["19000201"]);
  s.player.setActors([]); assert.deepEqual(s.player.snapshot().ready, []);
  s.player.dispose();
});
test("failed optional manifests do not loop; mute toggle retries; disposed loads cannot revive playback", async () => {
  let attempts = 0;
  const s = setup(model(), async () => { if (++attempts === 1) throw new Error("missing"); return model(); });
  s.player.setActors(["19000101"]); s.player.settings(true, 0.4); await tick();
  assert.deepEqual(s.player.snapshot().failed, ["19000101"]); assert.equal(attempts, 1);
  s.player.settings(true, 0.5); await tick(); assert.equal(attempts, 1);
  s.player.settings(false, 0.4); s.player.settings(true, 0.4); await tick();
  assert.deepEqual(s.player.snapshot().ready, ["19000101"]);
  s.player.action("19000101", "A_1hit", 500, "enemy"); s.player.dispose(); s.flush();
  assert.equal(s.clips.length, 0); assert.equal(s.player.snapshot().pending, 0);
});
test("disabled native selections produce silence and invalid manifests are rejected", async () => {
  const data = model(); data.sounds["590"].clips[0].enabled = false;
  const s = setup(data); s.player.setActors(["19000101"]); s.player.settings(true, 1); await tick();
  s.player.action("19000101", "A_1hit", 500, "enemy"); s.flush(); assert.equal(s.clips.length, 0);
  const bad = model(); bad.sounds["590"].clips[0].url = "https://example.com/injected.mp3";
  assert.throws(() => validateActorAudio(bad, bad.id)); assert.throws(() => validateActorAudio(model(), "wrong"));
  s.player.dispose();
});
