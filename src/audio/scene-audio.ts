import { getPreferences } from "../preferences.ts";
export type SceneAudio = {
  sceneId?: string;
  tracks: string[];
  environment?: string;
  intervalMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};
export type SceneAudioCatalog = Record<string, SceneAudio>;
type AudioPort = Pick<
  HTMLAudioElement,
  | "src"
  | "preload"
  | "loop"
  | "volume"
  | "paused"
  | "readyState"
  | "play"
  | "pause"
  | "load"
  | "removeAttribute"
  | "onended"
  | "onerror"
  | "ontimeupdate"
  | "currentTime"
  | "duration"
>;
type Channel = { audio: AudioPort; url: string; failed: boolean };
export type AudioFactory = () => AudioPort;

// Long originals stream through HTMLAudio; at most one music and one ambience
// element exist. This avoids keeping decoded PCM for every visited map in Phaser.
export class SceneAudioPlayer {
  private mapId = "";
  private config?: SceneAudio;
  private music?: Channel;
  private environment?: Channel;
  private enabled = false;
  private musicEnabled = false;
  private volume = 0.4;
  private paused = false;
  private disposed = false;
  private waiting = false;
  private timer?: ReturnType<typeof setTimeout>;
  private failedTracks = new Set<string>();
  private blocked = false;
  constructor(
    private catalog: SceneAudioCatalog,
    private fallback: string,
    private factory: AudioFactory = () => new Audio(),
    private random: () => number = Math.random,
  ) {}
  setMap(id: string) {
    if (id === this.mapId || this.disposed) return;
    this.stop();
    this.mapId = id;
    this.failedTracks.clear();
    this.config = this.catalog[id] || {
      tracks: [this.fallback],
      intervalMs: 0,
    };
    this.sync();
  }
  settings(enabled: boolean, music: boolean, volume: number) {
    if (this.disposed) return;
    const retry = !this.enabled && enabled;
    const retryMusic = !this.musicEnabled && music;
    this.enabled = enabled;
    this.musicEnabled = music;
    this.volume = Math.max(
      0,
      Math.min(1, Number.isFinite(volume) ? volume : 0),
    );
    if (retry || retryMusic) this.failedTracks.clear();
    this.sync();
  }
  pause(value: boolean) {
    if (this.disposed || this.paused === value) return;
    this.paused = value;
    this.sync();
  }
  unlock() {
    if (!this.disposed) this.sync();
  }
  private release(channel?: Channel) {
    if (!channel) return;
    channel.audio.onended = null;
    channel.audio.onerror = null;
    channel.audio.ontimeupdate = null;
    channel.audio.pause();
    channel.audio.removeAttribute("src");
    channel.audio.load();
  }
  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private stop() {
    this.clearTimer();
    this.release(this.music);
    this.release(this.environment);
    this.music = this.environment = undefined;
    this.waiting = false;
    this.blocked = false;
  }
  private resume(channel: Channel) {
    if (channel.failed || !channel.audio.paused) return;
    const audio = channel.audio;
    // Browsers may require a later click to unlock playback. A rejected optional
    // audio promise never affects map loading or progression.
    void audio
      .play()
      .then(() => {
        if (this.music?.audio !== audio && this.environment?.audio !== audio)
          return;
        this.blocked = false;
        if (this.disposed || this.paused || !this.enabled) audio.pause();
      })
      .catch(() => {
        if (this.music?.audio === audio || this.environment?.audio === audio)
          this.blocked = true;
      });
  }
  private create(url: string, loop: boolean): Channel {
    const audio = this.factory();
    audio.preload = "none";
    audio.loop = loop;
    audio.src = url;
    return { audio, url, failed: false };
  }
  private nextMusic() {
    if (this.disposed || !this.enabled || !this.musicEnabled || this.paused)
      return;
    const tracks =
      this.config?.tracks.filter((url) => !this.failedTracks.has(url)) || [];
    if (!tracks.length) return;
    const url =
      tracks[
        Math.min(tracks.length - 1, Math.floor(this.random() * tracks.length))
      ];
    const channel = this.create(url, false);
    this.music = channel;
    channel.audio.onended = () => {
      if (this.music !== channel || this.disposed) return;
      this.release(channel);
      this.music = undefined;
      this.waiting = true;
      this.sync();
    };
    channel.audio.onerror = () => {
      if (this.music !== channel || this.disposed) return;
      this.failedTracks.add(url);
      this.release(channel);
      this.music = undefined;
      this.waiting = true;
      this.sync();
    };
    channel.audio.ontimeupdate = () => {
      if (this.music === channel) this.musicVolume(channel);
    };
    this.musicVolume(channel);
    this.resume(channel);
  }
  private musicVolume(channel: Channel) {
    const seconds = channel.audio.currentTime;
    const remaining = channel.audio.duration - seconds;
    const fadeIn = this.config?.fadeInMs || 0;
    const fadeOut = this.config?.fadeOutMs || 0;
    const gain = Math.max(
      0,
      Math.min(
        1,
        fadeIn ? (seconds * 1000) / fadeIn : 1,
        fadeOut && Number.isFinite(remaining)
          ? (remaining * 1000) / fadeOut
          : 1,
      ),
    );
    channel.audio.volume =
      this.volume * getPreferences().musicVolume * 0.18 * gain;
  }
  private sync() {
    if (this.disposed || !this.config) return;
    if (!this.enabled) {
      this.stop();
      return;
    }
    if (!this.environment && this.config.environment) {
      const channel = this.create(this.config.environment, true);
      this.environment = channel;
      channel.audio.onerror = () => {
        if (this.environment === channel) {
          channel.failed = true;
          channel.audio.pause();
        }
      };
    }
    if (this.environment) {
      this.environment.audio.volume =
        this.volume * getPreferences().ambienceVolume * 0.12;
      if (this.paused) this.environment.audio.pause();
      else this.resume(this.environment);
    }
    if (!this.musicEnabled) {
      this.clearTimer();
      this.release(this.music);
      this.music = undefined;
      this.waiting = false;
      return;
    }
    if (this.paused) {
      this.clearTimer();
      this.music?.audio.pause();
      return;
    }
    if (this.music) {
      this.musicVolume(this.music);
      this.resume(this.music);
    } else if (this.waiting && this.timer === undefined) {
      this.timer = setTimeout(
        () => {
          this.timer = undefined;
          this.waiting = false;
          this.nextMusic();
        },
        Math.max(0, this.config.intervalMs),
      );
    } else if (!this.waiting) {
      this.nextMusic();
    }
  }
  snapshot() {
    return {
      mapId: this.mapId,
      sourceSceneId: this.config?.sceneId,
      musicUrl: this.music?.url,
      musicVolume: this.music?.audio.volume,
      environmentUrl: this.environment?.url,
      musicPlaying:
        !!this.music &&
        !this.music.audio.paused &&
        this.music.audio.readyState >= 2,
      environmentPlaying:
        !!this.environment &&
        !this.environment.audio.paused &&
        this.environment.audio.readyState >= 2,
      musicWaiting: this.waiting,
      playbackBlocked: this.blocked,
      activeElements: Number(!!this.music) + Number(!!this.environment),
      failedTracks: this.failedTracks.size,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }
}
