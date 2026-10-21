import Phaser from "phaser";
import { SceneAudioPlayer, type SceneAudioCatalog } from "./audio/scene-audio";
import type { UiCue } from "./audio/ui-cues";
import type { AnimationDef } from "./entities/types";
export type PresentationConfig = {
  characters: Record<
    string,
    {
      name: string;
      skillId: string;
      action?: string;
      actions: Record<
        string,
        { time: number; sound: string; volume: number }[]
      >;
    }
  >;
  effects: Record<string, AnimationDef>;
  sounds: Record<string, { name: string; urls: string[] }>;
  music: { url: string };
  sceneAudio?: SceneAudioCatalog;
  uiCues?: Partial<Record<UiCue, string>>;
};
const effectKey = (name: string) => "effect:" + name;
const effectsFor = (character: string) =>
  new Set([
    "DaJiTeXiao",
    ...(character === "naruto"
      ? ["luoxuanwan"]
      : character === "sasuke"
        ? ["qianniao"]
        : character === "sakura" ? ["zhihuozaishen", "hphuifu"] : []),
  ]);
const soundKey = (id: string, index: number) => `original:${id}:${index}`;
export function queuePresentation(
  scene: Phaser.Scene,
  data: PresentationConfig,
  character: string,
  options = { effects: true, audio: true },
) {
  for (const [name, anim] of Object.entries(data.effects).filter(
    ([name]) =>
      options.effects &&
      effectsFor(character).has(name) &&
      !scene.textures.exists(effectKey(name)),
  ))
    scene.load.spritesheet(effectKey(name), anim.url, {
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight,
      endFrame: anim.frames - 1,
    });
  if (!options.audio) return;
  const ids = new Set(
    Object.values(data.characters[character]?.actions || {})
      .flat()
      .map((e) => e.sound),
  );
  ids.add("196");
  ids.add("197");
  for (const id of Object.values(data.uiCues || {})) if (id) ids.add(id);
  for (const id of ids)
    data.sounds[id]?.urls.forEach(
      (url, i) =>
        !scene.cache.audio.exists(soundKey(id, i)) &&
        scene.load.audio(soundKey(id, i), url),
    );

}
export class PresentationPlayer {
  private active = new Set<Phaser.GameObjects.Sprite>();
  private timers = new Set<Phaser.Time.TimerEvent>();
  private ambience: SceneAudioPlayer;
  private paused = false;
  private enabled = false;
  private lastSoundAt = -100;
  private soundCount = 0;
  private effectCount = 0;
  private lastUiAt = -100;
  private cuesPlayed: Partial<Record<UiCue, number>> = {};
  constructor(
    private scene: Phaser.Scene,
    private data: PresentationConfig,
    private character: string,
    mapId = "10001",
  ) {
    this.ambience = new SceneAudioPlayer(data.sceneAudio || {}, data.music.url);
    this.ambience.setMap(mapId);
    this.registerEffects();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      this.timers.forEach((t) => t.remove());
      this.active.forEach((s) => s.destroy());
      this.ambience.dispose();
    };
    scene.events.once("shutdown", dispose);
    scene.events.once("destroy", dispose);
  }
  registerEffects() {
    const scene = this.scene,
      data = this.data,
      character = this.character;
    for (const [name, anim] of Object.entries(data.effects).filter(([name]) =>
      effectsFor(character).has(name),
    ))
      if (
        scene.textures.exists(effectKey(name)) &&
        !scene.anims.exists(effectKey(name))
      )
        scene.anims.create({
          key: effectKey(name),
          frames: (
            anim.timeline || Array.from({ length: anim.frames }, (_, i) => i)
          ).map((frame) => ({ key: effectKey(name), frame })),
          frameRate: anim.fps,
          repeat: 0,
        });
  }
  settings(enabled: boolean, music: boolean, volume: number) {
    this.enabled = enabled;
    this.scene.sound.mute = !enabled;
    this.scene.sound.volume = volume;
    this.ambience.settings(enabled, music, volume);
  }
  setMap(id: string) {
    this.ambience.setMap(id);
  }
  unlock() {
    this.ambience.unlock();
    const manager = this.scene.sound;
    if (manager instanceof Phaser.Sound.WebAudioSoundManager)
      void manager.context.resume();
  }
  pause(paused: boolean) {
    this.ambience.pause(paused);
    if (this.paused !== paused) {
      this.paused = paused;
      if (paused) this.scene.sound.pauseAll();
      else {
        this.scene.sound.resumeAll();
        const playing = this.scene.sound.getAllPlaying();
        for (const sound of playing.slice(0, Math.max(0, playing.length - 4))) sound.destroy();
      }
    }
    for (const sprite of this.active)
      paused ? sprite.anims.pause() : sprite.anims.resume();
  }
  private later(time: number, callback: () => void) {
    const timer = this.scene.time.delayedCall(time, () => {
      this.timers.delete(timer);
      callback();
    });
    this.timers.add(timer);
  }
  private sound(id: string, volume: number, priority = false, allowPaused = false) {
    if (!this.enabled || (this.paused && !allowPaused)) return false;
    const entry = this.data.sounds[id];
    if (!entry?.urls.length) return false;
    // Four short voices plus the two independently streamed ambience/music layers.
    const voices = this.scene.sound.getAllPlaying();
    if (voices.length >= 4) {
      if (!priority) return false;
      voices[0].destroy();
    }
    const index = Math.floor(Math.random() * entry.urls.length),
      key = soundKey(id, index);
    if (this.scene.cache.audio.exists(key)) {
      this.scene.sound.play(key, { volume: volume * 0.5 });
      this.soundCount++;
      this.lastSoundAt = this.scene.time.now;
      return true;
    }
    return false;
  }
  ui(cue: UiCue) {
    const id = this.data.uiCues?.[cue];
    const now = performance.now();
    const button = cue === "click" || cue === "close";
    if (!id || (button && now - this.lastUiAt < 80)) return;
    // Retriggering a button must not stack its trailing silence or mask a result cue.
    const controls = [this.data.uiCues?.click, this.data.uiCues?.close];
    for (const control of controls)
      if (control) this.data.sounds[control]?.urls.forEach((_, index) => {
        for (const voice of this.scene.sound.getAll(soundKey(control, index))) voice.destroy();
      });
    // Dialogs pause the world; their UI feedback remains available when sound is enabled.
    if (this.sound(id, button ? 0.4 : 0.65, !button, true)) {
      if (button) this.lastUiAt = now;
      this.cuesPlayed[cue] = (this.cuesPlayed[cue] || 0) + 1;
    }
  }
  footstep() {
    this.sound(Math.random() < 0.5 ? "196" : "197", 0.18);
  }
  private effect(
    name: string,
    x: number,
    y: number,
    width: number,
    duration: number,
    flip = false,
  ) {
    const anim = this.data.effects[name];
    if (
      !anim ||
      this.active.size >= 10 ||
      !this.scene.anims.exists(effectKey(name))
    )
      return undefined;
    const sprite = this.scene.add
      .sprite(x, y, effectKey(name))
      .setOrigin(...anim.origin)
      .setScale(width / anim.frameWidth)
      .setFlipX(flip)
      .setDepth(1800);
    sprite.play(effectKey(name));
    sprite.anims.timeScale =
      ((anim.timeline?.length || anim.frames) * 1000) / anim.fps / duration;
    this.active.add(sprite);
    this.effectCount++;
    const destroy = () => {
      this.active.delete(sprite);
      sprite.destroy();
    };
    sprite.once("animationcomplete", destroy);
    this.later(duration + 100, () => {
      if (sprite.active) destroy();
    });
    return sprite;
  }
  play(
    action: "A_1hit" | "SP_skill1" | "C_dead",
    hero: { x: number; y: number },
    enemy: { x: number; y: number },
    duration: number,
  ) {
    const events = this.data.characters[this.character]?.actions[action] || [];
    const end = Math.max(duration, ...events.map((e) => e.time + 80));
    // Delayed impact effects must stay at the position of this strike even if
    // the target resumes moving before the callback runs.
    const impact = { x: enemy.x, y: enemy.y };
    for (const event of events)
      this.later((event.time * duration) / end, () =>
        this.sound(event.sound, event.volume),
      );
    const flip = enemy.x < hero.x;
    if (action === "A_1hit")
      this.later(120, () =>
        this.effect("DaJiTeXiao", impact.x, impact.y - 5, 30, 250, flip),
      );
    if (action !== "SP_skill1" || !this.data.characters[this.character]) return;
    if (this.character === "sakura") {
      this.effect("zhihuozaishen", hero.x, hero.y - 17, 50, duration);
      this.effect("hphuifu", hero.x, hero.y + 2, 26, duration);
    } else {
      const name = this.character === "naruto" ? "luoxuanwan" : "qianniao";
      const sprite = this.effect(
        name,
        hero.x + (flip ? -13 : 13),
        hero.y - 27,
        this.character === "naruto" ? 68 : 46,
        duration,
        flip,
      );
      if (sprite)
        this.scene.tweens.add({
          targets: sprite,
          x: impact.x,
          y: impact.y - 27,
          duration: duration * 0.72,
          ease: "Sine.easeInOut",
        });
      this.later(duration * 0.65, () =>
        this.effect("DaJiTeXiao", impact.x, impact.y - 5, 42, 260, flip),
      );
    }
  }
  snapshot() {
    return {
      activeEffects: this.active.size,
      effectFrames: [...this.active].map((sprite) => ({
        frame: sprite.anims.currentFrame?.index,
        x: sprite.x,
        y: sprite.y,
      })),
      effectsPlayed: this.effectCount,
      cuesPlayed: { ...this.cuesPlayed },
      shortVoices: this.scene.sound.getAllPlaying().length,
      soundsPlayed: this.soundCount,
      lastSoundAt: this.lastSoundAt,
      audioUnlocked:
        !(this.scene.sound instanceof Phaser.Sound.WebAudioSoundManager) ||
        this.scene.sound.context.state === "running",
      ...this.ambience.snapshot(),
    };
  }
}
