import Phaser from "phaser";
import type {
  ActorMode,
  ActorRole,
  AnimationDef,
  EntityManifest,
} from "./types";
import { actorVisualScale, resetWorldMirror, shouldReturnToBattleIdle } from "./visual-rules";
const requested = new WeakMap<Phaser.Scene, Set<string>>();
export const actorKey = (id: string, mode: ActorMode, action: string) =>
  `entity:${id}:${mode}:${action}`;
export function actorActions(manifest: EntityManifest, role: ActorRole) {
  const mode: ActorMode = role === "enemy" ? "battle" : "world";
  return Object.entries(manifest.modes[mode]?.animations || {}).filter(
    ([action]) =>
      role === "enemy"
        ? ["C_idle", "A_1hit", "C_hurt", "C_dead", "SP_skill1"].includes(action)
        : role === "companion"
          ? /^(idle|run)_\d$/.test(action)
          : action === "idle_0",
  );
}
export function queueActor(
  scene: Phaser.Scene,
  manifest: EntityManifest,
  role: ActorRole,
) {
  const mode: ActorMode = role === "enemy" ? "battle" : "world";
  let pending = requested.get(scene);
  if (!pending) requested.set(scene, (pending = new Set()));
  for (const [action, anim] of actorActions(manifest, role)) {
    const key = actorKey(manifest.id, mode, action);
    if (scene.textures.exists(key) || pending.has(key)) continue;
    pending.add(key);
    scene.load.spritesheet(key, anim.url, {
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight,
      endFrame: anim.frames - 1,
    });
  }
}
export function registerActor(
  scene: Phaser.Scene,
  manifest: EntityManifest,
  role: ActorRole,
) {
  const mode: ActorMode = role === "enemy" ? "battle" : "world";
  for (const [action, anim] of actorActions(manifest, role)) {
    const key = actorKey(manifest.id, mode, action);
    if (scene.anims.exists(key) || !scene.textures.exists(key)) continue;
    scene.anims.create({
      key,
      frames: (
        anim.timeline || Array.from({ length: anim.frames }, (_, i) => i)
      ).map((frame) => ({ key, frame })),
      frameRate: anim.fps,
      repeat: action.includes("idle") || action.startsWith("run_") ? -1 : 0,
    });
  }
}
export class ActorAssetCache {
  private work = Promise.resolve();
  private loaded = new Map<string, EntityManifest>();
  constructor(
    private scene: Phaser.Scene,
    private active: () => Set<string>,
  ) {}
  seed(manifests: EntityManifest[]) {
    for (const manifest of manifests) this.loaded.set(manifest.id, manifest);
  }
  private bytesFor(manifest: EntityManifest) {
    let bytes = 0;
    for (const mode of ["world", "battle"] as const)
      for (const action of Object.keys(
        manifest.modes[mode]?.animations || {},
      )) {
        const key = actorKey(manifest.id, mode, action);
        if (!this.scene.textures.exists(key)) continue;
        const image = this.scene.textures.get(key).getSourceImage() as {
          width: number;
          height: number;
        };
        bytes += image.width * image.height * 4;
      }
    return bytes;
  }
  snapshot() {
    return {
      residentEntities: this.loaded.size,
      estimatedTextureBytes: [...this.loaded.values()].reduce(
        (total, manifest) => total + this.bytesFor(manifest),
        0,
      ),
    };
  }
  load(manifest: EntityManifest, role: ActorRole) {
    const operation = this.work.then(async () => {
      if (!this.scene.sys.isActive()) throw new Error("Cena encerrada");
      const missing = actorActions(manifest, role).some(
        ([action]) =>
          !this.scene.textures.exists(
            actorKey(
              manifest.id,
              role === "enemy" ? "battle" : "world",
              action,
            ),
          ),
      );
      if (missing)
        await new Promise<void>((resolve, reject) => {
          let failed = false;
          const error = (file: Phaser.Loader.File) => {
            requested.get(this.scene)?.delete(file.key);
            failed = true;
          };
          const cleanup = () => {
            this.scene.load.off("loaderror", error);
            this.scene.load.off("complete", complete);
            this.scene.events.off("shutdown", shutdown);
            this.scene.events.off("destroy", shutdown);
          };
          const complete = () => {
            cleanup();
            failed
              ? reject(new Error("Não foi possível carregar as imagens"))
              : resolve();
          };
          const shutdown = () => {
            cleanup();
            reject(new Error("Cena encerrada durante o carregamento"));
          };
          this.scene.load.on("loaderror", error);
          this.scene.load.once("complete", complete);
          this.scene.events.once("shutdown", shutdown);
          this.scene.events.once("destroy", shutdown);
          queueActor(this.scene, manifest, role);
          this.scene.load.start();
        });
      if (!this.scene.sys.isActive()) throw new Error("Cena encerrada");
      registerActor(this.scene, manifest, role);
      this.loaded.delete(manifest.id);
      this.loaded.set(manifest.id, manifest);
      const keep = this.active();
      keep.add(manifest.id);
      for (const [id] of this.loaded) {
        if (
          this.loaded.size <= 12 &&
          this.snapshot().estimatedTextureBytes <= 256 * 1024 * 1024
        )
          break;
        if (keep.has(id)) continue;
        for (const mode of ["world", "battle"] as const)
          for (const action of Object.keys(
            this.loaded.get(id)?.modes[mode]?.animations || {},
          )) {
            const key = actorKey(id, mode, action);
            this.scene.anims.remove(key);
            if (this.scene.textures.exists(key))
              this.scene.textures.remove(key);
            requested.get(this.scene)?.delete(key);
          }
        this.loaded.delete(id);
      }
    });
    this.work = operation.catch(() => {});
    return operation;
  }
}
export class EntityActor extends Phaser.GameObjects.Container {
  visual: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  manifest: EntityManifest;
  role: ActorRole;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    manifest: EntityManifest,
    role: ActorRole,
  ) {
    super(scene, x, y);
    this.manifest = manifest;
    this.role = role;
    scene.add.existing(this);
    const shadow = scene.add.ellipse(0, 0, 19, 6, 0x17231b, 0.24);
    this.visual = scene.add.sprite(0, 0, "__MISSING");
    this.nameLabel = scene.add
      .text(0, -56, manifest.name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "7px",
        align: "center",
        wordWrap: { width: 100, useAdvancedWrap: true },
        color: "#fff4d7",
        backgroundColor: "#1a3026c9",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setResolution(2);
    this.add([shadow, this.visual, this.nameLabel]);
    this.use(manifest, role);
  }
  use(manifest: EntityManifest, role: ActorRole) {
    this.manifest = manifest;
    this.role = role;
    this.nameLabel.setText(manifest.name);
    this.play(
      role === "enemy" ? "battle" : "world",
      role === "enemy" ? "C_idle" : "idle_0",
      true,
    );
  }
  play(mode: ActorMode, action: string, force = false) {
    const modeDef = this.manifest.modes[mode];
    if (!modeDef) return;
    const chosen = modeDef.animations[action]
      ? action
      : mode === "battle"
        ? "C_idle"
        : "idle_0";
    const anim: AnimationDef | undefined = modeDef.animations[chosen];
    if (!anim) return;
    const key = actorKey(this.manifest.id, mode, chosen);
    if (!this.scene.anims.exists(key)) return;
    // Battle sprites face the opponent via flipX; world sprites already have
    // their own eight directional frames and must not inherit that mirror.
    if (resetWorldMirror(mode, this.visual.anims.currentAnim?.key))
      this.visual.setFlipX(false);
    this.visual
      .setOrigin(...anim.origin)
      .setScale(
        actorVisualScale(this.manifest.id, mode, modeDef.referenceHeight, anim.rigScale),
      );
    if (force || this.visual.anims.currentAnim?.key !== key) {
      this.visual.play(key);
      this.visual.anims.timeScale = chosen === "A_1hit"
        ? this.visual.anims.currentAnim!.duration / 450
        : 1;
    }
  }
  tick(paused: boolean) {
    this.setDepth(this.y);
    if (paused) this.visual.anims.pause();
    else this.visual.anims.resume();
    if (!paused && this.role === "enemy" && shouldReturnToBattleIdle(this.visual.anims.currentAnim?.key, this.visual.anims.isPlaying))
      this.play("battle", "C_idle");
  }
  face(left: boolean) {
    this.visual.setFlipX(left);
  }
}
