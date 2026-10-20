import { ARENA_FIGHTERS, type ArenaState, type ArenaCharacter } from "./rules";
import type { AnimationDef, EntityManifest } from "../entities/types";
import type { PresentationConfig } from "../presentation";
type Sheet = { anim: AnimationDef; image: HTMLImageElement; reference: number };
type AudioSettings = () => { enabled: boolean; volume: number };
export class ArenaView {
  private ctx: CanvasRenderingContext2D;
  private sheets = new Map<string, Sheet>();
  private pending = new Set<string>();
  private manifests = new Map<ArenaCharacter, EntityManifest>();
  private presentation?: PresentationConfig;
  private state?: ArenaState;
  private eventAt = 0;
  private eventId = 0;
  private raf = 0;
  private destroyed = false;
  private lastDraw = 0;
  private audio = new Set<HTMLAudioElement>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(
    private canvas: HTMLCanvasElement,
    private error: (message: string) => void,
    private settings: AudioSettings,
  ) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 1000 * dpr;
    canvas.height = 330 * dpr;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
    this.raf = requestAnimationFrame(this.draw);
    void fetch("/assets/presentation.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!this.destroyed) this.presentation = data;
      })
      .catch(() => {
        if (!this.destroyed)
          this.error("Os efeitos da arena não puderam ser carregados.");
      });
  }
  update(state: ArenaState) {
    const changedRoom = this.state?.code !== state.code;
    if (changedRoom) {
      this.eventId = 0;
      this.stopAudio();
      this.sheets.clear();
      this.pending.clear();
      this.manifests.clear();
    }
    this.state = state;
    const event = state.log.at(-1);
    // Reconnection restores state without replaying the entire match's sounds.
    if (changedRoom) {
      this.eventId = event?.id || 0;
      this.eventAt = -10000;
    } else if (event && event.id !== this.eventId) {
      this.eventId = event.id;
      this.eventAt = performance.now();
      this.stopAudio();
      const p = state.players[event.seat];
      const action =
        event.action === "skill"
          ? p.character === "sakura"
            ? "SP_skill2"
            : "SP_skill1"
          : event.action === "attack"
            ? "A_1hit"
            : "C_idle";
      this.sound(p.character, action);
    }
    for (const p of state.players) void this.load(p.character);
  }
  private async sheet(key: string, anim: AnimationDef, reference: number) {
    if (this.pending.has(key) || this.destroyed) return;
    this.pending.add(key);
    try {
      const image = new Image();
      image.src = anim.url;
      await image.decode();
      if (!this.destroyed) this.sheets.set(key, { image, anim, reference });
    } catch {
      if (!this.destroyed)
        this.error(
          "Uma animação da arena não pôde ser carregada. Os turnos continuam sincronizados.",
        );
    }
  }
  private async load(character: ArenaCharacter) {
    const key = "manifest:" + character;
    if (this.pending.has(key)) return;
    this.pending.add(key);
    try {
      const r = await fetch(
        `/assets/characters/${ARENA_FIGHTERS[character].folder}/manifest.json`,
      );
      if (!r.ok) throw new Error();
      const m: EntityManifest = await r.json();
      if (this.destroyed) return;
      this.manifests.set(character, m);
      const idle = m.modes.battle?.animations.C_idle;
      if (idle)
        await this.sheet(
          character + ":C_idle",
          idle,
          m.modes.battle!.referenceHeight,
        );
    } catch {
      if (!this.destroyed)
        this.error("Não foi possível carregar este ninja na arena.");
    }
  }
  private sound(character: ArenaCharacter, action: string) {
    if (!this.presentation || !this.settings().enabled || document.hidden)
      return;
    const cues = this.presentation.characters[character].actions[action] || [];
    // Keep a short sequence with original timing and at most four clips per action.
    for (const cue of cues.filter((c) => c.time <= 1300).slice(0, 4)) {
      const url = this.presentation.sounds[cue.sound]?.urls[0];
      if (!url) continue;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        const settings = this.settings();
        if (this.destroyed || document.hidden || !settings.enabled) return;
        const audio = new Audio(url);
        audio.volume = Math.min(1, Math.max(0, settings.volume * cue.volume));
        this.audio.add(audio);
        audio.onended = audio.onerror = () => this.audio.delete(audio);
        void audio.play().catch(() => this.audio.delete(audio));
      }, cue.time);
      this.timers.add(timer);
    }
  }
  private stopAudio() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    for (const audio of this.audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.audio.clear();
  }
  private drawSheet(
    sheet: Sheet,
    x: number,
    y: number,
    scale: number,
    frame: number,
    flip = false,
  ) {
    const { anim: a, image } = sheet,
      cols = Math.floor(image.width / a.frameWidth),
      w = a.frameWidth * scale,
      h = a.frameHeight * scale;
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    c.imageSmoothingEnabled = true;
    c.drawImage(
      image,
      (frame % cols) * a.frameWidth,
      Math.floor(frame / cols) * a.frameHeight,
      a.frameWidth,
      a.frameHeight,
      -w * (a.origin?.[0] ?? 0.5),
      -h * (a.origin?.[1] ?? 1),
      w,
      h,
    );
    c.restore();
  }
  private frame(a: AnimationDef, elapsed: number, clamp = false) {
    const count = a.timeline?.length || a.frames,
      step = Math.max(0, Math.floor((elapsed / 1000) * a.fps));
    const index = clamp ? Math.min(step, count - 1) : step % count;
    return a.timeline?.[index] ?? index;
  }
  private draw = (time: number) => {
    if (this.destroyed) return;
    if (document.hidden || time - this.lastDraw < 1000 / 24) {
      this.raf = requestAnimationFrame(this.draw);
      return;
    }
    this.lastDraw = time;
    const c = this.ctx;
    c.clearRect(0, 0, 1000, 330);
    const s = this.state,
      event = s?.log.at(-1),
      elapsed = time - this.eventAt;
    if (s)
      s.players.forEach((p, seat) => {
        let action = p.hp <= 0 ? "C_dead" : "C_idle";
        if (event?.seat === seat && elapsed < 1300 && p.hp > 0)
          action =
            event.action === "skill"
              ? p.character === "sakura"
                ? "SP_skill2"
                : "SP_skill1"
              : event.action === "attack"
                ? "A_1hit"
                : "C_idle";
        const mode = this.manifests.get(p.character)?.modes.battle,
          anim = mode?.animations[action];
        if (anim)
          void this.sheet(
            p.character + ":" + action,
            anim,
            mode!.referenceHeight,
          );
        const sheet =
          this.sheets.get(p.character + ":" + action) ||
          this.sheets.get(p.character + ":C_idle");
        const x = seat === 0 ? 270 : 730,
          y = 270;
        c.fillStyle = "#071c2266";
        c.beginPath();
        c.ellipse(x, y + 2, 43, 9, 0, 0, Math.PI * 2);
        c.fill();
        if (sheet)
          this.drawSheet(
            sheet,
            x,
            y,
            155 / Math.max(1, sheet.reference),
            this.frame(
              sheet.anim,
              action === "C_idle" ? time : elapsed,
              action === "C_dead",
            ),
            seat === 1,
          );
        if (
          event &&
          elapsed < 1400 &&
          ((event.damage && event.seat !== seat) ||
            (event.heal && event.seat === seat))
        ) {
          c.font = "bold 28px system-ui";
          c.textAlign = "center";
          c.fillStyle = event.seat === seat ? "#b8f7a5" : "#ffe6a6";
          c.strokeStyle = "#12231f";
          c.lineWidth = 5;
          const text =
            event.seat === seat ? "+" + event.heal : "−" + event.damage;
          const ty = y - 175 - elapsed / 60;
          c.strokeText(text, x, ty);
          c.fillText(text, x, ty);
        }
      });
    if (
      s &&
      event &&
      elapsed < 1600 &&
      this.presentation &&
      (event.action === "skill" || event.action === "attack")
    ) {
      const character = s.players[event.seat].character,
        heal = character === "sakura" && event.action === "skill";
      const key =
        event.action === "attack"
          ? "DaJiTeXiao"
          : character === "naruto"
            ? "luoxuanwan"
            : character === "sasuke"
              ? "qianniao"
              : "hphuifu";
      const anim = this.presentation.effects[key];
      if (anim) {
        void this.sheet("effect:" + key, anim, 126);
        const sheet = this.sheets.get("effect:" + key);
        if (sheet) {
          const target = event.seat === 0 ? 730 : 270,
            from = event.seat === 0 ? 270 : 730;
          const travel = Math.min(1, elapsed / 800),
            x = heal
              ? from
              : event.action === "skill"
                ? from + (target - from) * travel
                : target;
          const count = anim.timeline?.length || anim.frames,
            index = Math.min(count - 1, Math.floor((elapsed / 1600) * count));
          this.drawSheet(
            sheet,
            x,
            heal ? 270 : 205,
            heal ? 0.95 : 0.65,
            anim.timeline?.[index] ?? index,
            event.seat === 1 && !heal,
          );
          if (import.meta.env.DEV) this.canvas.dataset.effect = key;
        }
      }
    }
    this.raf = requestAnimationFrame(this.draw);
  };
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    this.sheets.clear();
    this.manifests.clear();
  }
}
