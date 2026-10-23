import Phaser from "phaser";
import { t, th, errorText } from "../i18n/core";
import { queueAnimation, animationFrames } from "../entities/animation-texture";
import { animationOrigin } from "../entities/animation-origin";
import { actorVisualScale } from "../entities/visual-rules";
import type { ActorMode, AnimationDef, EntityManifest } from "../entities/types";
import { NativeNavigation, advancePath, facing, type Point, type NativeGrid } from "../world/navigation";
import { withSceneGeometry } from "../world/scene-geometry";
import { meleeProbe, MELEE_RANGE } from "../world/melee";
import { NativeForegroundLayer } from "../world/native-foreground";
import { foregroundPlan } from "../world/foreground-plan";
import { loadSceneAssets } from "../assets/scene-loader";
import { NativeEffectPlayer, nativeEffectKey, type NativeSkillBinding } from "../effects/native-player";
import type { PresentationConfig } from "../presentation";
import type { WorldMap } from "../world/maps";
import type { RuntimeEntry } from "../assets/runtime-index";
import { CHARACTER_IDS } from "../progression/character-progress";
import { labAttack, labLocomotion } from "./lab-model";
import "./combat-lab.css";

type LabManifest = Omit<EntityManifest, "modes"> & { sourceOnly?: boolean; modes: Record<string, { animations: Record<string, AnimationDef>; referenceHeight: number; status: string } | undefined> };
type LabData = { entities: Record<string, RuntimeEntry & { sourceOnly?: boolean }>; maps: WorldMap[] };
type Read = (path: string) => Promise<any>;
type Body = { sprite: Phaser.GameObjects.Sprite; manifest: LabManifest; definition?: AnimationDef; mode?: string; action?: string };

