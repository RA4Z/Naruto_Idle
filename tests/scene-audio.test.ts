import test from "node:test";
import assert from "node:assert/strict";
import { SceneAudioPlayer } from "../src/audio/scene-audio";
class Clip {
  src = ""; preload = ""; loop = false; volume = 1; paused = true; readyState = 4;
  currentTime = 0; duration = 60;
  ontimeupdate: ((event: Event) => unknown) | null = null;
  onended: ((event: Event) => unknown) | null = null;
  onerror: ((event: string | Event) => unknown) | null = null;
  playCount = 0; released = false; rejectPlay = false;
  play() { this.playCount++; if (this.rejectPlay) return Promise.reject(new Error("gesture required")); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; this.released = true; }
  load() {}
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function setup(intervalMs = 0) {
  const clips: Clip[] = [];
  const player = new SceneAudioPlayer({
    forest: { sceneId: "1003001", tracks: ["/forest.mp3", "/forest-2.mp3"], environment: "/birds.mp3", intervalMs },
    coast: { sceneId: "2010001", tracks: ["/coast.mp3"], environment: "/wind.mp3", intervalMs },
  }, "/main.mp3", () => { const clip = new Clip(); clips.push(clip); return clip; }, () => 0);
  player.setMap("forest");
  return { player, clips };
}
test("optional scene audio creates nothing until enabled; music preference is independent from ambience", () => {
  const {player, clips} = setup();
  assert.equal(clips.length, 0);
  player.settings(true, false, 0.5);
  assert.equal(clips.length, 1); assert.equal(clips[0].src, "/birds.mp3");
  assert.equal(clips[0].loop, true);
  player.settings(true, true, 0.5);
  assert.equal(clips.length, 2); assert.equal(clips[1].src, "/forest.mp3");
  assert.equal(clips[1].loop, false);
  assert.equal(clips[1].volume, 0.09);
  player.settings(true, true, 0.2);
  assert.equal(clips.length, 2); assert.equal(clips[1].volume, 0.036);
  player.settings(true, false, 0.5);
  assert.equal(clips[1].released, true); assert.equal(clips[0].paused, false);
  player.settings(false, true, 0.5);
  assert.ok(clips.every(clip=>clip.paused && clip.released));
  assert.equal(player.snapshot().activeElements, 0);
  player.dispose();
});
test("travel and disposal release old channels and stale completion cannot start a track in another map", async () => {
  const {player, clips} = setup();
  player.settings(true, true, 1);
  const stale = clips[1].onended!;
  player.setMap("coast");
  assert.ok(clips.slice(0, 2).every(clip=>clip.paused && clip.released));
  assert.equal(player.snapshot().sourceSceneId, "2010001");
  assert.equal(player.snapshot().musicUrl, "/coast.mp3");
  stale(new Event("ended"));
  await tick();
  assert.equal(clips.length, 4);
  player.dispose(); player.dispose(); player.unlock(); player.setMap("forest");
  assert.ok(clips.every(clip=>clip.paused && clip.released));
  assert.equal(clips.length, 4);
});
test("pause suspends both layers and a completion interval never starts playback while paused", async () => {
  const {player, clips} = setup();
  player.settings(true, true, 0.4);
  clips[1].onended!(new Event("ended"));
  player.pause(true);
  await tick();
  assert.equal(clips.length, 2); assert.equal(clips[0].paused, true);
  assert.equal(player.snapshot().musicWaiting, true);
  player.pause(false); await tick();
  assert.equal(clips.length, 3); assert.equal(clips[0].paused, false);
  player.dispose();
});
test("broken music tries another configured track without an unbounded retry or blocking ambient sound", async () => {
  const {player, clips} = setup();
  player.settings(true, true, 0.4);
  clips[1].onerror!(new Event("error")); await tick();
  assert.equal(clips[2].src, "/forest-2.mp3");
  clips[2].onerror!(new Event("error")); await tick(); await tick();
  assert.equal(clips.length, 3);
  assert.equal(player.snapshot().failedTracks, 2);
  assert.equal(player.snapshot().environmentPlaying, true);
  player.settings(true, false, 0.4); player.settings(true, true, 0.4);
  assert.equal(clips.length, 4);
  player.dispose();
});
test("autoplay rejection is recoverable on unlock and unknown scenes use the documented fallback", async () => {
  const {player, clips} = setup();
  player.setMap("unmapped");
  player.settings(true, true, 0.4);
  assert.equal(clips.length, 1); assert.equal(clips[0].src, "/main.mp3");
  clips[0].pause(); clips[0].rejectPlay = true;
  player.unlock(); await tick();
  assert.equal(player.snapshot().playbackBlocked, true);
  clips[0].rejectPlay = false; player.unlock(); await tick();
  assert.equal(player.snapshot().musicPlaying, true);
  player.dispose();
});

test("native two-second fades follow the track clock, volume and pause without another animation loop", () => {
 const clips: Clip[]=[];
 const player=new SceneAudioPlayer({forest:{tracks:["/forest.mp3"],intervalMs:10000,fadeInMs:2000,fadeOutMs:2000}},
 "/fallback.mp3",()=>{const clip=new Clip();clips.push(clip);return clip;});
 player.setMap("forest");player.settings(true,true,1);
 const clip=clips[0];assert.equal(clip.volume,0);
 clip.currentTime=1;clip.ontimeupdate!(new Event("timeupdate"));assert.equal(clip.volume,0.09);
 clip.currentTime=30;clip.ontimeupdate!(new Event("timeupdate"));assert.equal(clip.volume,0.18);
 clip.currentTime=59;clip.ontimeupdate!(new Event("timeupdate"));assert.equal(clip.volume,0.09);
 player.settings(true,true,0.5);assert.equal(clip.volume,0.045);
 player.pause(true);assert.equal(clip.paused,true);
 player.dispose();assert.equal(clip.ontimeupdate,null);
});
