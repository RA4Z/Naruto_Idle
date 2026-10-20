import Phaser from "phaser";
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
};
const effectKey = (name: string) => "effect:" + name;
const effectsFor = (character: string) =>
  new Set([
    "DaJiTeXiao",
    ...(character === "naruto"
      ? ["luoxuanwan"]
      : character === "sasuke"
        ? ["qianniao"]
        : ["zhihuozaishen", "hphuifu"]),
  ]);
const soundKey = (id: string, index: number) => `original:${id}:${index}`;
export function queuePresentation(
  scene: Phaser.Scene,
  data: PresentationConfig,
  character: string,
) {
  for (const [name, anim] of Object.entries(data.effects).filter(([name]) =>
    effectsFor(character).has(name),
  ))
    scene.load.spritesheet(effectKey(name), anim.url, {
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight,
      endFrame: anim.frames - 1,
    });
  const ids = new Set(
    Object.values(data.characters[character].actions)
      .flat()
      .map((e) => e.sound),
  );
  ids.add("196");
  ids.add("197");
  for (const id of ids)
    data.sounds[id]?.urls.forEach((url, i) =>
      scene.load.audio(soundKey(id, i), url),
    );
  scene.load.audio("original:village", data.music.url);
}
export class PresentationPlayer {
  private active = new Set<Phaser.GameObjects.Sprite>();
  private timers = new Set<Phaser.Time.TimerEvent>();
  private music?: Phaser.Sound.BaseSound;
  private paused = false;
  private enabled = false;
  private lastSoundAt = -100;
  private soundCount = 0;
  private effectCount = 0;
  constructor(
    private scene: Phaser.Scene,
    private data: PresentationConfig,
    private character: string,
  ) {
    for (const [name, anim] of Object.entries(data.effects).filter(([name]) =>
      effectsFor(character).has(name),
    ))
      if (scene.textures.exists(effectKey(name)))
        scene.anims.create({
          key: effectKey(name),
          frames: (
            anim.timeline || Array.from({ length: anim.frames }, (_, i) => i)
          ).map((frame) => ({ key: effectKey(name), frame })),
          frameRate: anim.fps,
          repeat: 0,
        });
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      this.timers.forEach((t) => t.remove());
      this.active.forEach((s) => s.destroy());
      this.music?.destroy();
    };
    scene.events.once("shutdown", dispose);
    scene.events.once("destroy", dispose);
  }
  settings(enabled: boolean, music: boolean, volume: number) {
    this.enabled = enabled;
    this.scene.sound.mute = !enabled;
    this.scene.sound.volume = volume;
    if (
      enabled &&
      music &&
      !this.music &&
      this.scene.cache.audio.exists("original:village")
    ) {
      this.music = this.scene.sound.add("original:village", {
        loop: true,
        volume: 0.18,
      });
      this.music.play();
    } else if ((!music || !enabled) && this.music) {
      this.music.destroy();
      this.music = undefined;
    }
    if (this.paused && this.music?.isPlaying) this.music.pause();
  }
  unlock() {
    const manager = this.scene.sound;
    if (manager instanceof Phaser.Sound.WebAudioSoundManager)
      void manager.context.resume();
  }
  pause(paused: boolean) {
    if (this.paused !== paused) {
      this.paused = paused;
      if (paused) this.scene.sound.pauseAll();
      else this.scene.sound.resumeAll();
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
  private sound(id: string, volume: number) {
    if (!this.enabled || this.paused) return;
    const entry = this.data.sounds[id];
    if (!entry) return;
    // At most six short voices, including all original sound layers of one strike.
    if (this.scene.sound.getAllPlaying().length >= 7) return;
    const index = Math.floor(Math.random() * entry.urls.length),
      key = soundKey(id, index);
    if (this.scene.cache.audio.exists(key)) {
      this.scene.sound.play(key, { volume: volume * 0.5 });
      this.soundCount++;
      this.lastSoundAt = this.scene.time.now;
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
    const events = this.data.characters[this.character].actions[action] || [];
    const end = Math.max(duration, ...events.map((e) => e.time + 80));
    for (const event of events)
      this.later((event.time * duration) / end, () =>
        this.sound(event.sound, event.volume),
      );
    const flip = enemy.x < hero.x;
    if (action === "A_1hit")
      this.later(120, () =>
        this.effect("DaJiTeXiao", enemy.x, enemy.y - 5, 30, 250, flip),
      );
    if (action !== "SP_skill1") return;
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
          x: enemy.x,
          y: enemy.y - 27,
          duration: duration * 0.72,
          ease: "Sine.easeInOut",
        });
      this.later(duration * 0.65, () =>
        this.effect("DaJiTeXiao", enemy.x, enemy.y - 5, 42, 260, flip),
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
      soundsPlayed: this.soundCount,
      lastSoundAt: this.lastSoundAt,
      audioUnlocked:
        !(this.scene.sound instanceof Phaser.Sound.WebAudioSoundManager) ||
        this.scene.sound.context.state === "running",
      musicPlaying: !!this.music?.isPlaying,
    };
  }
}