/** Admin-only sandbox, deliberately independent of cloud/profile/journey modules. */
export function mountCombatLab(host: HTMLElement, read: Read, initialId = "11000101") {
  host.classList.add("combat-lab");
  host.innerHTML = `<p class="lab-explainer">${th("lab.explainer")}</p>
    <div class="lab-controls">
      <label>${th("lab.character")}<input data-lab-hero list="lab-models" value="11000101"></label>
      <label>${th("lab.target")}<input data-lab-target list="lab-models" value="19000301"></label>
      <label>${th("lab.map")}<select data-lab-map></select></label>
      <label>${th("lab.mode")}<select data-lab-mode><option value="world">${th("lab.world")}</option><option value="battle">${th("lab.battle")}</option></select></label>
      <label>${th("lab.action")}<select data-lab-action></select></label>
      <label>${th("lab.pointer")}<select data-lab-pointer><option value="move">${th("lab.move")}</option><option value="hero">${th("lab.placeHero")}</option><option value="target">${th("lab.placeTarget")}</option></select></label>
      <label>${th("lab.speed")}<input data-lab-speed type="range" min="0.25" max="2" step="0.25" value="1"></label>
      <label>${th("lab.zoom")}<input data-lab-zoom type="range" min="1" max="5" step="0.1" value="2.2"></label>
      <label>${th("lab.frame")}<input data-lab-frame type="range" min="0" max="0" step="1" value="0"></label>
    </div><datalist id="lab-models"></datalist>
    <div class="lab-toolbar">
      <button data-lab-load>${th("lab.load")}</button><button data-lab-replay class="secondary">${th("lab.replay")}</button>
      <button data-lab-pause class="secondary">${th("lab.pause")}</button>
      <button data-lab-basic>${th("lab.basic")}</button><button data-lab-skill>${th("lab.skill")}</button>
      <button data-lab-near class="secondary">${th("lab.near")}</button><button data-lab-far class="secondary">${th("lab.far")}</button>
      <label><input data-lab-bounds type="checkbox" checked>${th("lab.bounds")}</label>
      <label><input data-lab-loop type="checkbox" checked>${th("lab.loop")}</label>
      <label><input data-lab-flip type="checkbox">${th("lab.flip")}</label>
    </div>
    <p class="lab-help">${th("lab.controls")} <span class="lab-range-key">${th("lab.legendRange")}</span> · <span class="lab-origin-key">${th("lab.legendVisual")}</span></p>
    <div class="lab-stage" data-lab-stage></div>
    <div class="lab-diagnostics">
      <div>${th("lab.distance")}<strong data-lab-distance>—</strong></div>
      <div>${th("lab.contact")}<strong data-lab-contact>—</strong></div>
      <div>${th("lab.timeline")}<strong data-lab-timeline>—</strong></div>
      <div>${th("lab.effect")}<strong data-lab-effect>—</strong></div>
    </div>
    <p data-lab-status role="status" class="lab-report">${th("lab.loading")}</p>
    <p class="lab-help">${th("lab.compatibility")}</p>`;
  const input = (name: string) => host.querySelector<HTMLInputElement>(`[data-lab-${name}]`)!;
  const select = (name: string) => host.querySelector<HTMLSelectElement>(`[data-lab-${name}]`)!;
  const button = (name: string) => host.querySelector<HTMLButtonElement>(`[data-lab-${name}]`)!;
  const status = host.querySelector<HTMLElement>("[data-lab-status]")!;
  const stage = host.querySelector<HTMLElement>("[data-lab-stage]")!;
  const output = (name: string, value: string) => { host.querySelector<HTMLElement>(`[data-lab-${name}]`)!.textContent = value; };
  let data: LabData, presentation: PresentationConfig;
  let game: Phaser.Game | undefined, scene: LabScene | undefined;
  let disposed = false, generation = 0, paused = false, busy = false;
  const abort = new AbortController();
  function report(message: string, error = false) { if (!disposed) { status.textContent = message; status.classList.toggle("lab-error", error); } }
  function pause(value: boolean) { paused = value; button("pause").textContent = t(value ? "lab.resume" : "lab.pause"); }
  async function json<T>(url: string): Promise<T> {
    const reply = await fetch(url, { cache: "no-cache", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
    if (!reply.ok) throw new Error(t("lab.resourceFailed"));
    return reply.json();
  }
  async function manifest(id: string) {
    const entry = data.entities[id];
    if (!entry || !/^\/assets\//.test(entry.url)) throw new Error(t("lab.chooseModel"));
    const result = await json<LabManifest>(entry.url);
    if (result.id !== id) throw new Error(t("lab.chooseModel"));
    return result;
  }
  function actions(model: LabManifest) {
    const previous = select("mode").value;
    const modes = Object.keys(model.modes).filter(mode => Object.keys(model.modes[mode]?.animations || {}).length);
    select("mode").replaceChildren(...modes.map(mode => new Option(mode === "world" ? t("lab.world") : mode === "battle" ? t("lab.battle") : t("lab.source"), mode)));
    select("mode").value = modes.includes(previous) ? previous : modes.includes("world") ? "world" : modes[0] || "";
    const available = Object.keys(model.modes[select("mode").value]?.animations || {});
    select("action").replaceChildren(...available.map(name => new Option(name, name)));
    select("action").value = available.includes("idle_0") ? "idle_0" : available.includes("C_idle") ? "C_idle" : available[0] || "";
  }
  async function destroyGame() {
    scene = undefined;
    const old = game; game = undefined;
    if (!old) return;
    await new Promise<void>(resolve => {
      old.events.once(Phaser.Core.Events.DESTROY, resolve);
      old.destroy(true); old.loop.wake();
    });
  }
  input("hero").value = initialId;
  const bindingFor = (model: LabManifest) => Object.values(presentation.nativeSkills || {}).find(binding => binding.modelId === model.id);
  class LabScene extends Phaser.Scene {
    hero!: Body; target!: Body;
    navigation!: NativeNavigation;
    path: Point[] = [];
    debug!: Phaser.GameObjects.Graphics;
    effect!: NativeEffectPlayer;
    ready = false;
    failed = false;
    private lastUi = 0;
    private poseToken = 0;
    private walkPose = "";
    private wasMoving = false;
    private lastDirection = 0;
    private clips = new Map<string, true>();
    private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
    private labels: Phaser.GameObjects.Text[] = [];
    constructor(private map: WorldMap, private grid: NativeGrid, private heroModel: LabManifest, private targetModel: LabManifest, private request: number) { super("admin-combat-lab"); }
    preload() {
      this.load.image("map-" + this.map.id, this.map.background);
      this.load.image("map-" + this.map.id + "-foreground", foregroundPlan(this.map, this.game.renderer.type === Phaser.WEBGL).url);
      this.load.once("loaderror", () => { this.failed = true; report(t("lab.resourceFailed"), true); });
    }
    create() {
      if (disposed || this.request !== generation || this.failed) return;
      scene = this;
      this.navigation = new NativeNavigation(this.grid);
      this.add.image(0, 0, "map-" + this.map.id).setOrigin(0).setDisplaySize(this.map.width, this.map.height);
      const foreground = new NativeForegroundLayer(this); foreground.setMap(this.map);
      this.effect = new NativeEffectPlayer(this);
      this.events.once("shutdown", () => { foreground.destroy(); this.effect.dispose(); this.ready = false; });
      const start = this.navigation.nearest(this.map.spawn);
      if (!start) { report(t("lab.noGround"), true); return; }
      const targetPosition = this.navigation.nearest({ x: start.x + 22, y: start.y }) || start;
      this.hero = { sprite: this.add.sprite(start.x, start.y, "__MISSING").setVisible(false), manifest: this.heroModel };
      this.target = { sprite: this.add.sprite(targetPosition.x, targetPosition.y, "__MISSING").setVisible(false), manifest: this.targetModel };
      this.labels = [this.hero, this.target].map(body => this.add.text(body.sprite.x, body.sprite.y - 55, body.manifest.name, { fontSize: "8px", fontFamily: "Segoe UI", color: "#f4e7c4", backgroundColor: "#13291fdd", padding: { x: 4, y: 3 } }).setOrigin(.5).setResolution(2));
      this.debug = this.add.graphics().setDepth(20001);
      this.cameras.main.setBounds(0, 0, this.map.width, this.map.height).setZoom(Number(input("zoom").value)).startFollow(this.hero.sprite, true, .15, .15);
      if (this.input.keyboard) this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as Record<string, Phaser.Input.Keyboard.Key>;
      const canvas = this.game.canvas; canvas.tabIndex = 0;
      const preventScroll = (event: KeyboardEvent) => { if (/^(Arrow|[wasd]$)/i.test(event.key)) event.preventDefault(); };
      canvas.addEventListener("keydown", preventScroll);
      this.events.once("shutdown", () => canvas.removeEventListener("keydown", preventScroll));
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.ready || pointer.event.target !== canvas) return;
        canvas.focus();
        const point = this.navigation.nearest({ x: pointer.worldX, y: pointer.worldY }, 35);
        if (!point) { report(t("lab.noGround"), true); return; }
        if (select("pointer").value === "target" || pointer.event.shiftKey) this.target.sprite.setPosition(point.x, point.y);
        else if (select("pointer").value === "hero") { this.path = []; this.hero.sprite.setPosition(point.x, point.y); }
        else this.path = this.navigation.path(this.hero.sprite, point);
      });
      void Promise.all([
        this.pose(this.hero, select("mode").value as ActorMode, select("action").value),
        this.pose(this.target, this.target.manifest.modes.world ? "world" : this.target.manifest.modes.battle ? "battle" : "source", this.target.manifest.modes.world?.animations.idle_0 ? "idle_0" : "C_idle"),
      ]).then(() => {
        if (!this.sys.isActive() || disposed || this.request !== generation) return;
        this.ready = true; report(t(this.heroModel.sourceOnly ? "lab.sourceReady" : "lab.ready"));
      }).catch(error => report(errorText(error), true));
    }
    async pose(body: Body, mode: string, requested: string, once = false) {
      const animations = body.manifest.modes[mode]?.animations;
      const action = animations?.[requested] ? requested : Object.keys(animations || {})[0];
      const definition = animations?.[action];
      if (!definition) throw new Error(t("lab.noAnimation"));
      const token = body === this.hero ? ++this.poseToken : 0;
      const key = `lab:${body.manifest.id}:${mode}-${action}`;
      const binding = body === this.hero && mode === "battle" ? bindingFor(body.manifest) : undefined;
      await loadSceneAssets(this, () => {
        if (!this.textures.exists(key)) queueAnimation(this, key, definition);
        if (binding?.action === action && !this.textures.exists(nativeEffectKey(binding))) queueAnimation(this, nativeEffectKey(binding), binding.animation);
      }, () => this.textures.exists(key) && (!binding || binding.action !== action || this.textures.exists(nativeEffectKey(binding))));
      if (disposed || !this.sys.isActive() || (body === this.hero && token !== this.poseToken)) return;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: animationFrames(key, definition), frameRate: definition.fps, repeat: once ? 0 : input("loop").checked ? -1 : 0 });
      body.definition = definition; body.mode = mode; body.action = action;
      body.sprite.setScale(actorVisualScale(body.manifest.id, mode === "battle" ? "battle" : "world", body.manifest.modes[mode]!.referenceHeight, definition.rigScale)).setVisible(true).play({ key, repeat: once ? 0 : input("loop").checked ? -1 : 0 });
      this.clips.delete(key); this.clips.set(key, true);
      const keep = new Set([this.hero.sprite.anims.currentAnim?.key, this.target.sprite.anims.currentAnim?.key]);
      const bytes = () => [...this.clips.keys()].reduce((sum, name) => sum + (this.textures.exists(name) ? this.textures.get(name).source.reduce((n, page) => n + page.width * page.height * 4, 0) : 0), 0);
      for (const old of this.clips.keys()) {
        if (this.clips.size <= 12 && bytes() <= 128 * 1024 * 1024) break;
        if (keep.has(old)) continue;
        this.anims.remove(old); this.textures.remove(old); this.clips.delete(old);
      }
      stage.dataset.textureBytes = String(bytes());
      if (body === this.hero) {
        select("mode").value = mode; actions(body.manifest); select("action").value = action;
        input("frame").max = String((definition.timeline?.length || definition.frames) - 1); input("frame").value = "0";
        this.effect.clear();
        if (binding?.action === action) this.effect.play(body.sprite, binding);
        output("effect", t(binding?.action === action ? "lab.boundEffect" : "lab.noBoundEffect"));
      }
    }
    async replay() {
      if (!this.ready) return;
      this.path = []; this.wasMoving = false; pause(false);
      await this.pose(this.hero, select("mode").value as ActorMode, select("action").value);
    }
    step() {
      const animation = this.hero.sprite.anims.currentAnim;
      if (!animation) return;
      pause(true);
      this.hero.sprite.anims.pause();
      this.hero.sprite.anims.setCurrentFrame(animation.frames[Number(input("frame").value)]);
      const binding = this.hero.mode === "battle" ? bindingFor(this.hero.manifest) : undefined;
      if (binding && binding.action === this.hero.action) this.effect.play(this.hero.sprite, binding);
    }
    placeTarget(near: boolean) {
      const origin = this.hero.sprite;
      const candidates = this.navigation.pointsWithin(origin, near ? 27 : 100).filter(p => Math.hypot(p.x - origin.x, p.y - origin.y) > (near ? 8 : 50) && this.navigation.clear(origin, p));
      const goal = { x: origin.x + (near ? 22 : 65), y: origin.y };
      candidates.sort((a, b) => Math.hypot(a.x - goal.x, a.y - goal.y) - Math.hypot(b.x - goal.x, b.y - goal.y));
      if (candidates[0]) this.target.sprite.setPosition(candidates[0].x, candidates[0].y);
      else report(t("lab.noGround"), true);
    }
    async attack(kind: "basic" | "skill") {
      if (!this.ready || busy) return;
      const contact = meleeProbe(this.hero.sprite, this.target.sprite, this.navigation);
      const sourceOnly = this.hero.manifest.sourceOnly === true;
      const moving = this.path.length > 0;
      const result = sourceOnly ? { ...contact, hit: contact.reachable && !moving && !paused, damage: 0, reason: paused ? "paused" : moving ? "moving" : contact.reason } : labAttack(this.hero.manifest.id, kind, this.hero.sprite, this.target.sprite, this.navigation, moving, paused);
      report(result.hit ? sourceOnly ? t("lab.sourceHit") : t("lab.hit", { damage: result.damage }) : t("lab.miss") + " " + t(result.reason === "blocked" ? "lab.blocked" : result.reason === "paused" ? "lab.paused" : result.reason === "moving" ? "lab.moving" : "lab.outOfRange"));
      status.dataset.hit = String(result.hit); status.dataset.damage = String(result.damage);
      if (!result.hit) return;
      busy = true; this.wasMoving = false;
      try {
        const binding = bindingFor(this.hero.manifest);
        const starter = Object.entries(CHARACTER_IDS).find(([, id]) => id === this.hero.manifest.id)?.[0];
        const action = kind === "skill" ? binding?.action || (starter ? presentation.characters[starter]?.action || "SP_skill1" : "A_1hit") : "A_1hit";
        const mode = sourceOnly ? "source" : "battle";
        select("mode").value = mode; actions(this.hero.manifest);
        select("mode").value = mode;
        if (this.hero.manifest.modes[mode]?.animations[action]) {
          select("action").value = action;
          this.hero.sprite.setFlipX(this.target.sprite.x < this.hero.sprite.x);
          input("flip").checked = this.hero.sprite.flipX;
          await this.pose(this.hero, mode, action, true);
        } else report((sourceOnly ? t("lab.sourceHit") : t("lab.hit", { damage: result.damage })) + " " + t("lab.noAnimation"));
      } finally { busy = false; }
    }
    private walk(moving: boolean) {
      const clip = labLocomotion(this.hero.manifest.modes, moving, this.lastDirection);
      if (!clip || this.walkPose === clip.action || this.hero.action === clip.action) return;
      this.walkPose = clip.action;
      void this.pose(this.hero, clip.mode, clip.action).catch(error => report(errorText(error), true)).finally(() => { if (this.walkPose === clip.action) this.walkPose = ""; });
    }
    update(time: number, delta: number) {
      if (disposed || this.request !== generation || !this.ready || !this.hero?.definition || !this.target?.definition) return;
      const canvasFocused = document.activeElement === this.game.canvas;
      const dx = canvasFocused ? Number(!!(this.keys.D?.isDown || this.keys.RIGHT?.isDown)) - Number(!!(this.keys.A?.isDown || this.keys.LEFT?.isDown)) : 0;
      const dy = canvasFocused ? Number(!!(this.keys.S?.isDown || this.keys.DOWN?.isDown)) - Number(!!(this.keys.W?.isDown || this.keys.UP?.isDown)) : 0;
      if (!paused && !busy && (dx || dy)) {
        const length = Math.hypot(dx, dy), distance = 45 * Math.min(delta, 100) / 1000;
        const next = { x: this.hero.sprite.x + dx / length * distance, y: this.hero.sprite.y + dy / length * distance };
        if (this.navigation.clear(this.hero.sprite, next)) this.hero.sprite.setPosition(next.x, next.y);
        this.path = [];
        this.lastDirection = facing(dx, dy); this.wasMoving = true;
        this.walk(true);
      } else if (!paused && !busy && this.path.length) {
        const previous = { x: this.hero.sprite.x, y: this.hero.sprite.y };
        const moved = advancePath(this.hero.sprite, this.path, 45 * Math.min(delta, 100) / 1000, this.navigation);
        this.hero.sprite.setPosition(moved.x, moved.y);
        this.lastDirection = facing(moved.x - previous.x, moved.y - previous.y); this.wasMoving = true;
        this.walk(true);
      }
      if (!paused && !busy && !dx && !dy && !this.path.length && this.wasMoving) {
        this.wasMoving = false; this.walk(false);
      }
      for (const [index, body] of [this.hero, this.target].entries()) {
        body.sprite.setOrigin(...animationOrigin(body.definition!, body.sprite.frame.name, body.sprite.flipX)).setDepth(body.sprite.y);
        body.sprite.anims.timeScale = Number(input("speed").value);
        if (paused) body.sprite.anims.pause(); else body.sprite.anims.resume();
        this.labels[index].setPosition(body.sprite.x, body.sprite.y - 58).setDepth(body.sprite.y + .2);
      }
      const contact = meleeProbe(this.hero.sprite, this.target.sprite, this.navigation);
      this.debug.clear().lineStyle(1, contact.reachable ? 0xe8bf63 : 0xe68970, .9).strokeCircle(this.hero.sprite.x, this.hero.sprite.y, MELEE_RANGE);
      this.debug.lineBetween(this.hero.sprite.x, this.hero.sprite.y, this.target.sprite.x, this.target.sprite.y);
      for (const body of [this.hero, this.target]) {
        this.debug.fillStyle(0x6ee8c8).fillCircle(body.sprite.x, body.sprite.y, 1.5);
        if (input("bounds").checked) this.debug.lineStyle(.5, 0x6ee8c8, .8).strokeRectShape(body.sprite.getBounds());
      }
      if (time - this.lastUi < 90) return;
      this.lastUi = time;
      output("distance", contact.distance.toFixed(1) + " / " + MELEE_RANGE);
      output("contact", t(contact.reachable ? "lab.inRange" : contact.reason === "blocked" ? "lab.blocked" : "lab.outOfRange"));
      const currentFrame = (this.hero.sprite.anims.currentFrame?.index || 1) - 1;
      output("timeline", `${currentFrame + 1}/${this.hero.definition.timeline?.length || this.hero.definition.frames} · ${this.hero.definition.fps} fps · #${this.hero.sprite.frame.name}${this.hero.definition.status === "partial" || this.hero.definition.externalEffects?.length ? " · " + t("lab.partial") : ""}`);
      if (!paused) input("frame").value = String(currentFrame);
      const effect = this.effect.snapshot();
      stage.dataset.effectActive = String(effect.active);
      stage.dataset.effectFrame = effect.frame || "";
      const bound = this.hero.mode === "battle" && bindingFor(this.hero.manifest)?.action === this.hero.action;
      output("effect", t(bound ? "lab.boundEffect" : "lab.noBoundEffect") + (bound && effect.frame !== undefined ? " · #" + effect.frame : ""));
      stage.dataset.ready = String(this.ready);
      stage.dataset.distance = String(contact.distance);
      stage.dataset.contact = String(contact.reachable);
      stage.dataset.heroAction = this.hero.action;
    }
  }
  function catalogControls() {
    const selectedMap = select("map").value;
    const list = host.querySelector<HTMLDataListElement>("#lab-models")!;
    list.replaceChildren(...Object.entries(data.entities).map(([id, entry]) => new Option(`${entry.sourceOnly ? t("lab.source") + " · " : ""}${entry.name}${entry.variant ? " [" + entry.variant + "]" : ""} · ${id}`, id)));
    select("map").replaceChildren(...data.maps.map(map => new Option(map.name, map.id)));
    select("map").value = data.maps.some(map => map.id === selectedMap) ? selectedMap : data.maps.some(map => map.id === "10006") ? "10006" : data.maps[0]?.id || "";
  }
  async function load(refresh = true) {
    const request = ++generation;
    button("load").disabled = true; busy = false; pause(false); stage.dataset.ready = "false";
    report(t("lab.loading"));
    try {
      if (refresh) {
        const [index, config] = await Promise.all([read("lab"), read("presentation")]);
        if (disposed || request !== generation) return;
        data = index; presentation = config; catalogControls();
      }
      const map = data.maps.find(map => map.id === select("map").value);
      if (!map) throw new Error(t("lab.noGround"));
      const [hero, target, grid] = await Promise.all([manifest(input("hero").value.trim()), manifest(input("target").value.trim()), json<NativeGrid>(map.navigation)]);
      if (disposed || request !== generation) return;
      actions(hero);
      await destroyGame();
      if (disposed || request !== generation) return;
      game = new Phaser.Game({ type: Phaser.AUTO, parent: stage, width: stage.clientWidth, height: stage.clientHeight, backgroundColor: "#12241b", scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, loader: { maxParallelDownloads: 6, timeout: 15000, maxRetries: 0 }, audio: { noAudio: true }, scene: new LabScene(map, withSceneGeometry(map.id, grid), hero, target, request), autoFocus: false });
    } catch (error) { if (!disposed && request === generation) report(errorText(error), true); }
    finally { if (!disposed && request === generation) button("load").disabled = false; }
  }
  button("load").onclick = () => void load();
  button("replay").onclick = () => void scene?.replay().catch(error => report(errorText(error), true));
  button("pause").onclick = () => pause(!paused);
  button("basic").onclick = () => void scene?.attack("basic").catch(error => report(errorText(error), true));
  button("skill").onclick = () => void scene?.attack("skill").catch(error => report(errorText(error), true));
  button("near").onclick = () => scene?.placeTarget(true);
  button("far").onclick = () => scene?.placeTarget(false);
  input("frame").oninput = () => scene?.step();
  input("zoom").oninput = () => scene?.cameras.main.setZoom(Number(input("zoom").value));
  input("flip").onchange = () => scene?.hero.sprite.setFlipX(input("flip").checked);
  select("mode").onchange = () => { if (scene) { actions(scene.hero.manifest); void scene.replay().catch(error => report(errorText(error), true)); } };
  select("action").onchange = () => void scene?.replay().catch(error => report(errorText(error), true));
  void Promise.all([read("lab") as Promise<LabData>, read("presentation") as Promise<PresentationConfig>]).then(([index, config]) => {
    if (disposed) return;
    data = index; presentation = config;
    catalogControls();
    return load(false);
  }).catch(error => report(errorText(error), true));
  return () => { disposed = true; generation++; abort.abort(); scene = undefined; game?.destroy(true); game?.loop.wake(); game = undefined; host.classList.remove("combat-lab"); };
}
