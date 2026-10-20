import { installArena } from "./arena/ui";
import { installProgression } from "./progression/ui";
import { recruit, STARTER_COLLECTION } from "./progression/rules";
import Phaser from "phaser";
import "./style.css";
import {
  PresentationPlayer,
  queuePresentation,
  type PresentationConfig,
} from "./presentation";
import { entityCatalog } from "./entities/catalog";
import {
  EntityActor,
  ActorAssetCache,
  queueActor,
  registerActor,
} from "./entities/actor";
import { installLibrary } from "./entities/library";
import type { EntityManifest, ActorRole } from "./entities/types";
import { actorScale, CAMERA_ZOOM } from "./navigation";
import {
  NativeNavigation,
  advancePath,
  facing,
  type NativeGrid,
  type Point,
} from "./world/navigation";
import {
  listMaps,
  mapNavigation,
  installTravel,
  type WorldMap,
} from "./world/maps";
import { ExplorationParty } from "./world/party";
import { Residents } from "./world/residents";
import { EnemyField } from "./world/enemies";
import { CHARACTERS, AREAS, type CharacterId } from "./data";
import {
  Hunt,
  LocalProgressStore,
  fresh,
  restore,
  stats,
  needed,
  type Save,
} from "./model";
type Anim = {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  timeline?: number[];
  rigScale?: number;
  origin: [number, number];
  status: string;
};
type AnimSet = Record<
  string,
  { animations: Record<string, Anim>; warnings: unknown[] }
>;
const $ = (id: string) => document.getElementById(id)!;
const store = new LocalProgressStore();
let save: Save;
let game: Phaser.Game | undefined;
let scene: HuntScene;
let definitions: AnimSet;
let presentationData: PresentationConfig;
let launchVersion = 0;
const WALK_SPEED = 96;
let initialMap: WorldMap;
let initialNavigation: NativeGrid;
let worldMaps: WorldMap[];
const specialAction = () =>
  presentationData.characters[save.character].action || "SP_skill1";
let cast: {
  hero: EntityManifest;
  enemies: EntityManifest[];
  npcs: EntityManifest[];
  party: EntityManifest[];
};
const starterIds = {
  naruto: "11000101",
  sasuke: "11000201",
  sakura: "11000301",
};
const openLibrary = installLibrary(
  async (id, role) => {
    if (!scene || !game)
      throw new Error("Inicie sua jornada para colocar personagens na vila.");
    await scene.chooseEntity(id, role);
  },
  () => new Set(save?.collection || STARTER_COLLECTION),
);
$("library").onclick = () => void openLibrary();
const openProgression = installProgression(() => ({
  save,
  heroId: starterIds[save.character],
  invite: async (id) => {
    await scene.chooseEntity(id, "companion");
  },
  onChange: () => {
    scene.hunt.hp = Math.min(scene.hunt.hp, stats(save).maxHp);
    scene.hunt.chakra = Math.min(scene.hunt.chakra, stats(save).maxChakra);
    commit();
    scene.renderUI();
  },
}));
$("progression").onclick = () => openProgression();
const openArena = installArena(
  () => save.character,
  () => ({
    level: save.level,
    upgrades: save.upgrades,
    equipment: { ...save.equipment },
  }),
);
$("arena").onclick = () => {
  const current = game;
  current?.loop.sleep();
  void openArena().finally(() => {
    const dialog = document.querySelector<HTMLDialogElement>(".arena-panel");
    const resume = () => {
      if (game === current) current?.loop.wake();
    };
    if (dialog?.open) dialog.addEventListener("close", resume, { once: true });
    else resume();
  });
};
$("cast-skill").onclick = () => {
  if (scene.hunt.castSkill()) commit();
};
const openTravel = installTravel(
  () => scene?.map?.id || "10001",
  async (map) => {
    if (!scene || !game) throw new Error("Inicie sua jornada antes de viajar.");
    await scene.travel(map);
  },
);
$("maps").onclick = () => void openTravel();
$("auto-hunt").onclick = () => scene?.toggleHunt();
$("return-lobby").onclick = () =>
  void scene
    .travel(worldMaps.find((m) => m.id === "10001")!)
    .catch((e) => toast(String(e)));
