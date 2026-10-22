import { t } from "../i18n/core.ts";
import { getPreferences } from "../preferences.ts";
export type EntityAudioRef = {
  name: string;
  url: string;
};
export type EntityAudioCatalog = Record<string, EntityAudioRef>;
export type ActorSound = {
  method: 1 | 2;
  volume: number;
  maxPlayback: number;
  voice?: boolean;
  clips: {
    url: string;
    weight: number;
    enabled: boolean;
  }[];
};
export type ActorAudio = {
  id: string;
  name: string;
  durations: Record<string, number>;
  actions: Record<
    string,
    {
      time: number;
      sound: string;
      volume: number;
    }[]
  >;
  sounds: Record<string, ActorSound>;
};
type Port = Pick<
  HTMLAudioElement,
  | "src"
  | "preload"
  | "volume"
  | "paused"
  | "play"
  | "pause"
  | "load"
  | "removeAttribute"
  | "onended"
  | "onerror"
>;
type Voice = {
  audio: Port;
  owner: string;
  sound: string;
  gain: number;
  isVoice: boolean;
};
export type AudioSchedule = (delay: number, run: () => void) => () => void;
type FetchActor = (url: string, signal: AbortSignal) => Promise<ActorAudio>;
export function chooseActorClip(
  sound: ActorSound,
  last: number | undefined,
  random: number,
) {
  const candidates = sound.clips
    .map((clip, index) => ({ clip, index }))
    .filter(
      ({ clip, index }) =>
        clip.weight > 0 &&
        (sound.method !== 2 || index !== last || sound.clips.length === 1),
    );
  const total = candidates.reduce((sum, { clip }) => sum + clip.weight, 0);
  let target = Math.max(0, Math.min(0.999999999, random)) * total;
  for (const { clip, index } of candidates) {
    target -= clip.weight;
    if (target < 0) return index;
  }
  return undefined;
}
export function validateActorAudio(data: ActorAudio, id: string) {
  if (data.id !== id || !data.actions || !data.sounds || !data.durations)
    throw new Error(t("audio.entity-audio.188a629d57"));
  for (const [name, events] of Object.entries(data.actions)) {
    if (
      !["A_1hit", "C_dead"].includes(name) ||
      !Array.isArray(events) ||
      events.length > 256
    )
      throw new Error(t("audio.entity-audio.6f2ab72f3b"));
    if (!Number.isFinite(data.durations[name]) || data.durations[name] <= 0)
      throw new Error(t("audio.entity-audio.38c961b70e"));
    for (const event of events)
      if (
        !Number.isFinite(event.time) ||
        event.time < 0 ||
        !Number.isFinite(event.volume) ||
        event.volume < 0 ||
        event.volume > 1 ||
        !data.sounds[event.sound]
      )
        throw new Error(t("audio.entity-audio.fd8b63922a"));
  }
  for (const sound of Object.values(data.sounds)) {
    if (
      ![1, 2].includes(sound.method) ||
      !Number.isFinite(sound.volume) ||
      sound.volume < 0 ||
      sound.volume > 1 ||
      !Number.isInteger(sound.maxPlayback) ||
      sound.maxPlayback < 1 ||
      sound.maxPlayback > 4 ||
      !Array.isArray(sound.clips) ||
      !sound.clips.length ||
      sound.clips.length > 32
    )
      throw new Error(t("audio.entity-audio.c134f8c755"));
    for (const clip of sound.clips)
      if (
        !/^\/assets\/audio\/sfx\/\d+\/\d+\.mp3$/.test(clip.url) ||
        !Number.isFinite(clip.weight) ||
        clip.weight < 0 ||
        typeof clip.enabled !== "boolean"
      )
        throw new Error(t("audio.entity-audio.7847e185cf"));
  }
  return data;
}
// Small manifests load serially only for the current cast. Short originals use
// disposable HTMLAudio elements, avoiding a decoded-PCM cache of every enemy.
export class EntityAudioPlayer {
  private ids: string[] = [];
  private models = new Map<string, ActorAudio>();
  private pending = new Map<string, Set<() => void>>();
  private voices = new Set<Voice>();
  private last = new Map<string, number>();
  private revision = 0;
  private controller?: AbortController;
  private queue = Promise.resolve();
  private enabled = false;
  private paused = false;
  private disposed = false;
  private volume = 0.4;
  private failed = new Set<string>();
  private played = 0;
  private dropped = 0;
  private lastDropped?: {
    id: string;
    action: string;
    sound: string;
    budget: number;
  };
  private failures = 0;
  private lastPlayed?: {
    id: string;
    action: string;
    sound: string;
    owner: string;
    url: string;
  };
  constructor(
    private catalog: EntityAudioCatalog,
    private schedule: AudioSchedule,
    private budget: (priority?: boolean) => number,
    private factory: () => Port = () => new Audio(),
    private fetchActor: FetchActor = async (url, signal) => {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error(t("audio.entity-audio.0f3cb82e6b"));
      return response.json();
    },
    private random: () => number = Math.random,
  ) {}
  setActors(ids: string[]) {
    if (this.disposed) return;
    this.clear();
    this.revision++;
    this.controller?.abort();
    this.ids = [...new Set(ids)]
      .filter((id) => !!this.catalog[id])
      .slice(0, 12);
    for (const id of this.models.keys())
      if (!this.ids.includes(id)) this.models.delete(id);
    this.last.clear();
    this.failed.clear();
    this.refresh();
  }
  settings(enabled: boolean, volume: number) {
    if (this.disposed) return;
    const changed = this.enabled !== enabled;
    this.enabled = enabled;
    this.volume = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : 0;
    for (const voice of this.voices)
      voice.audio.volume =
        voice.gain *
        this.volume *
        (voice.isVoice ? getPreferences().voiceVolume : 1);
    if (changed && !enabled) {
      this.revision++;
      this.controller?.abort();
      this.clear();
      this.models.clear();
    }
    if (changed && enabled) {
      this.failed.clear();
      this.refresh();
    }
  }
  private refresh() {
    const revision = this.revision;
    if (!this.enabled || this.disposed) return;
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (revision !== this.revision || !this.enabled || this.disposed)
          return;
        const controller = (this.controller = new AbortController());
        for (const id of this.ids) {
          if (revision !== this.revision || this.disposed || !this.enabled)
            return;
          if (this.models.has(id) || this.failed.has(id)) continue;
          try {
            const model = validateActorAudio(
              await this.fetchActor(this.catalog[id].url, controller.signal),
              id,
            );
            if (revision !== this.revision || this.disposed || !this.enabled)
              return;
            this.models.set(id, model);
          } catch {
            if (revision === this.revision && !this.disposed && this.enabled) {
              this.failed.add(id);
              this.failures++;
            }
          }
        }
      });
  }
  pause(value: boolean) {
    if (this.disposed || this.paused === value) return;
    this.paused = value;
    for (const voice of this.voices)
      if (value) voice.audio.pause();
      else this.start(voice);
    this.trim();
  }
  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.audio.onended = voice.audio.onerror = null;
    voice.audio.pause();
    voice.audio.removeAttribute("src");
    voice.audio.load();
  }
  private clearOwner(owner: string) {
    for (const cancel of this.pending.get(owner) || []) cancel();
    this.pending.delete(owner);
    for (const voice of [...this.voices])
      if (voice.owner === owner) this.release(voice);
  }
  private clear() {
    for (const owner of this.pending.keys()) this.clearOwner(owner);
    for (const voice of [...this.voices]) this.release(voice);
  }
  trim(limit = this.budget()) {
    for (const voice of [...this.voices].slice(
      0,
      Math.max(0, this.voices.size - Math.max(0, limit)),
    ))
      this.release(voice);
  }
  private start(voice: Voice) {
    void voice.audio.play().catch(() => {
      if (this.voices.has(voice)) {
        this.failures++;
        this.release(voice);
      }
    });
  }
  action(
    id: string,
    action: string,
    duration: number,
    owner: "hero" | "enemy",
    instanceId?: string,
  ) {
    const channel = instanceId ? `${owner}:${instanceId}` : owner;
    this.clearOwner(channel);
    if (
      !this.enabled ||
      this.paused ||
      this.disposed ||
      !this.ids.includes(id) ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return;
    const model = this.models.get(id),
      events = model?.actions[action];
    if (!model || !events) return;
    const end = model.durations[action];
    const pending = new Set<() => void>();
    this.pending.set(channel, pending);
    for (const event of events) {
      const cancel = this.schedule((event.time * duration) / end, () => {
        // Timer cancellation may race with dispatch. An old action cannot
        // play a stale clip or remove the newer action's pending channel.
        if (this.pending.get(channel) !== pending) return;
        pending.delete(cancel);
        if (!pending.size) this.pending.delete(channel);
        if (!this.enabled || this.paused || this.disposed) return;
        const sound = model.sounds[event.sound];
        const death = action === "C_dead";
        const available = Math.min(4, this.budget(death));
        if (death) this.trim(Math.max(0, available - 1));
        if (
          this.voices.size >= available ||
          [...this.voices].filter((v) => v.sound === event.sound).length >=
            sound.maxPlayback
        ) {
          this.dropped++;
          this.lastDropped = {
            id,
            action,
            sound: event.sound,
            budget: available,
          };
          return;
        }
        const index = chooseActorClip(
          sound,
          this.last.get(event.sound),
          this.random(),
        );
        if (index === undefined) return;
        this.last.set(event.sound, index);
        const clip = sound.clips[index];
        // Original random player consumes disabled selections without retry.
        if (!clip.enabled) return;
        const gain = Math.max(
          0,
          Math.min(1, event.volume * sound.volume * 0.5),
        );
        const voice: Voice = {
          audio: this.factory(),
          owner: channel,
          sound: event.sound,
          gain,
          isVoice: !!sound.voice,
        };
        voice.audio.preload = "none";
        voice.audio.src = clip.url;
        voice.audio.volume =
          gain *
          this.volume *
          (voice.isVoice ? getPreferences().voiceVolume : 1);
        voice.audio.onended = () => this.release(voice);
        voice.audio.onerror = () => {
          this.failures++;
          this.release(voice);
        };
        this.voices.add(voice);
        this.start(voice);
        this.played++;
        this.lastPlayed = {
          id,
          action,
          sound: event.sound,
          owner: channel,
          url: clip.url,
        };
      });
      pending.add(cancel);
    }
  }
  snapshot() {
    return {
      ready: [...this.models.keys()],
      actors: [...this.ids],
      failed: [...this.failed],
      failures: this.failures,
      voices: this.voices.size,
      pending: [...this.pending.values()].reduce(
        (sum, set) => sum + set.size,
        0,
      ),
      played: this.played,
      lastPlayed: this.lastPlayed,
      dropped: this.dropped,
      lastDropped: this.lastDropped,
    };
  }
  dispose() {
    this.disposed = true;
    this.revision++;
    this.controller?.abort();
    this.clear();
    this.models.clear();
    this.ids = [];
    this.last.clear();
  }
}