const session = { start: Date.now(), xp: 0, coins: 0, wins: 0 };
const messages: string[] = [];
function journal(text: string) {
  messages.unshift(text);
  messages.splice(6);
  $("journal").replaceChildren(
    ...messages.map((message) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      return paragraph;
    }),
  );
}
function commit() {
  if (save) {
    if (scene?.hero?.active && scene.map?.id === save.location)
      save.worldPosition = {
        mapId: scene.map.id,
        x: scene.hero.x,
        y: scene.hero.y,
      };
    save.lastSaved = Date.now();
    store.write(JSON.stringify(save));
  }
}
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  setTimeout(() => $("toast").classList.remove("visible"), 6000);
}
function card(id: CharacterId) {
  const c = CHARACTERS[id];
  return `<button class="character" data-character="${id}"><img src="${c.portrait}" alt="Retrato recuperado de ${c.name}"><span class="character-name">${c.name}</span><em>${c.subtitle}</em><p>${c.description}</p><span class="select-label">Escolher ${c.name} →</span></button>`;
}
async function start(s: Save) {
  const request = ++launchVersion;
  presentationData ??= await fetch("/assets/presentation.json").then((r) =>
    r.json(),
  );
  const entries = await entityCatalog.list();
  const maps = await listMaps();
  const startMap =
    maps.find((m) => m.id === s.location) ||
    maps.find((m) => m.id === "10001")!;
  const startNavigation = await mapNavigation(startMap);
  const load = async (id: string | undefined, role: ActorRole) => {
    if (!id || !entries.some((e) => e.id === id && e.capabilities[role]))
      return undefined;
    return entityCatalog.get(id);
  };
  const hero = await entityCatalog.get(starterIds[s.character]);
  const enemies = (
    await Promise.all(
      (s.enemyId && startMap.kind !== "lobby"
        ? [s.enemyId]
        : startMap.enemies.length
          ? startMap.enemies
          : ["19000301", "19000701", "19000401"]
      ).map((id) => load(id, "enemy")),
    )
  ).filter((e): e is EntityManifest => !!e);
  if (!enemies.length)
    throw new Error("Nenhum adversário disponível no catálogo");
  const npcs = (
    await Promise.all(
      (s.npcIds || ["11001601", "11001201"])
        .slice(0, 3)
        .map((id) => load(id, "npc")),
    )
  ).filter((e): e is EntityManifest => !!e);
  const party = (
    await Promise.all(
      (s.partyIds || []).slice(0, 3).map((id) => load(id, "companion")),
    )
  ).filter((m): m is EntityManifest => !!m);
  if (request !== launchVersion) return;
  if (import.meta.env.DEV)
    delete (window as unknown as { __idle?: unknown }).__idle;
  save = s;
  initialMap = startMap;
  initialNavigation = startNavigation;
  worldMaps = maps;
  s.location = startMap.id;
  s.collection ??= [...STARTER_COLLECTION];
  s.visitedMaps = [...new Set([...(s.visitedMaps || []), startMap.id])];
  cast = { hero, enemies, npcs, party };
  definitions = Object.fromEntries(
    ["world", "battle"].map((mode) => [
      s.character + "-" + mode,
      {
        animations: hero.modes[mode as "world" | "battle"]?.animations || {},
        warnings: [],
      },
    ]),
  ) as AnimSet;
  $("menu").hidden = true;
  $("play").hidden = false;
  session.start = Date.now();
  session.xp = session.coins = session.wins = 0;
  messages.length = 0;
  game?.destroy(true);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "canvas",
    backgroundColor: "#15241e",
    width: $("canvas").clientWidth,
    height: $("canvas").clientHeight,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: HuntScene,
    render: { antialias: true, roundPixels: false },
    audio: { noAudio: false },
  });
  commit();
}
$("new").onclick = () => {
  const choices = $("choices");
  choices.hidden = false;
  choices.innerHTML = (Object.keys(CHARACTERS) as CharacterId[])
    .map(card)
    .join("");
  choices.querySelectorAll<HTMLButtonElement>("[data-character]").forEach(
    (button) =>
      (button.onclick = () => {
        if (
          store.read() &&
          !confirm(
            "Começar uma nova jornada substituirá seu progresso local. Continuar?",
          )
        )
          return;
        void start(fresh(button.dataset.character as CharacterId)).catch(
          (error) => toast(String(error)),
        );
      }),
  );
};
$("continue").onclick = () => {
  const restored = restore(store);
  if (!restored) {
    toast("Nenhum progresso válido encontrado. Escolha Novo jogo.");
    return;
  }
  void start(restored.save).catch((error) => toast(String(error)));
  if (restored.offline.xp || restored.offline.coins)
    toast(
      `Enquanto você estava fora: +${restored.offline.xp} XP e +${restored.offline.coins} moedas.`,
    );
};
$("back").onclick = () => {
  launchVersion++;
  if (import.meta.env.DEV)
    delete (window as unknown as { __idle?: unknown }).__idle;
  commit();
  game?.destroy(true);
  game = undefined;
  $("play").hidden = true;
  $("menu").hidden = false;
};
$("pause").onclick = () => {
  save.paused = !save.paused;
  commit();
};
$("upgrade").onclick = () => {
  if (save.coins < 25) {
    toast("Você precisa de 25 moedas para treinar.");
    return;
  }
  save.coins -= 25;
  save.upgrades++;
  scene.hunt.hp = Math.min(stats(save).maxHp, scene.hunt.hp + 9);
  journal("Treino concluído: força e resistência melhoradas.");
  commit();
};
$("sound").onchange = () => {
  save.sound = ($("sound") as HTMLInputElement).checked;
  scene?.presentation.settings(
    save.sound,
    save.music || false,
    save.soundVolume ?? 0.4,
  );
  scene?.presentation.unlock();
  commit();
};
$("music").onchange = () => {
  save.music = ($("music") as HTMLInputElement).checked;
  scene.presentation.unlock();
  scene.presentation.settings(save.sound, save.music, save.soundVolume ?? 0.4);
  commit();
};
$("volume").oninput = () => {
  save.soundVolume = Number(($("volume") as HTMLInputElement).value) / 100;
  scene.presentation.settings(
    save.sound,
    save.music || false,
    save.soundVolume,
  );
  commit();
};
window.addEventListener("pagehide", commit);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) commit();
});
function direction(dx: number, dy: number) {
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 14) % 8;
}
class HuntScene extends Phaser.Scene {
  hunt!: Hunt;
  hero!: Phaser.GameObjects.Sprite;
  enemy!: EntityActor;
  npcs: EntityActor[] = [];
  actorCache!: ActorAssetCache;
  loadingActor = false;
  encounterSequence = 0;
  bars!: Phaser.GameObjects.Graphics;
  groundShadow!: Phaser.GameObjects.Ellipse;
  stepDistance = 0;
  lastSave = 0;
  lastUi = 0;
  lastAnim = "";
  presentation!: PresentationPlayer;
  lastStrikeDuration = 300;
  constructor() {
    super("hunt");
  }
  preload() {
    this.load.image("map-" + initialMap.id, initialMap.background);
    this.load.image(
      "map-" + initialMap.id + "-foreground",
      initialMap.foreground,
    );
    queuePresentation(this, presentationData, save.character);
    for (const manifest of cast.enemies) {
      queueActor(this, manifest, "enemy");
      if (manifest.capabilities.companion)
        queueActor(this, manifest, "companion");
    }
    for (const manifest of cast.npcs)
      queueActor(
        this,
        manifest,
        manifest.capabilities.companion ? "companion" : "npc",
      );
    for (const manifest of cast.party) queueActor(this, manifest, "companion");
    for (const mode of ["world", "battle"]) {
      const set = definitions[save.character + "-" + mode]?.animations || {};
      for (const [action, anim] of Object.entries(set)) {
        if (
          mode === "world" ||
          ["C_idle", "A_1hit", specialAction(), "C_dead"].includes(action)
        )
          this.load.spritesheet(mode + "-" + action, anim.url, {
            frameWidth: anim.frameWidth,
            frameHeight: anim.frameHeight,
            endFrame: anim.frames - 1,
          });
      }
    }
  }
  create() {
    scene = this;
    this.map = initialMap;
    this.navigation = new NativeNavigation(initialNavigation);
    const savedPosition =
      save.worldPosition?.mapId === this.map.id
        ? save.worldPosition
        : undefined;
    const spawn =
      (savedPosition && this.navigation.nearest(savedPosition, 35)) ||
      this.navigation.nearest(this.map.spawn)!;
    this.hunt = new Hunt(save);
    this.presentation = new PresentationPlayer(
      this,
      presentationData,
      save.character,
    );
    this.presentation.settings(
      save.sound,
      save.music || false,
      save.soundVolume ?? 0.4,
    );
    this.presentation.pause(save.paused);
    this.background = this.add
      .image(0, 0, "map-" + this.map.id)
      .setOrigin(0)
      .setDisplaySize(this.map.width, this.map.height);
    this.foreground = this.add
      .image(0, 0, "map-" + this.map.id + "-foreground")
      .setOrigin(0)
      .setDisplaySize(this.map.width, this.map.height)
      .setDepth(10000);
    this.cameras.main
      .setBounds(0, 0, this.map.width, this.map.height)
      .setZoom(CAMERA_ZOOM);
    for (const mode of ["world", "battle"])
      for (const [action, anim] of Object.entries(
        definitions[save.character + "-" + mode]?.animations || {},
      )) {
        const key = mode + "-" + action;
        if (this.textures.exists(key))
          this.anims.create({
            key,
            frames: (
              anim.timeline || Array.from({ length: anim.frames }, (_, i) => i)
            ).map((frame) => ({ key, frame })),
            frameRate: anim.fps,
            repeat: mode === "world" || action === "C_idle" ? -1 : 0,
          });
      }
    this.groundShadow = this.add.ellipse(
      spawn.x,
      spawn.y,
      18,
      6,
      0x17231b,
      0.24,
    );
    this.hero = this.add
      .sprite(spawn.x, spawn.y, "world-idle_0")
      .setOrigin(0.5, 210 / 256)
      .setScale(actorScale(save.character, "world"))
      .setDepth(10);
    this.play("world-idle_0");
    this.cameras.main.startFollow(this.hero, false, 0.09, 0.09);
    this.cameras.main.centerOn(this.hero.x, this.hero.y);
    for (const manifest of cast.enemies) {
      registerActor(this, manifest, "enemy");
      if (manifest.capabilities.companion)
        registerActor(this, manifest, "companion");
    }
    for (const manifest of cast.npcs)
      registerActor(
        this,
        manifest,
        manifest.capabilities.companion ? "companion" : "npc",
      );
    for (const manifest of cast.party)
      registerActor(this, manifest, "companion");
    this.enemy = new EntityActor(
      this,
      spawn.x,
      spawn.y,
      cast.enemies[0],
      "enemy",
    );
    this.standbyEnemy = this.enemy;
    this.enemy.face(true);
    this.resetResidents();
    this.actorCache = new ActorAssetCache(
      this,
      () =>
        new Set([
          ...cast.enemies.map((e) => e.id),
          ...this.npcs.map((e) => e.manifest.id),
          this.enemy.manifest.id,
          ...cast.npcs.map((e) => e.id),
          ...(this.party?.members.map((e) => e.manifest.id) || []),
        ]),
    );
    this.actorCache.seed([...cast.enemies, ...cast.npcs, ...cast.party]);
    this.party = new ExplorationParty(this);
    for (const manifest of cast.party)
      this.party.add(manifest, this.hero, this.navigation);
    this.destination = this.add
      .ellipse(0, 0, 12, 5, 0xe4ab60, 0.15)
      .setStrokeStyle(1, 0xffd38b)
      .setDepth(1999)
      .setVisible(false);
    this.placeEnemy();
    this.makePortal();
    this.bindWorldInput();
    this.renderParty();
    this.bars = this.add.graphics().setDepth(2000);
    this.hunt.onEvent = (event, value) => this.effect(event, value);
    $("hero-name").textContent = CHARACTERS[save.character].name;
    ($("sound") as HTMLInputElement).checked = save.sound;
    ($("music") as HTMLInputElement).checked = save.music || false;
    ($("volume") as HTMLInputElement).value = String(
      (save.soundVolume ?? 0.4) * 100,
    );
    journal(
      this.isLobby
        ? "Bem-vindo à Vila da Folha. Clique no chão ou use WASD / setas para caminhar."
        : "Explore " + this.map.name + ". A caçada automática é opcional.",
    );
    this.events.once("shutdown", () => {
      if (import.meta.env.DEV && scene === this)
        delete (window as unknown as { __idle?: unknown }).__idle;
    });
    if (import.meta.env.DEV)
      (window as unknown as { __idle: unknown }).__idle = {
        snapshot: () => ({
          phase: this.isLobby ? "lobby" : this.hunt.phase,
          mapId: this.map.id,
          mode: this.map.kind,
          autoHunt: !!save.autoHunt,
          speed: WALK_SPEED,
          path: this.path.map((p) => ({ ...p })),
          npcs: this.npcs.map((n) => ({
            id: n.manifest.id,
            x: n.x,
            y: n.y,
            walkable: this.navigation.walkable(n),
            animation: n.visual.anims.currentAnim?.key,
          })),
          party: this.party.members.map((n) => ({
            id: n.manifest.id,
            x: n.x,
            y: n.y,
            visible: n.visible,
            walkable: this.navigation.walkable(n),
          })),
          hp: this.hunt.hp,
          chakra: this.hunt.chakra,
          maxChakra: stats(save).maxChakra,
          hero: { x: this.hero.x, y: this.hero.y },
          enemy: { x: this.enemy.x, y: this.enemy.y },
          scene: this.scene.key,
          paused: save.paused,
          kills: save.kills,
          character: save.character,
          animation: this.hero.anims.currentAnim?.key,
          heroSpriteInstances: this.children.list.filter(
            (o) =>
              o instanceof Phaser.GameObjects.Sprite &&
              /^(world|battle)-/.test(o.texture.key),
          ).length,
          gameLoopRunning: this.game.loop.running,
          origin: [this.hero.originX, this.hero.originY],
          scale: this.hero.scaleX,
          zoom: this.cameras.main.zoom,
          walkable: this.navigation.walkable(this.hero),
          enemyWalkable: this.navigation.walkable(this.enemy),
          presentation: this.presentation.snapshot(),
          actorCache: this.actorCache.snapshot(),
          enemyId: this.enemy.manifest.id,
          enemyVisible: this.enemy.visible,
          enemies: this.enemyField.members.map((m) => ({
            id: m.actor.manifest.id,
            x: m.actor.x,
            y: m.actor.y,
            alive: m.alive,
            visible: m.actor.visible,
            walkable: this.navigation.walkable(m.actor),
          })),
          npcIds: this.npcs.map((e) => e.manifest.id),
          companion: this.companion
            ? {
                id: this.companion.manifest.id,
                x: this.companion.x,
                y: this.companion.y,
                walkable: this.navigation.walkable(this.companion),
              }
            : null,
          loadingActor: this.loadingActor,
        }),
        advance: (milliseconds: number) => {
          const duration = Math.min(milliseconds, 300000);
          for (let elapsed = 0; elapsed < duration; elapsed += 16) {
            const ms = Math.min(16, duration - elapsed);
            this.time.preUpdate(elapsed, ms);
            this.time.update(this.time.now + ms, ms);
            for (const tween of this.tweens.getTweens())
              if (tween.isPlaying()) tween.update(ms);
            this.hero.anims.update(elapsed, ms);
            this.enemy.visual.anims.update(elapsed, ms);
            this.update(elapsed, ms);
          }
        },
        walkTo: (p: Point) => this.walkTo(p),
        navigation: () => this.navigation,
        previewSkill: () => this.effect("skill", stats(save).attack * 2),
        setHp: (hp: number) => {
          this.hunt.hp = hp;
        },
      };
    this.renderUI();
  }
  play(key: string, force = false) {
    if (
      this.anims.exists(key) &&
      (force || this.hero.anims.currentAnim?.key !== key)
    ) {
      const mode = key.startsWith("world-") ? "world" : "battle";
      const action = key.slice(mode.length + 1);
      const definition = cast.hero.modes[mode];
      const animation = definition?.animations[action];
      if (animation) this.hero.setOrigin(...animation.origin);
      this.hero.setScale(
        45 /
          Math.max(1, definition?.referenceHeight || 120) /
          (animation?.rigScale ?? 1),
      );
      this.hero.setFlipX(
        key.startsWith("battle-") && this.enemy.x < this.hero.x,
      );
      this.hero.play(key);
      this.hero.anims.timeScale =
        key === "battle-" + specialAction()
          ? this.hero.anims.currentAnim!.duration /
            Math.min(900, stats(save).interval * 0.8)
          : 1;
      this.lastAnim = key;
    }
  }
  floating(text: string, x: number, y: number, color = "#fff3ce") {
    const t = this.add
      .text(x, y, text, {
        fontFamily: "sans-serif",
        fontSize: "10px",
        fontStyle: "bold",
        color,
        stroke: "#19281e",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(3000);
    this.tweens.add({
      targets: t,
      y: y - 35,
      alpha: 0,
      duration: 950,
      onComplete: () => t.destroy(),
    });
  }
  effect(event: string, value: number) {
    if (event === "encounter") {
      this.enemy.play("battle", "C_idle", true);
      this.play("battle-C_idle");
      this.enemy.face(this.hero.x < this.enemy.x);
      // The target stays at its audited street position. No arbitrary X offset
      // can move an encounter into a building or across a fence.
      journal("Encontro: a luta acontece aqui mesmo.");
    }
    if (event === "attack" || event === "skill") {
      this.play(
        event === "skill" ? "battle-" + specialAction() : "battle-A_1hit",
        true,
      );
      this.floating(
        String(value),
        this.enemy.x,
        this.enemy.y - 43,
        event === "skill" ? "#ffcc69" : "#fff3ce",
      );
      this.tweens.add({
        targets: this.enemy,
        angle: 5,
        duration: 60,
        yoyo: true,
      });
      this.enemy.play("battle", "C_hurt", true);
      this.lastStrikeDuration =
        event === "skill" ? Math.min(900, stats(save).interval * 0.8) : 400;
      this.presentation.play(
        event === "skill" ? "SP_skill1" : "A_1hit",
        this.hero,
        this.enemy,
        this.lastStrikeDuration,
      );
      if (event === "skill")
        journal("Jutsu · " + presentationData.characters[save.character].name);
    }
    if (event === "hurt") {
      this.enemy.play("battle", "A_1hit", true);
      this.floating("-" + value, this.hero.x, this.hero.y - 53, "#ffc0a3");
    }
    if (event === "loot") journal(`Drop · Fragmento de treino ×${value}`);
    if (event === "victory") {
      this.enemyField.defeat(this.enemy);
      session.xp += value;
      session.coins += AREAS[save.area].coins;
      session.wins++;
      this.floating(
        "+" + value + " XP",
        this.hero.x,
        this.hero.y - 61,
        "#c5ffbd",
      );
      journal(`Vitória · +${value} XP · +${AREAS[save.area].coins} moedas`);
      this.time.delayedCall(this.lastStrikeDuration * 0.85, () => {
        this.enemy.play("battle", "C_dead", true);
        this.tweens.add({
          targets: this.enemy,
          alpha: 0,
          duration: 200,
          onComplete: () => this.enemy.setVisible(false).setAlpha(1),
        });
      });
      commit();
    }
    if (event === "resume") {
      this.encounterSequence++;
      this.placeEnemy();
      this.play("world-idle_0");
    }
    if (event === "defeat") {
      this.play("battle-C_dead", true);
      this.presentation.play("C_dead", this.hero, this.enemy, 500);
      journal("Derrota: recuperação por 3 segundos, sem perda do inventário.");
      commit();
    }
    if (event === "recover") {
      this.enemyField.disengage(this.enemy);
      const spawn = this.navigation.nearest(this.map.spawn)!;
      this.hero.setPosition(spawn.x, spawn.y);
      this.party.reset(this.hero, this.navigation);
      journal("Recuperado no ponto de entrada. Seu inventário foi preservado.");
    }
  }
  bindNpc(npc: EntityActor) {
    npc.setSize(25, 55).setInteractive({ useHandCursor: true });
    npc.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.event?.target !== this.game.canvas) return;
      if (
        document.querySelector("dialog[open]") ||
        this.loadingActor ||
        save.paused
      )
        return;
      npc.face(this.hero.x < npc.x);
      toast(npc.manifest.name + " · Morador da vila");
    });
  }
  async chooseEntity(id: string, role: ActorRole) {
    if (role === "enemy" && this.isLobby)
      await this.travel(worldMaps.find((m) => m.id === "10006")!);
    if (
      role === "npc" &&
      (id === cast.hero.id ||
        this.party.members.some((m) => m.manifest.id === id) ||
        this.npcs.some((n) => n.manifest.id === id))
    )
      throw new Error("Este personagem já está presente.");
    if (role === "npc" && !this.isLobby)
      throw new Error("Adicione moradores estando no lobby da vila.");
    if (
      role === "companion" &&
      (id === cast.hero.id ||
        this.party.members.some((m) => m.manifest.id === id))
    )
      throw new Error("Este personagem já está no grupo.");
    if (role === "companion" && !save.collection?.includes(id)) {
      const manifest = await entityCatalog.get(id);
      if (!manifest.organization?.eligible)
        throw new Error("Este modelo ainda está em revisão.");
      recruit(save, id);
      journal(
        manifest.name + " entrou na sua coleção. Convide-o quando quiser.",
      );
      commit();
      return;
    }
    if (role === "companion" && this.party.members.length >= 3)
      throw new Error("O grupo comporta até três convidados.");
    if (this.loadingActor) throw new Error("Aguarde o carregamento atual.");
    if (this.hunt.phase !== "explorando")
      throw new Error("Conclua o encontro antes de alterar os personagens.");
    this.loadingActor = true;
    try {
      const manifest = await entityCatalog.get(id);
      if (!manifest.capabilities[role])
        throw new Error("Recurso indisponível para esta função.");
      await this.actorCache.load(
        manifest,
        role === "npc" && manifest.capabilities.companion ? "companion" : role,
      );
      if (role === "enemy" && manifest.capabilities.companion)
        await this.actorCache.load(manifest, "companion");
      if (!this.sys.isActive()) return;
      if (role === "enemy") {
        this.enemy.use(manifest, role);
        save.enemyId = id;
        this.enemy.setVisible(true);
        this.placeEnemy();
      } else if (role === "companion") {
        this.party.add(manifest, this.hero, this.navigation);
        const resident = this.npcs.find((n) => n.manifest.id === id);
        if (resident) {
          this.npcs.splice(this.npcs.indexOf(resident), 1);
          resident.destroy();
          this.residents.reset(this.npcs);
        }
        save.partyIds = this.party.members.map((m) => m.manifest.id);
        this.renderParty();
      } else {
        if (this.npcs.length >= 3) this.npcs.shift()!.destroy();
        const position = [
          { x: 385, y: 240 },
          { x: 465, y: 294 },
          { x: 595, y: 365 },
        ].find(
          (p) => !this.npcs.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 10),
        )!;
        const safePosition = this.navigation.nearest(position)!;
        const npc = new EntityActor(
          this,
          safePosition.x,
          safePosition.y,
          manifest,
          role,
        );
        this.bindNpc(npc);
        this.npcs.push(npc);
        save.npcIds = this.npcs.map((n) => n.manifest.id);
        cast.npcs = this.npcs.map((n) => n.manifest);
        this.residents.reset(this.npcs);
      }
      journal(manifest.name + " entrou na vila.");
      commit();
    } finally {
      this.loadingActor = false;
    }
  }
  get isLobby() {
    return this.map.kind === "lobby";
  }
  map!: WorldMap;
  navigation!: NativeNavigation;
  background!: Phaser.GameObjects.Image;
  foreground!: Phaser.GameObjects.Image;
  portal?: Phaser.GameObjects.Container;
  destination!: Phaser.GameObjects.Ellipse;
  path: Point[] = [];
  party!: ExplorationParty;
  residents = new Residents();
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  lastFacing = 0;
  worldSequence = 0;
  enemyField!: EnemyField;
  standbyEnemy!: EntityActor;
  get companion() {
    return this.party?.members[0];
  }
  bindWorldInput() {
    this.game.canvas.tabIndex = 0;
    this.keys = this.input.keyboard!.addKeys(
      {
        left: "LEFT",
        right: "RIGHT",
        up: "UP",
        down: "DOWN",
        a: "A",
        d: "D",
        w: "W",
        s: "S",
      },
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        objects: Phaser.GameObjects.GameObject[],
      ) => {
        if (
          pointer.event?.target !== this.game.canvas ||
          objects.length ||
          document.querySelector("dialog[open]") ||
          save.paused ||
          this.loadingActor
        )
          return;
        this.game.canvas.focus({ preventScroll: true });
        const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.walkTo(p);
      },
    );
  }
  walkTo(point: Point) {
    if (this.hunt.phase !== "explorando") {
      toast("Conclua o encontro para continuar caminhando.");
      return;
    }
    const path = this.navigation.path(this.hero, point);
    if (!path.length) {
      this.floating("Caminho bloqueado", this.hero.x, this.hero.y - 60);
      return;
    }
    save.autoHunt = false;
    this.path = path;
    const end = path.at(-1)!;
    this.destination.setPosition(end.x, end.y).setVisible(true);
    this.renderUI();
  }
  resetResidents() {
    this.npcs.forEach((n) => n.destroy());
    this.npcs = [];
    const partyIds = new Set(
      this.party
        ? this.party.members.map((m) => m.manifest.id)
        : cast.party.map((m) => m.id),
    );
    if (this.isLobby)
      this.npcs = cast.npcs
        .filter((m) => !partyIds.has(m.id))
        .map((manifest, i) => {
          const point = this.navigation.nearest(
            [
              { x: 385, y: 240 },
              { x: 465, y: 294 },
              { x: 595, y: 365 },
            ][i],
          )!;
          const actor = new EntityActor(
            this,
            point.x,
            point.y,
            manifest,
            "npc",
          );
          this.bindNpc(actor);
          return actor;
        });
    this.residents.reset(this.npcs);
  }
  placeEnemy() {
    this.enemyField ??= new EnemyField(this);
    if (this.enemyField.mapId !== this.map.id)
      this.enemyField.reset(
        this.map.id,
        cast.enemies,
        this.hero,
        this.navigation,
        this.isLobby,
      );
    this.standbyEnemy.setPosition(this.hero.x, this.hero.y).setVisible(false);
    this.enemy = this.enemyField.nearest(this.hero) || this.standbyEnemy;
    this.path = [];
    this.destination?.setVisible(false);
  }
  makePortal() {
    this.portal?.destroy();
    const home = this.navigation.nearest(this.map.spawn)!;
    const target = { x: home.x + 60, y: home.y + 12 };
    const candidates = this.navigation.points.filter(
      (p) =>
        Math.hypot(p.x - home.x, p.y - home.y) > 45 &&
        Math.hypot(p.x - home.x, p.y - home.y) < 75 &&
        this.navigation.clear(home, p),
    );
    const near =
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) -
          Math.hypot(b.x - target.x, b.y - target.y),
      )[0] || home;
    const ring = this.add
      .ellipse(0, 0, 17, 7, 0xe4ab60, 0.35)
      .setStrokeStyle(1, 0xf5cb83);
    const text = this.add
      .text(0, -10, this.isLobby ? "✦ Viajar" : "✦ Voltar à Folha", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "8px",
        color: "#ffe3a1",
        backgroundColor: "#14251ed9",
        padding: { x: 4, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.portal = this.add
      .container(near.x, near.y, [ring, text])
      .setDepth(near.y + 1)
      .setSize(60, 35)
      .setInteractive({ useHandCursor: true });
    this.portal.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.event?.target !== this.game.canvas) return;
      if (
        document.querySelector("dialog[open]") ||
        this.loadingActor ||
        save.paused
      )
        return;
      if (this.isLobby) void openTravel();
      else
        void this.travel(worldMaps.find((m) => m.id === "10001")!).catch((e) =>
          toast(String(e)),
        );
    });
  }
  async travel(map: WorldMap) {
    if (map.id === this.map.id) return;
    if (this.loadingActor) throw new Error("Aguarde o carregamento atual.");
    if (this.hunt.phase !== "explorando")
      throw new Error("Conclua o encontro antes de viajar.");
    this.loadingActor = true;
    const old = this.map;
    try {
      const grid = await mapNavigation(map);
      if (!this.sys.isActive()) return;
      const pool = map.enemies.length
        ? await Promise.all(map.enemies.map((id) => entityCatalog.get(id)))
        : cast.enemies;
      if (!this.sys.isActive()) return;
      await this.loadMapImages(map);
      if (!this.sys.isActive()) return;
      for (const manifest of pool) {
        await this.actorCache.load(manifest, "enemy");
        if (manifest.capabilities.companion)
          await this.actorCache.load(manifest, "companion");
      }
      if (!this.sys.isActive()) return;
      this.enemy = this.standbyEnemy;
      this.map = map;
      this.navigation = new NativeNavigation(grid);
      cast.enemies = pool;
      const spawn = this.navigation.nearest(map.spawn)!;
      this.background
        .setTexture("map-" + map.id)
        .setDisplaySize(map.width, map.height);
      this.foreground
        .setTexture("map-" + map.id + "-foreground")
        .setDisplaySize(map.width, map.height);
      this.cameras.main.setBounds(0, 0, map.width, map.height);
      this.hero.setPosition(spawn.x, spawn.y);
      this.cameras.main.centerOn(spawn.x, spawn.y);
      this.path = [];
      this.destination.setVisible(false);
      this.hunt.phase = "explorando";
      this.hunt.timer = 0;
      if (this.isLobby) {
        this.hunt.hp = stats(save).maxHp;
        this.hunt.chakra = stats(save).maxChakra;
      }
      this.enemy.use(pool[0], "enemy");
      this.enemy.angle = 0;
      this.resetResidents();
      this.placeEnemy();
      this.party.reset(this.hero, this.navigation);
      this.makePortal();
      save.location = map.id;
      save.visitedMaps = [...new Set([...(save.visitedMaps || []), map.id])];
      save.autoHunt = false;
      delete save.enemyId;
      this.play("world-idle_0");
      this.renderParty();
      this.renderUI();
      commit();
      for (const key of ["map-" + old.id, "map-" + old.id + "-foreground"])
        if (this.textures.exists(key)) this.textures.remove(key);
      journal(
        this.isLobby
          ? "Você voltou à Vila da Folha. Área segura."
          : "Viagem · " +
              map.name +
              ". Explore livremente ou inicie uma caçada.",
      );
    } finally {
      this.loadingActor = false;
    }
  }
  loadMapImages(map: WorldMap) {
    return new Promise<void>((resolve, reject) => {
      const keys = ["map-" + map.id, "map-" + map.id + "-foreground"];
      if (keys.every((key) => this.textures.exists(key))) {
        resolve();
        return;
      }
      const cleanup = () => {
        this.load.off("complete", done);
        this.load.off("loaderror", failed);
        this.events.off("shutdown", cancel);
        this.events.off("destroy", cancel);
      };
      const done = () => {
        cleanup();
        if (keys.every((key) => this.textures.exists(key))) resolve();
        else reject(new Error("Camadas do mapa indisponíveis."));
      };
      const failed = (file: Phaser.Loader.File) => {
        if (keys.includes(file.key)) {
          cleanup();
          reject(new Error("Não foi possível carregar o mapa."));
        }
      };
      const cancel = () => {
        cleanup();
        reject(new Error("Viagem cancelada ao sair do jogo."));
      };
      this.load.once("complete", done);
      this.load.on("loaderror", failed);
      this.events.once("shutdown", cancel);
      this.events.once("destroy", cancel);
      if (!this.textures.exists(keys[0]))
        this.load.image(keys[0], map.background);
      if (!this.textures.exists(keys[1]))
        this.load.image(keys[1], map.foreground);
      if (!this.load.isLoading()) this.load.start();
    });
  }
  toggleHunt() {
    if (this.isLobby) {
      toast("A vila é uma área segura. Escolha um destino em Viajar.");
      return;
    }
    save.autoHunt = !save.autoHunt;
    this.path = [];
    this.destination.setVisible(false);
    commit();
    this.renderUI();
  }
  removeParty(id: string) {
    if (this.loadingActor) {
      toast("Aguarde o carregamento atual.");
      return;
    }
    this.party.remove(id);
    if (this.isLobby) {
      const manifest = cast.npcs.find((m) => m.id === id);
      if (manifest && !this.npcs.some((n) => n.manifest.id === id)) {
        const point = this.navigation.nearest({ x: 465, y: 294 })!;
        const npc = new EntityActor(this, point.x, point.y, manifest, "npc");
        this.bindNpc(npc);
        this.npcs.push(npc);
        this.residents.reset(this.npcs);
      }
    }
    save.partyIds = this.party.members.map((m) => m.manifest.id);
    this.renderParty();
    commit();
  }
  renderParty() {
    const root = $("party");
    root.replaceChildren();
    const heading = document.createElement("p");
    heading.className = "caption";
    heading.textContent = `Grupo de exploração · ${this.party.members.length}/3`;
    root.append(heading);
    if (!this.party.members.length) {
      const text = document.createElement("p");
      text.className = "caption";
      text.textContent =
        "Nenhum convidado. Convide personagens na biblioteca se quiser explorar em grupo.";
      root.append(text);
    }
    for (const member of this.party.members) {
      const row = document.createElement("div");
      row.className = "party-member";
      const name = document.createElement("span");
      name.textContent = member.manifest.name;
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "Remover";
      button.dataset.dismiss = member.manifest.id;
      button.onclick = () => this.removeParty(member.manifest.id);
      row.append(name, button);
      root.append(row);
    }
  }
  update(_time: number, delta: number) {
    if (!this.hero) return;
    const blocked =
      save.paused ||
      this.loadingActor ||
      !!document.querySelector("dialog[open]");
    this.input.enabled = !blocked;
    this.time.paused = blocked;
    this.presentation.pause(blocked);
    this.tweens.timeScale = blocked ? 0 : 1;
    delta = Math.min(delta, 100);
    if (blocked) this.hero.anims.pause();
    else this.hero.anims.resume();
    if (!blocked) this.hunt.tick(delta);
    this.residents.update(delta, this.navigation, blocked);
    this.enemyField.update(
      delta,
      this.navigation,
      this.hero,
      this.hunt.phase !== "explorando" ? this.enemy : undefined,
      blocked,
    );
    if (!this.isLobby && this.hunt.phase === "explorando")
      this.enemy = this.enemyField.nearest(this.hero) || this.standbyEnemy;
    this.enemy.tick(blocked);
    if (!blocked && this.hunt.phase === "explorando") {
      let dx = 0,
        dy = 0;
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(
        document.activeElement?.tagName || "",
      );
      if (!typing) {
        dx =
          Number(this.keys.right.isDown || this.keys.d.isDown) -
          Number(this.keys.left.isDown || this.keys.a.isDown);
        dy =
          Number(this.keys.down.isDown || this.keys.s.isDown) -
          Number(this.keys.up.isDown || this.keys.w.isDown);
      }
      let next: Point = { x: this.hero.x, y: this.hero.y };
      if (dx || dy) {
        save.autoHunt = false;
        this.path = [];
        this.destination.setVisible(false);
        const norm = Math.hypot(dx, dy);
        next = this.navigation.move(
          this.hero,
          ((dx / norm) * WALK_SPEED * delta) / 1000,
          ((dy / norm) * WALK_SPEED * delta) / 1000,
        );
      } else {
        if (
          !this.isLobby &&
          save.autoHunt &&
          !this.path.length &&
          this.enemy.visible
        )
          this.path = this.navigation.path(this.hero, this.enemy);
        next = advancePath(
          this.hero,
          this.path,
          (WALK_SPEED * delta) / 1000,
          this.navigation,
        );
      }
      const mx = next.x - this.hero.x,
        my = next.y - this.hero.y,
        distance = Math.hypot(mx, my);
      if (distance > 0.01) {
        this.hero.setPosition(next.x, next.y);
        this.lastFacing = facing(mx, my);
        this.play("world-run_" + this.lastFacing);
        this.stepDistance += distance;
        if (this.stepDistance >= 10) {
          this.stepDistance %= 10;
          this.presentation.footstep();
        }
      } else this.play("world-idle_" + this.lastFacing);
      if (!this.path.length) this.destination.setVisible(false);
      if (
        !this.isLobby &&
        this.enemy.visible &&
        Math.hypot(this.hero.x - this.enemy.x, this.hero.y - this.enemy.y) < 28
      ) {
        this.path = [];
        this.destination.setVisible(false);
        this.hunt.encounter();
      }
    } else if (
      !blocked &&
      this.hunt.phase === "combatendo" &&
      !this.hero.anims.isPlaying
    )
      this.play("battle-C_idle");
    this.party.update(this.hero, delta, this.navigation, blocked);
    this.groundShadow
      .setPosition(this.hero.x, this.hero.y)
      .setDepth(this.hero.y - 0.5);
    this.hero.setDepth(this.hero.y);
    this.enemy.setDepth(this.enemy.y - 1);
    this.bars.clear();
    if (!this.isLobby) {
      const max = stats(save).maxHp;
      this.bars
        .fillStyle(0x14211b, 0.8)
        .fillRoundedRect(this.hero.x - 13, this.hero.y + 4, 26, 3, 1.5)
        .fillStyle(0x9fd18c)
        .fillRoundedRect(
          this.hero.x - 13,
          this.hero.y + 4,
          (26 * this.hunt.hp) / max,
          3,
          1.5,
        );
      if (["iniciando combate", "combatendo"].includes(this.hunt.phase))
        this.bars
          .fillStyle(0x14211b)
          .fillRect(this.enemy.x - 12, this.enemy.y + 4, 24, 3)
          .fillStyle(0xe69878)
          .fillRect(
            this.enemy.x - 12,
            this.enemy.y + 4,
            (24 * this.hunt.enemyHp) / this.hunt.enemyMax,
            3,
          );
    }
    this.lastUi += delta;
    this.lastSave += delta;
    if (this.lastUi > 250) {
      this.renderUI();
      this.lastUi = 0;
    }
    if (this.lastSave > 5000) {
      commit();
      this.lastSave = 0;
    }
  }
  renderUI() {
    const st = stats(save),
      pct = (save.xp / needed(save.level)) * 100;
    $("pause").textContent = save.paused ? "Retomar movimento" : "Pausar";
    $("world-name").textContent = this.map.name;
    $("world-help").textContent = this.isLobby
      ? "Lobby seguro · clique no chão ou use WASD / setas para caminhar."
      : "Clique no chão ou use WASD / setas. Aproxime-se de um inimigo para lutar.";
    $("auto-hunt").hidden = this.isLobby;
    $("return-lobby").hidden = this.isLobby;
    $("auto-hunt").textContent = save.autoHunt
      ? "Parar caçada automática"
      : "Iniciar caçada automática";
    $("cast-skill").hidden = this.isLobby;
    ($("cast-skill") as HTMLButtonElement).disabled =
      save.paused ||
      this.hunt.phase !== "combatendo" ||
      this.hunt.chakra < 35 ||
      this.hunt.skillCooldown > 0;
    const phase = save.paused
      ? "Pausado"
      : this.isLobby
        ? "Lobby · movimento livre"
        : this.hunt.phase;
    $("status").innerHTML =
      `<div class="level">Nível ${save.level}<span>${phase}</span></div><div class="meter"><i style="width:${(this.hunt.hp / st.maxHp) * 100}%"></i></div><p class="caption">Vida ${Math.ceil(this.hunt.hp)} / ${st.maxHp}</p><div class="meter xp"><i style="width:${pct}%"></i></div><p class="caption">${save.xp} / ${needed(save.level)} XP</p><div class="meter chakra"><i style="width:${(this.hunt.chakra / st.maxChakra) * 100}%"></i></div><p class="caption">Chakra ${Math.floor(this.hunt.chakra)} / ${st.maxChakra}</p><dl><dt>Moedas</dt><dd>${save.coins}</dd><dt>Vitórias</dt><dd>${save.kills}</dd><dt>Derrotas</dt><dd>${save.defeats}</dd><dt>Fragmentos</dt><dd>${save.inventory.fragmento || 0}</dd></dl>`;
    $("session").textContent =
      `${Math.floor((Date.now() - session.start) / 60000)} min · ${session.wins} vitórias · ${session.xp} XP · ${session.coins} moedas`;
  }
}
