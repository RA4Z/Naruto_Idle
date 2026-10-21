import { Minimap } from "./world/minimap";
import { RouteOverlay } from "./world/route-overlay";
import {
  t,
  th,
  phaseText,
  localizeContent,
  errorText,
  formatNumber,
} from "./i18n/core.ts";
import { NativeForegroundLayer } from "./world/native-foreground";
import {
  acquireJourney,
  assertJourneyOwner,
  ownsJourney as ownsLocalJourney,
  releaseJourney,
  writeJourney,
} from "./journey-lock";
import {
  cloudJourneyOwner,
  cloudJourneyActive,
  queueCloudSave,
  openCloudJourney,
  closeCloudJourney,
  restoreGuestCache,
} from "./cloud/journey";
import { cloudError } from "./cloud/ui";
function ownsJourney() {
  return ownsLocalJourney() && cloudJourneyOwner();
}
import { getPreferences } from "./preferences";
import { FootstepCadence } from "./audio/footsteps";
import { foregroundPlan } from "./world/foreground-plan";
import { probeNativeForeground } from "./world/foreground-diagnostics";
import { loadingScreen } from "./loading-screen";
import { buttonCue } from "./audio/ui-cues";
import { runtimeIndex } from "./assets/runtime-index";
import { loadSceneAssets } from "./assets/scene-loader";
import { installArena } from "./arena/ui";
import { installMiniWindow } from "./mini-window";
import { localhostTransferUrl } from "./progression/local-transfer";
import { installProgression } from "./progression/ui";
import { recruit, STARTER_COLLECTION } from "./progression/rules";
import { ITEMS } from "./progression/rules";
import { recruitProfile } from "./progression/recruit-profiles";
import { strikeDuration } from "./progression/combat-stats";
import {
  activeCharacterId,
  starterCharacter,
  selectCharacter,
  FUTURE_CHARACTERS,
  characterLoadout,
  syncCharacterProgress,
  trainCharacter,
} from "./progression/character-progress";
import Phaser from "phaser";
import "./style.css";
import {
  PresentationPlayer,
  queuePresentation,
  type PresentationConfig,
} from "./presentation";
import { entityCatalog } from "./entities/catalog";
import { AutoHuntNavigator } from "./world/auto-hunt";
import { WorldOcclusion } from "./world/occlusion";
import { deathFadeDelay, actorVisualScale } from "./entities/visual-rules";
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
import { visionRadius } from "./world/awareness";
import { AREAS, type CharacterId } from "./data";
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
  {
    animations: Record<string, Anim>;
    warnings: unknown[];
  }
>;
const canvasHost = document.getElementById("canvas")!;
const $ = (id: string) =>
  id === "canvas" ? canvasHost : document.getElementById(id)!;
const localStore = new LocalProgressStore();
const store = {
  read: () => localStore.read(),
  write: (value: string) => {
    writeJourney(value);
    queueCloudSave(value);
  },
};
let save: Save;
let game: Phaser.Game | undefined;
let worldReady = false;
let scene: HuntScene;
let definitions: AnimSet;
let presentationData: PresentationConfig;
let launchVersion = 0;
let initialMap: WorldMap;
let initialNavigation: NativeGrid;
let worldMaps: WorldMap[];
const specialAction = () =>
  presentationData.characters[starterCharacter(save) || "recruit"]?.action ||
  "SP_skill1";
const heroBattleActions = () => [
  "C_idle",
  "A_1hit",
  "C_dead",
  ...(starterCharacter(save) ? [specialAction()] : []),
];
const presentationCharacter = () => starterCharacter(save) || "recruit";
let cast: {
  hero: EntityManifest;
  enemies: EntityManifest[];
  npcs: EntityManifest[];
  party: EntityManifest[];
};
const miniWindow = installMiniWindow({
  button: $("mini-window") as HTMLButtonElement,
  canvas: canvasHost,
  notify: toast,
  summary: () =>
    scene?.hunt
      ? t("main.3331da37dd", {
          v0: cast.hero.name,
          v1: save.level,
          v2: save.paused
            ? t("common.paused")
            : scene.isLobby
              ? t("main.5c0b464698")
              : phaseText(scene.hunt.phase),
          v3: Math.ceil(scene.hunt.hp),
          v4: stats(save).maxHp,
          v5: Math.floor(scene.hunt.chakra),
        })
      : t("common.loading"),
  onViewport: bindMiniViewport,
  openOnLocalhost: () => {
    commit();
    location.assign(localhostTransferUrl(location.href, store.read()!));
  },
});
function bindMiniViewport(host: Window) {
  const current = game!;
  const keyboard = current.input.keyboard!;
  const originalTarget = keyboard.target;
  const external = host !== window;
  const pauseSoundOnBlur = current.sound.pauseOnBlur;
  const updateBounds = () => {
    current.scale.updateBounds();
    if (external && canvasHost.ownerDocument !== document) {
      // Phaser normally adds the opener's page scroll to these coordinates.
      const bounds = current.canvas.getBoundingClientRect();
      current.scale.canvasBounds.x = bounds.left + host.scrollX;
      current.scale.canvasBounds.y = bounds.top + host.scrollY;
    }
  };
  const resize = () => {
    const rect = canvasHost.getBoundingClientRect();
    if (rect.width && rect.height) {
      current.scale.getParentBounds();
      // A collapsed/fractional viewport must never create a zero-sized WebGL target.
      // Keep this in sync with the Scale Manager limits (including automatic resizes).
      current.scale.resize(
        Math.max(160, Math.floor(rect.width)),
        Math.max(90, Math.floor(rect.height)),
      );
      scene.cameras.main.centerOn(scene.hero.x, scene.hero.y);
      updateBounds();
    }
  };
  const resetKeys = () => {
    scene?.input.keyboard?.resetKeys();
    current.input.activePointer.reset();
  };
  const releaseMouse = (event: MouseEvent) =>
    current.input.mouse?.onMouseUpWindow(event);
  const observer = new ResizeObserver(resize);
  observer.observe(canvasHost);
  host.addEventListener("resize", resize);
  host.addEventListener("blur", resetKeys);
  for (const event of ["mousedown", "touchstart"])
    canvasHost.addEventListener(event, updateBounds, { capture: true });
  let frame = 0;
  if (external) {
    current.events.emit(Phaser.Core.Events.FOCUS);
    current.sound.pauseOnBlur = false;
    scene.presentation.unlock();
    keyboard.stopListeners();
    keyboard.target = host;
    keyboard.startListeners();
    host.addEventListener("mouseup", releaseMouse);
    resetKeys();
    // Let the visible PiP document own the animation clock while the original tab is hidden.
    current.loop.sleep();
    const tick = () => {
      if (game !== current || host.closed) return;
      current.loop.focus();
      current.loop.tick();
      frame = host.requestAnimationFrame(tick);
    };
    frame = host.requestAnimationFrame(tick);
  }
  resize();
  return () => {
    observer.disconnect();
    host.removeEventListener("resize", resize);
    host.removeEventListener("blur", resetKeys);
    for (const event of ["mousedown", "touchstart"])
      canvasHost.removeEventListener(event, updateBounds, { capture: true });
    resetKeys();
    if (external) {
      current.sound.pauseOnBlur = pauseSoundOnBlur;
      current.events.emit(
        document.hasFocus()
          ? Phaser.Core.Events.FOCUS
          : Phaser.Core.Events.BLUR,
      );
      host.removeEventListener("mouseup", releaseMouse);
      host.cancelAnimationFrame(frame);
      keyboard.stopListeners();
      keyboard.target = originalTarget;
      keyboard.startListeners();
      current.loop.resetDelta();
      current.loop.wake();
    }
    commit();
    window.requestAnimationFrame(() => {
      if (game === current) resize();
    });
  };
}
for (const id of ["maps", "return-lobby", "progression", "arena", "library"])
  $(id).addEventListener("click", () => miniWindow.restore(), {
    capture: true,
  });
const openLibrary = installLibrary(
  async (id, role) => {
    if (!scene || !game) throw new Error(t("main.67ed697360"));
    if (role === "companion" && save.collection?.includes(id))
      await switchHero(id);
    else await scene.chooseEntity(id, role);
  },
  () => new Set(save?.collection || STARTER_COLLECTION),
);
window.addEventListener("open-character-archive", () => void openLibrary());
const openProgression = installProgression(() => ({
  save,
  heroId: activeCharacterId(save),
  switchCharacter: switchHero,
  canSwitch: () =>
    worldReady &&
    !switchingHero &&
    !scene.loadingActor &&
    scene.hunt.phase === "explorando",
  onChange: () => {
    scene.hunt.hp = Math.min(scene.hunt.hp, stats(save).maxHp);
    scene.hunt.chakra = Math.min(scene.hunt.chakra, stats(save).maxChakra);
    commit();
    scene.renderUI();
  },
}));
$("progression").onclick = () => openProgression();
$("library").textContent = t("qol.owned");
$("library").onclick = () => openProgression("collection");
let switchingHero = false;
async function switchHero(id: string) {
  if (switchingHero || !worldReady || scene.loadingActor)
    throw new Error(t("main.bca7c6597d"));
  if (id === activeCharacterId(save)) return;
  if (scene.hunt.phase !== "explorando") throw new Error(t("main.62ce2518fe"));
  if (!save.collection?.includes(id) || FUTURE_CHARACTERS.has(id))
    throw new Error(t("main.ffc1895c38"));
  switchingHero = true;
  const previous = game!;
  previous.loop.sleep();
  try {
    const manifest = await entityCatalog.get(id);
    if (game !== previous || !worldReady) throw new Error(t("main.d076b8fb31"));
    if (
      manifest.collection !== "playable" ||
      !manifest.capabilities.companion ||
      !manifest.modes.world?.animations.idle_0 ||
      !manifest.modes.world?.animations.run_0 ||
      !manifest.modes.battle?.animations.C_idle ||
      !manifest.modes.battle?.animations.A_1hit
    )
      throw new Error(t("main.3e53f56b0c"));
    commit();
    const next = structuredClone(save);
    selectCharacter(next, id);
    next.area = AREAS.reduce(
      (chosen, area, index) =>
        index <= next.area && area.level <= next.level ? index : chosen,
      0,
    );
    next.autoHunt = false;
    // Close the dialog before the loading overlay is displayed in the top layer.
    document
      .querySelectorAll<HTMLDialogElement>("dialog[open]")
      .forEach((dialog) => dialog.close());
    previous.loop.wake();
    await start(next);
  } finally {
    switchingHero = false;
    if (game === previous) previous.loop.wake();
  }
}
const openArena = installArena(
  () => save.character,
  (character) => characterLoadout(save, character),
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
    if (!scene || !game) throw new Error(t("main.f0ca8ca6a9"));
    await scene.travel(map);
  },
  () => ({ area: AREAS[save.area], level: save.level }),
  (index) => {
    if (
      !AREAS[index] ||
      save.level < AREAS[index].level ||
      scene.hunt.phase !== "explorando" ||
      scene.loadingActor
    )
      return;
    save.area = index;
    commit();
    scene.renderUI();
  },
);
$("maps").onclick = () => void openTravel();
$("auto-hunt").onclick = () => scene?.toggleHunt();
$("return-lobby").onclick = () =>
  void scene
    .travel(worldMaps.find((m) => m.id === "10001")!)
    .catch((e) => toast(errorText(e)));
const session = { activeMs: 0, xp: 0, coins: 0, wins: 0, defeats: 0 };
const sessionSegments = new Map<string, typeof session & { name: string }>();
function sessionSegment() {
  const key = `${activeCharacterId(save)}:${scene.map.id}`;
  if (!sessionSegments.has(key))
    sessionSegments.set(key, {
      activeMs: 0,
      xp: 0,
      coins: 0,
      wins: 0,
      defeats: 0,
      name: `${cast.hero.name} · ${scene.map.name}`,
    });
  return sessionSegments.get(key)!;
}
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
  if (save && worldReady && ownsJourney()) {
    if (scene?.hero?.active && scene.map?.id === save.location)
      save.worldPosition = {
        mapId: scene.map.id,
        x: scene.hero.x,
        y: scene.hero.y,
      };
    save.lastSaved = Date.now();
    syncCharacterProgress(save);
    store.write(JSON.stringify(save));
  }
}
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  setTimeout(() => $("toast").classList.remove("visible"), 6000);
}
let startup:
  | {
      version: number;
      stage: ReturnType<typeof loadingScreen.begin>;
      failed: Set<string>;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | undefined;
export async function startNewJourney(character: CharacterId) {
  await startCloudJourney(fresh(character));
}
export async function startCloudJourney(initial?: Save) {
  const restored = await openCloudJourney(initial);
  try {
    await start(restored.save);
  } catch (error) {
    await closeCloudJourney().catch(() => {});
    throw error;
  }
}
export async function continueJourney() {
  await startCloudJourney();
}
async function start(s: Save) {
  if (!cloudJourneyActive() || !cloudJourneyOwner()) throw new Error("AUTH_REQUIRED");
  await acquireJourney();
  miniWindow.restore();
  worldReady = false;
  const request = ++launchVersion;
  const stage = loadingScreen.begin(
    t("main.ddc49b1c5f"),
    () => void start(s).catch((error) => stage.fail(error)),
    () => $("back").click(),
  );
  stage.update(t("main.9a19a0e75a"), 0.05);
  try {
    const [presentation, maps, runtime] = await Promise.all([
      presentationData ||
        fetch("/assets/presentation.json", {
          signal: AbortSignal.timeout(20000),
        }).then(async (r) => {
          if (!r.ok) throw new Error(t("main.44ff29f375"));
          return localizeContent(await r.json());
        }),
      listMaps(),
      runtimeIndex(),
    ]);
    if (request !== launchVersion) return;
    assertJourneyOwner();
    presentationData = presentation;
    const startMap =
      maps.find((m) => m.id === s.location) ||
      maps.find((m) => m.id === "10001")!;
    const load = async (id: string | undefined, role: ActorRole) => {
      if (!id || !runtime.entities[id]) return undefined;
      const manifest = await entityCatalog.get(id);
      return manifest.capabilities[role] ? manifest : undefined;
    };
    const [startNavigation, hero, enemyModels, residentModels, partyModels] =
      await Promise.all([
        mapNavigation(startMap),
        entityCatalog.get(activeCharacterId(s)),
        Promise.all(
          (startMap.kind === "lobby"
            ? []
            : s.enemyId
              ? [s.enemyId]
              : startMap.enemies
          ).map((id) => load(id, "enemy")),
        ),
        Promise.all(
          (s.npcIds || ["11001601", "11001201"])
            .slice(0, 3)
            .map((id) => load(id, "npc")),
        ),
        Promise.resolve([] as EntityManifest[]),
      ]);
    if (request !== launchVersion) return;
    const enemies = enemyModels.filter((m): m is EntityManifest => !!m);
    if (startMap.kind !== "lobby" && !enemies.length)
      throw new Error(t("main.9298b997a2"));
    const npcs = residentModels.filter((m): m is EntityManifest => !!m);
    const party = partyModels.filter((m): m is EntityManifest => !!m);
    if (import.meta.env.DEV)
      delete (
        window as unknown as {
          __idle?: unknown;
        }
      ).__idle;
    if (game) {
      const previous = game;
      await new Promise<void>((resolve) => {
        previous.events.once(Phaser.Core.Events.DESTROY, resolve);
        previous.destroy(true);
        previous.loop.wake();
      });
      if (request !== launchVersion) return;
      game = undefined;
    }
    save = s;
    s.partyIds = [];
    delete s.companionId;
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
    if (!recovering && !switchingHero) {
      session.activeMs = 0;
      session.xp = session.coins = session.wins = session.defeats = 0;
      sessionSegments.clear();
    }
    messages.length = 0;
    await new Promise<void>((resolve, reject) => {
      startup = { version: request, stage, failed: new Set(), resolve, reject };
      game = new Phaser.Game({
        type: graphicsFallback ? Phaser.CANVAS : Phaser.AUTO,
        parent: "canvas",
        backgroundColor: "#15241e",
        width: $("canvas").clientWidth,
        height: $("canvas").clientHeight,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          min: { width: 160, height: 90 },
        },
        scene: HuntScene,
        autoFocus: false,
        loader: { maxParallelDownloads: 4, timeout: 20000 },
        render: { antialias: true, roundPixels: false },
        audio: { noAudio: false },
      });
    });
    if (request !== launchVersion) return;
    worldReady = true;
    bindGraphicsRecovery(game!);
    commit();
    stage.finish();
  } catch (error) {
    if (request === launchVersion) {
      worldReady = false;
      game?.destroy(true);
      game = undefined;
      $("play").hidden = true;
      $("menu").hidden = false;
      stage.fail(error);
    }
    throw error;
  }
}
$("back").onclick = async () => {
  const wasCloud = cloudJourneyActive();
  if (wasCloud) {
    miniWindow.restore();
    commit();
    game?.loop.sleep();
    try {
      await closeCloudJourney();
    } catch (error) {
      toast(cloudError(error));
      game?.loop.wake();
      return;
    }
    worldReady = false;
  }
  recovering = false;
  miniWindow.restore();
  launchVersion++;
  startup?.reject(new Error(t("main.942c696ec9")));
  loadingScreen.hide();
  if (import.meta.env.DEV)
    delete (
      window as unknown as {
        __idle?: unknown;
      }
    ).__idle;
  if (!wasCloud) commit();
  game?.destroy(true);
  game = undefined;
  worldReady = false;
  releaseJourney();
  $("play").hidden = true;
  $("menu").hidden = false;
  window.dispatchEvent(new Event("account-menu"));
};
$("pause").onclick = () => {
  save.paused = !save.paused;
  commit();
};
$("upgrade").onclick = () => {
  try {
    trainCharacter(save);
  } catch (error) {
    toast(errorText(error));
    return;
  }
  scene.hunt.hp = Math.min(stats(save).maxHp, scene.hunt.hp + 9);
  journal(t("main.a9b45f2d07"));
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
  if (save.sound)
    void scene.ensureAudio().catch((error) => toast(errorText(error)));
  commit();
};
$("music").onchange = () => {
  save.music = ($("music") as HTMLInputElement).checked;
  scene.presentation.unlock();
  scene.presentation.settings(save.sound, save.music, save.soundVolume ?? 0.4);
  if (save.sound)
    void scene.ensureAudio().catch((error) => toast(errorText(error)));
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
document.addEventListener(
  "click",
  (event) => {
    if (
      !worldReady ||
      !scene?.sys.isActive() ||
      !(event.target instanceof Element)
    )
      return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (!button) return;
    const cue = buttonCue(button);
    if (cue) scene.presentation.ui(cue);
  },
  { capture: true },
);
window.addEventListener("pagehide", () => {
  commit();
  releaseJourney();
  game?.loop.sleep();
});
window.addEventListener("before-language-change", (event) => {
  miniWindow.restore();
  commit();
  if (cloudJourneyActive()) {
    game?.loop.sleep();
    const task = closeCloudJourney()
      .then(() => {
        sessionStorage.setItem("folha-idle-cloud-resume", "1");
        releaseJourney();
      })
      .catch((error) => {
        game?.loop.wake();
        throw error;
      });
    (event as CustomEvent<{ tasks: Promise<void>[] }>).detail.tasks.push(task);
    return;
  }
  releaseJourney();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) commit();
  else if (worldReady && !ownsJourney())
    window.dispatchEvent(new Event("journey-lock-lost"));
  else {
    game?.loop.resetDelta();
    game?.scale.refresh();
  }
});
window.addEventListener("journey-lock-lost", (event) => {
  // Never commit stale in-memory state after another tab acquires the lease.
  worldReady = false;
  recovering = false;
  releaseJourney();
  launchVersion++;
  miniWindow.restore();
  game?.destroy(true);
  game = undefined;
  $("play").hidden = true;
  $("menu").hidden = false;
  loadingScreen.hide();
  toast(
    (event as CustomEvent<{ cloud?: boolean }>).detail?.cloud
      ? t("cloud.lost")
      : t("qol.otherTab"),
  );
});
window.addEventListener("preferences-change", () => {
  if (worldReady)
    scene.presentation.settings(
      save.sound,
      save.music || false,
      save.soundVolume ?? 0.4,
    );
});
let recovering = false;
let graphicsFallback = false;
function bindGraphicsRecovery(current: Phaser.Game) {
  const canvas = current.canvas;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rebuilding = false;
  const recover = async () => {
    if (game !== current || !recovering || rebuilding || !ownsJourney()) return;
    rebuilding = true;
    if (timer) clearTimeout(timer);
    try {
      // Use the committed snapshot, not a partially executed combat or loader.
      const snapshot = JSON.parse(store.read()!) as Save;
      await start(snapshot);
      toast(t("qol.recovered"));
    } catch {
      /* The loading overlay exposes a retry and return-to-menu action. */
    } finally {
      recovering = false;
    }
  };
  const lost = (event: Event) => {
    event.preventDefault();
    if (game !== current || recovering) return;
    commit();
    recovering = true;
    worldReady = false;
    miniWindow.restore();
    current.loop.sleep();
    loadingScreen.begin(
      t("qol.recovering"),
      () => void recover(),
      () => $("back").click(),
    );
    // A browser may never restore a GPU context; rebuild with Canvas after timeout.
    timer = setTimeout(() => {
      graphicsFallback = true;
      void recover();
    }, 4000);
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", recover);
  current.events.once(Phaser.Core.Events.DESTROY, () => {
    if (timer) clearTimeout(timer);
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", recover);
  });
}
function direction(dx: number, dy: number) {
  return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 14) % 8;
}
class HuntScene extends Phaser.Scene {
  private startup = startup!;
  private combatReady = false;
  private audioLoad?: Promise<void>;
  private audioReady = false;
  private shownLevel?: number;
  hunt!: Hunt;
  hero!: Phaser.GameObjects.Sprite;
  enemy!: EntityActor;
  npcs: EntityActor[] = [];
  actorCache!: ActorAssetCache;
  loadingActor = false;
  encounterSequence = 0;
  private autoNavigator = new AutoHuntNavigator<EntityActor>();
  private manualTarget?: EntityActor;
  private manualRepathMs = 0;
  private minimap?: Minimap;
  private routeOverlay?: RouteOverlay;
  bars!: Phaser.GameObjects.Graphics;
  groundShadow!: Phaser.GameObjects.Ellipse;
  private footsteps = new FootstepCadence();
  private combatStartedAt = 0;
  private firstStrikeMs?: number;
  lastSave = 0;
  lastUi = 0;
  lastAnim = "";
  presentation!: PresentationPlayer;
  lastStrikeDuration = 300;
  constructor() {
    super("hunt");
  }
  preload() {
    this.load.on("progress", (value: number) =>
      this.startup.stage.update(
        t("main.0f7ab66f9a", { v0: Math.round(value * 100) }),
        0.2 + value * 0.75,
      ),
    );
    this.load.on("loaderror", (file: Phaser.Loader.File) =>
      this.startup.failed.add(file.key),
    );
    this.load.image("map-" + initialMap.id, initialMap.background);
    this.load.image(
      "map-" + initialMap.id + "-foreground",
      foregroundPlan(initialMap, this.game.renderer.type === Phaser.WEBGL).url,
    );
    queuePresentation(this, presentationData, presentationCharacter(), {
      effects: initialMap.kind !== "lobby",
      audio: false,
    });
    for (const manifest of cast.enemies) {
      queueActor(this, manifest, "enemy");
      if (manifest.capabilities.companion)
        queueActor(this, manifest, "companion");
    }
    for (const manifest of cast.npcs) queueActor(this, manifest, "npc");
    for (const manifest of cast.party) queueActor(this, manifest, "companion");
    for (const mode of ["world", "battle"]) {
      const set = definitions[save.character + "-" + mode]?.animations || {};
      for (const [action, anim] of Object.entries(set)) {
        if (
          mode === "world" ||
          (initialMap.kind !== "lobby" && heroBattleActions().includes(action))
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
    if (this.startup.failed.size) {
      this.startup.reject(new Error(t("main.6f5e01fe73")));
      this.scene.stop();
      return;
    }
    scene = this;
    this.combatReady = initialMap.kind !== "lobby";
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
      presentationCharacter(),
      this.map.id,
    );
    this.presentation.setActors(
      this.isLobby ? [] : [cast.hero.id, ...cast.enemies.map((e) => e.id)],
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
    this.occlusion = new WorldOcclusion(this);
    this.occlusion.setMap(this.map);
    this.events.once("shutdown", () => this.occlusion.clear());
    this.foreground = new NativeForegroundLayer(this);
    this.foreground.setMap(this.map);
    this.events.once("shutdown", () => this.foreground.destroy());
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
    for (const manifest of cast.npcs) registerActor(this, manifest, "npc");
    for (const manifest of cast.party)
      registerActor(this, manifest, "companion");
    this.enemy = new EntityActor(
      this,
      spawn.x,
      spawn.y,
      cast.enemies[0] || cast.hero,
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
    this.routeOverlay = new RouteOverlay(this);
    this.minimap = new Minimap(canvasHost, (point) => {
      if (
        save.paused ||
        this.loadingActor ||
        this.hunt.phase !== "explorando" ||
        document.querySelector("dialog[open]")
      )
        return false;
      return this.walkTo(point);
    });
    this.minimap.setMap(this.map, this.navigation.points);
    const destroyMinimap = () => this.minimap?.destroy();
    this.events.once("shutdown", destroyMinimap);
    this.events.once("destroy", destroyMinimap);
    this.hunt.onEvent = (event, value, id) => this.effect(event, value, id);
    $("hero-name").textContent = cast.hero.name;
    ($("sound") as HTMLInputElement).checked = save.sound;
    ($("music") as HTMLInputElement).checked = save.music || false;
    ($("volume") as HTMLInputElement).value = String(
      (save.soundVolume ?? 0.4) * 100,
    );
    journal(
      this.isLobby
        ? t("main.7b721e9774")
        : t("common.explorePrefix") + this.map.name + t("common.optionalHunt"),
    );
    this.events.once("shutdown", () => {
      if (import.meta.env.DEV && scene === this)
        delete (
          window as unknown as {
            __idle?: unknown;
          }
        ).__idle;
    });
    if (import.meta.env.DEV)
      (
        window as unknown as {
          __idle: unknown;
        }
      ).__idle = {
        snapshot: () => ({
          activeEntityId: activeCharacterId(save),
          phase: this.isLobby ? "lobby" : this.hunt.phase,
          mapId: this.map.id,
          mode: this.map.kind,
          autoHunt: !!save.autoHunt,
          speed: stats(save).moveSpeed,
          attributes: stats(save).attributes,
          attackInterval: stats(save).interval,
          attacks: this.hunt.attacks,
          firstStrikeMs: this.firstStrikeMs,
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
          animationTimeScale: this.hero.anims.timeScale,
          heroSpriteInstances: this.children.list.filter(
            (o) =>
              o instanceof Phaser.GameObjects.Sprite &&
              /^(world|battle)-/.test(o.texture.key),
          ).length,
          gameLoopRunning: this.game.loop.running,
          audioReady: this.audioReady,
          audioState:
            this.sound instanceof Phaser.Sound.WebAudioSoundManager
              ? this.sound.context.state
              : "html",
          origin: [this.hero.originX, this.hero.originY],
          scale: this.hero.scaleX,
          zoom: this.cameras.main.zoom,
          viewport: {
            worldX: this.cameras.main.worldView.x,
            worldY: this.cameras.main.worldView.y,
            width: this.cameras.main.width,
            height: this.cameras.main.height,
            canvasWidth: this.game.canvas.width,
            canvasHeight: this.game.canvas.height,
            heroVisible: this.cameras.main.worldView.contains(
              this.hero.x,
              this.hero.y,
            ),
          },
          pointer: {
            x: this.input.activePointer.x,
            y: this.input.activePointer.y,
          },
          walkable: this.navigation.walkable(this.hero),
          enemyWalkable: this.navigation.walkable(this.enemy),
          presentation: this.presentation.snapshot(),
          actorCache: this.actorCache.snapshot(),
          enemyId: this.enemy.manifest.id,
          enemyProfile:
            this.hunt.phase === "explorando"
              ? this.enemyField.profileFor(this.enemy)
              : this.hunt.enemy,
          targetId: this.hunt.targetId,
          visionDebug: this.enemyField.visionVisible,
          opponents: this.hunt.livingOpponents.map((e) => ({
            ...e,
            profile: e.profile,
          })),
          enemyHp: this.hunt.enemyHp,
          heroStyle:
            starterCharacter(save) ||
            recruitProfile(activeCharacterId(save)).style,
          enemyAnimation: this.enemy.visual.anims.currentAnim?.key,
          enemyScale: this.enemy.visual.scaleX,
          enemyFlipped: this.enemy.visual.flipX,
          occlusion: this.occlusion.snapshot(),
          nativeForeground: {
            texture: this.foreground.image.texture.key,
            visible: this.foreground.image.visible,
            depth: this.foreground.image.depth,
            masked: !!this.foreground.alpha,
          },
          enemyVisible: this.enemy.visible,
          enemies: this.enemyField.members.map((m) => ({
            id: m.actor.manifest.id,
            key: m.id,
            alerted: m.awareness.alerted,
            returning: m.awareness.returning,
            heading: { ...m.heading },
            elite: m.profile.elite,
            kind: m.profile.kind,
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
        // Development-only reproducible positioning for awareness/group regression tests.
        arrange: (
          hero: Point,
          enemies: { key: string; point: Point; heading: Point }[],
        ) => {
          if (
            this.hunt.phase !== "explorando" ||
            !this.navigation.walkable(hero)
          )
            throw new Error("Invalid scenario");
          for (const item of enemies)
            if (
              !this.enemyField.byId(item.key) ||
              !this.navigation.walkable(item.point)
            )
              throw new Error("Invalid enemy position");
          this.hero.setPosition(hero.x, hero.y);
          this.path = [];
          save.autoHunt = false;
          for (const item of enemies) {
            const mob = this.enemyField.byId(item.key)!;
            mob.actor.setPosition(item.point.x, item.point.y);
            mob.home = { ...item.point };
            mob.heading = { ...item.heading };
            mob.path = [];
            mob.wait = 60000;
            mob.awareness = { alerted: false, returning: false, unseenMs: 0 };
            mob.repathMs = 0;
            mob.stuckMs = 0;
          }
        },
        probeNativeForeground: async (source: Point) => {
          const paused = save.paused;
          save.paused = true;
          try {
            return await probeNativeForeground(
              this,
              this.foreground,
              this.hero,
              source,
            );
          } finally {
            save.paused = paused;
          }
        },
        previewSkill: () => this.effect("skill", stats(save).skillDamage),
        setHp: (hp: number) => {
          this.hunt.hp = hp;
        },
      };
    this.renderUI();
    this.startup.stage.update(t("main.161cf74cd8"), 0.98);
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      if (!this.sys.isActive() || this.startup.version !== launchVersion)
        return;
      this.startup.resolve();
      if (save.sound)
        void this.ensureAudio().catch((error) => toast(errorText(error)));
      const timer = window.setTimeout(() => {
        if (!this.sys.isActive()) return;
        for (const manifest of cast.npcs)
          if (manifest.capabilities.companion)
            void this.actorCache.load(manifest, "companion").catch(() => {});
      }, 300);
      this.events.once("shutdown", () => clearTimeout(timer));
    });
  }
  private registerHeroBattle() {
    for (const [action, anim] of Object.entries(
      definitions[save.character + "-battle"]?.animations || {},
    )) {
      const key = "battle-" + action;
      if (!this.textures.exists(key) || this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: (
          anim.timeline || Array.from({ length: anim.frames }, (_, i) => i)
        ).map((frame) => ({ key, frame })),
        frameRate: anim.fps,
        repeat: action === "C_idle" ? -1 : 0,
      });
    }
    this.presentation.registerEffects();
  }
  async ensureCombat() {
    if (this.combatReady) return;
    await loadSceneAssets(
      this,
      () => {
        queuePresentation(this, presentationData, presentationCharacter(), {
          effects: true,
          audio: false,
        });
        for (const action of heroBattleActions()) {
          const anim =
            definitions[save.character + "-battle"]?.animations[action];
          if (anim && !this.textures.exists("battle-" + action))
            this.load.spritesheet("battle-" + action, anim.url, {
              frameWidth: anim.frameWidth,
              frameHeight: anim.frameHeight,
              endFrame: anim.frames - 1,
            });
        }
      },
      () => this.combatReady,
    );
    if (!this.sys.isActive()) throw new Error(t("main.426b6eda53"));
    this.registerHeroBattle();
    this.combatReady = true;
  }
  ensureAudio() {
    if (!save.sound || this.audioReady) return Promise.resolve();
    let queued = false;
    return (this.audioLoad ??= loadSceneAssets(
      this,
      () => {
        queued = true;
        queuePresentation(this, presentationData, presentationCharacter(), {
          effects: false,
          audio: true,
        });
      },
      () => !save.sound || this.audioReady,
    )
      .then(() => {
        if (!this.sys.isActive()) return;
        if (queued) this.audioReady = true;
        this.presentation.settings(
          save.sound,
          save.music || false,
          save.soundVolume ?? 0.4,
        );
        this.presentation.pause(save.paused);
        this.presentation.unlock();
      })
      .finally(() => {
        this.audioLoad = undefined;
      }));
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
        actorVisualScale(
          cast.hero.id,
          mode,
          definition?.referenceHeight || 120,
          animation?.rigScale ?? 1,
        ),
      );
      this.hero.setFlipX(
        key.startsWith("battle-") && this.enemy.x < this.hero.x,
      );
      this.hero.play(key);
      this.hero.anims.timeScale =
        key === "battle-" + specialAction() || key === "battle-A_1hit"
          ? this.hero.anims.currentAnim!.duration /
            strikeDuration(
              key === "battle-" + specialAction(),
              stats(save).interval,
            )
          : key.startsWith("world-run_")
            ? stats(save).moveSpeed / 96
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
  effect(event: string, value: number, id?: string) {
    const source =
      (id ? this.enemyField.byId(id)?.actor : undefined) || this.enemy;
    if (event === "target") {
      this.enemy = source;
      this.hero.setFlipX(source.x < this.hero.x);
      source.face(this.hero.x < source.x);
    }
    if (event === "disengage") {
      this.manualTarget = undefined;
      this.placeEnemy();
      this.play("world-idle_0");
    }
    if (event === "encounter") {
      this.combatStartedAt = performance.now();
      this.firstStrikeMs = undefined;
      this.presentation.stopFootsteps();
      this.enemy.play("battle", "C_idle", true);
      this.play("battle-C_idle");
      this.enemy.face(this.hero.x < this.enemy.x);
      // The target stays at its audited street position. No arbitrary X offset
      // can move an encounter into a building or across a fence.
      journal(t("main.b5b540d3b4"));
    }
    if (event === "attack" || event === "skill" || event === "technique") {
      this.firstStrikeMs ??= performance.now() - this.combatStartedAt;
      this.play(
        event === "skill" ? "battle-" + specialAction() : "battle-A_1hit",
        true,
      );
      this.floating(
        String(value),
        this.enemy.x,
        this.enemy.y - 43,
        event !== "attack" ? "#ffcc69" : "#fff3ce",
      );
      this.tweens.add({
        targets: this.enemy,
        angle: 5,
        duration: 60,
        yoyo: true,
      });
      this.enemy.play("battle", "C_hurt", true);
      this.presentation.entityAction(
        this.enemy.manifest.id,
        "C_hurt",
        1,
        "enemy",
      );
      this.lastStrikeDuration = strikeDuration(
        event === "skill",
        stats(save).interval,
      );
      this.presentation.play(
        event === "skill" ? "SP_skill1" : "A_1hit",
        this.hero,
        this.enemy,
        this.lastStrikeDuration,
      );
      if (!starterCharacter(save))
        this.presentation.entityAction(
          cast.hero.id,
          "A_1hit",
          this.lastStrikeDuration,
          "hero",
        );
      if (event === "skill")
        journal(
          t("common.jutsuPrefix") +
            presentationData.characters[save.character].name,
        );
      if (event === "technique")
        journal(
          t("balance.techniqueUsed", {
            name: t(
              `balance.technique.${recruitProfile(activeCharacterId(save)).style}`,
            ),
          }),
        );
    }
    if (event === "heal")
      this.floating("+" + value, this.hero.x, this.hero.y - 60, "#b8f7a5");
    if (event === "enemy-windup")
      journal(t("balance.enemyWindup", { name: source.manifest.name }));
    if (event === "enemy-heal")
      this.floating("+" + value, source.x, source.y - 60, "#b8f7a5");
    if (event === "equipment-drop") {
      const item = ITEMS.find(
        (item) => item.id === this.hunt.lastReward.equipment,
      );
      if (item) journal(t("balance.equipmentDrop", { name: item.name }));
    }
    if (event === "hurt" || event === "enemy-special") {
      source.play("battle", "A_1hit", true);
      this.presentation.entityAction(
        source.manifest.id,
        "A_1hit",
        (source.visual.anims.currentAnim?.duration || 450) /
          (source.visual.anims.timeScale || 1),
        "enemy",
      );
      this.floating(
        "-" + value,
        this.hero.x,
        this.hero.y - 53,
        event === "enemy-special" ? "#ffc74e" : "#ffc0a3",
      );
    }
    if (event === "loot") journal(t("main.ce48f03344", { v0: value }));
    if (event === "victory") {
      const defeatedEnemy = source;
      this.enemyField.defeat(defeatedEnemy);
      session.xp += value;
      session.coins += this.hunt.lastReward.coins;
      session.wins++;
      const segment = sessionSegment();
      segment.xp += value;
      segment.coins += this.hunt.lastReward.coins;
      segment.wins++;
      this.floating(
        "+" + value + " XP",
        this.hero.x,
        this.hero.y - 61,
        "#c5ffbd",
      );
      journal(
        t("main.92450b8e85", { v0: value, v1: this.hunt.lastReward.coins }),
      );
      this.renderParty();
      this.time.delayedCall(this.lastStrikeDuration * 0.85, () => {
        if (
          !defeatedEnemy.active ||
          !this.enemyField.members.some(
            (member) => member.actor === defeatedEnemy && !member.alive,
          )
        )
          return;
        defeatedEnemy.play("battle", "C_dead", true);
        const death = defeatedEnemy.manifest.modes.battle?.animations.C_dead;
        this.presentation.entityAction(
          defeatedEnemy.manifest.id,
          "C_dead",
          ((death?.timeline?.length || death?.frames || 1) * 1000) /
            (death?.fps || 24),
          "enemy",
        );
        this.tweens.add({
          targets: defeatedEnemy,
          alpha: 0,
          delay: deathFadeDelay(
            death?.timeline?.length || death?.frames || 0,
            death?.fps || 0,
          ),
          duration: 400,
          onComplete: () => {
            if (defeatedEnemy.active)
              defeatedEnemy.setVisible(false).setAlpha(1);
          },
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
      session.defeats++;
      sessionSegment().defeats++;
      this.play("battle-C_dead", true);
      this.presentation.play("C_dead", this.hero, this.enemy, 500);
      if (!starterCharacter(save))
        this.presentation.entityAction(cast.hero.id, "C_dead", 500, "hero");
      journal(t("main.e926cb9bf6"));
      commit();
    }
    if (event === "recover") {
      this.enemyField.disengageAll();
      this.hunt.opponents.clear();
      this.manualTarget = undefined;
      const spawn = this.navigation.nearest(this.map.spawn)!;
      this.hero.setPosition(spawn.x, spawn.y);
      this.party.reset(this.hero, this.navigation);
      journal(t("main.3977c42d13"));
    }
  }
  private startEncounter(actor: EntityActor) {
    const mob = this.enemyField.member(actor);
    if (!mob?.alive || this.hunt.phase !== "explorando") return;
    this.enemy = actor;
    this.enemyField.alert(actor);
    this.path = [];
    this.destination.setVisible(false);
    this.hunt.encounter(mob.profile, mob.id);
  }
  private syncEncounters() {
    if (this.isLobby) return;
    for (const foe of this.hunt.livingOpponents) {
      const mob = this.enemyField.byId(foe.id);
      if (!mob?.alive || !mob.awareness.alerted) this.hunt.leave(foe.id);
      else
        foe.inRange = this.enemyField.inRange(mob, this.hero, this.navigation);
    }
    if (this.hunt.phase === "explorando") {
      const ready = this.enemyField.members.filter(
        (m) =>
          m.alive &&
          m.awareness.alerted &&
          this.enemyField.inRange(m, this.hero, this.navigation),
      );
      const first = ready.find((m) => m.actor === this.enemy) || ready[0];
      if (first) this.startEncounter(first.actor);
    }
    if (["combatendo", "recompensas"].includes(this.hunt.phase))
      for (const mob of this.enemyField.members)
        if (mob.alive && mob.awareness.alerted)
          this.hunt.join(
            mob.id,
            mob.profile,
            this.enemyField.inRange(mob, this.hero, this.navigation),
          );
  }
  private chooseTarget(actor: EntityActor) {
    if (
      save.paused ||
      this.loadingActor ||
      document.querySelector("dialog[open]")
    )
      return false;
    const mob = this.enemyField.member(actor);
    if (!mob?.alive) return false;
    if (this.hunt.phase === "explorando") {
      if (this.enemyField.inRange(mob, this.hero, this.navigation)) {
        save.autoHunt = false;
        this.startEncounter(actor);
        this.renderUI();
        return true;
      }
      if (!this.walkTo(actor)) return false;
      this.enemy = actor;
      this.manualTarget = actor;
      this.manualRepathMs = 0;
      if (this.enemyField.inRange(mob, this.hero, this.navigation))
        this.startEncounter(actor);
    } else if (["combatendo", "recompensas"].includes(this.hunt.phase)) {
      if (!mob.awareness.alerted) {
        if (
          Math.hypot(actor.x - this.hero.x, actor.y - this.hero.y) >
            visionRadius(mob.profile) ||
          !this.navigation.clear(actor, this.hero)
        )
          return false;
        this.enemyField.alert(actor);
      }
      this.hunt.join(
        mob.id,
        mob.profile,
        this.enemyField.inRange(mob, this.hero, this.navigation),
      );
      if (!this.hunt.selectTarget(mob.id)) return false;
    } else return false;
    this.renderUI();
    return true;
  }
  private bindEnemy(actor: EntityActor) {
    actor.visual.setInteractive({ useHandCursor: true });
    actor.visual.on("pointerdown", () => this.chooseTarget(actor));
  }
  private renderCombatTargets() {
    let panel = document.getElementById("combat-targets");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "combat-targets";
      $("status").after(panel);
    }
    const foes = this.hunt.livingOpponents;
    panel.hidden =
      this.isLobby ||
      !["combatendo", "recompensas"].includes(this.hunt.phase) ||
      !foes.length;
    if (panel.hidden) {
      panel.replaceChildren();
      return;
    }
    let heading = panel.querySelector("p");
    if (!heading) {
      heading = document.createElement("p");
      panel.append(heading);
    }
    heading.textContent = t("stealth.attackers", { count: foes.length });
    for (const button of Array.from(
      panel.querySelectorAll<HTMLButtonElement>("button"),
    ))
      if (!foes.some((e) => e.id === button.dataset.targetId)) button.remove();
    for (const foe of foes) {
      const actor = this.enemyField.byId(foe.id)?.actor;
      if (!actor) continue;
      let button = Array.from(
        panel.querySelectorAll<HTMLButtonElement>("button"),
      ).find((b) => b.dataset.targetId === foe.id);
      if (!button) {
        button = document.createElement("button");
        button.className = "secondary";
        button.dataset.targetId = foe.id;
        button.onclick = () => this.chooseTarget(actor);
        panel.append(button);
      }
      button.textContent = t("stealth.targetHealth", {
        name: actor.manifest.name,
        hp: Math.ceil(foe.hp),
        max: foe.maxHp,
      });
      button.setAttribute(
        "aria-pressed",
        String(foe.id === this.hunt.targetId),
      );
      button.disabled = save.paused || this.loadingActor;
      button.title = t(foe.inRange ? "stealth.choose" : "stealth.approaching");
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
      toast(npc.manifest.name + t("main.bb8abca08d"));
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
      throw new Error(t("main.193cab3cff"));
    if (role === "npc" && !this.isLobby) throw new Error(t("main.ef2da6f38d"));
    if (
      role === "companion" &&
      (id === cast.hero.id ||
        this.party.members.some((m) => m.manifest.id === id))
    )
      throw new Error(t("main.1fa3efe045"));
    if (role === "companion" && FUTURE_CHARACTERS.has(id))
      throw new Error(t("main.5d62a61688"));
    if (role === "companion" && save.collection?.includes(id))
      throw new Error(t("main.2b514b3060"));
    if (role === "companion" && !save.collection?.includes(id)) {
      const manifest = await entityCatalog.get(id);
      if (
        manifest.collection !== "playable" ||
        !manifest.capabilities.companion
      )
        throw new Error(t("main.ede0188aee"));
      recruit(save, id);
      journal(manifest.name + t("main.f4a8ffa21e"));
      commit();
      return;
    }
    if (role === "companion" && this.party.members.length >= 3)
      throw new Error(t("main.03ba6e6afa"));
    if (this.loadingActor) throw new Error(t("main.bca7c6597d"));
    if (this.hunt.phase !== "explorando") throw new Error(t("main.319e894396"));
    this.loadingActor = true;
    try {
      const manifest = await entityCatalog.get(id);
      if (!manifest.capabilities[role]) throw new Error(t("main.8efefe8d9f"));
      await this.actorCache.load(
        manifest,
        role === "npc" && manifest.capabilities.companion ? "companion" : role,
      );
      if (role === "enemy" && manifest.capabilities.companion)
        await this.actorCache.load(manifest, "companion");
      if (!this.sys.isActive()) return;
      if (role === "enemy") {
        this.standbyEnemy.use(manifest, role);
        save.enemyId = id;
        cast.enemies = [manifest];
        this.presentation.setActors(
          this.isLobby ? [] : [cast.hero.id, manifest.id],
        );
        this.enemyField.mapId = "";
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
      journal(manifest.name + t("main.4bd3105b89"));
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
  foreground!: NativeForegroundLayer;
  occlusion!: WorldOcclusion;
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
    this.manualTarget = undefined;
    if (this.hunt.phase !== "explorando") {
      toast(t("main.9693b68fd2"));
      return false;
    }
    const path = this.navigation.path(this.hero, point);
    if (!path.length) {
      this.floating(t("main.463c2c1666"), this.hero.x, this.hero.y - 60);
      return false;
    }
    save.autoHunt = false;
    this.path = path;
    const end = path.at(-1)!;
    this.destination.setPosition(end.x, end.y).setVisible(true);
    this.renderUI();
    return true;
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
        .filter((m) => m.id !== cast.hero.id && !partyIds.has(m.id))
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
    this.autoNavigator.reset();
    this.manualTarget = undefined;
    this.enemyField ??= new EnemyField(this, (actor) => this.bindEnemy(actor));
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
      .text(
        0,
        -10,
        this.isLobby ? t("common.travelMarker") : t("common.returnMarker"),
        {
          fontFamily: t("main.ad77391333"),
          fontSize: "8px",
          color: "#ffe3a1",
          backgroundColor: "#14251ed9",
          padding: { x: 4, y: 3 },
        },
      )
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
          toast(errorText(e)),
        );
    });
  }
  async travel(map: WorldMap) {
    if (map.id === this.map.id) return;
    if (this.loadingActor) throw new Error(t("main.bca7c6597d"));
    if (this.hunt.phase !== "explorando") throw new Error(t("main.9c6a33d994"));
    this.loadingActor = true;
    document.querySelector<HTMLDialogElement>(".map-library")?.close();
    const stage = loadingScreen.begin(
      t("main.80bfdbb9d3") + map.name,
      () => void this.travel(map).catch(() => {}),
      () => $("back").click(),
    );
    stage.update(t("main.fdf7f6902c"), 0.05);
    const old = this.map;
    const progress = (value: number) =>
      stage.update(t("main.8be7deb387", { v0: Math.round(value * 100) }));
    this.load.on("progress", progress);
    try {
      const grid = await mapNavigation(map);
      if (!this.sys.isActive()) return;
      if (map.kind !== "lobby") await this.ensureCombat();
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
      this.presentation.setMap(map.id);
      this.navigation = new NativeNavigation(grid);
      this.minimap?.setMap(map, this.navigation.points);
      cast.enemies = pool;
      this.presentation.setActors(
        this.isLobby ? [] : [cast.hero.id, ...pool.map((e) => e.id)],
      );
      const spawn = this.navigation.nearest(map.spawn)!;
      this.background
        .setTexture("map-" + map.id)
        .setDisplaySize(map.width, map.height);
      this.occlusion.setMap(map);
      this.foreground.setMap(map);
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
          ? t("main.b037a2c5a9")
          : t("common.travelPrefix") + map.name + t("common.exploreFreely"),
      );
      stage.finish();
    } catch (error) {
      if (this.sys.isActive()) stage.fail(error);
      throw error;
    } finally {
      this.load.off("progress", progress);
      this.loadingActor = false;
    }
  }
  loadMapImages(map: WorldMap) {
    const keys = ["map-" + map.id, "map-" + map.id + "-foreground"];
    return loadSceneAssets(
      this,
      () => {
        if (!this.textures.exists(keys[0]))
          this.load.image(keys[0], map.background);
        if (!this.textures.exists(keys[1]))
          this.load.image(
            keys[1],
            foregroundPlan(map, this.game.renderer.type === Phaser.WEBGL).url,
          );
      },
      () => keys.every((key) => this.textures.exists(key)),
    );
  }
  toggleHunt() {
    if (this.isLobby) {
      toast(t("main.fe4a69686b"));
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
      toast(t("main.bca7c6597d"));
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
    root.hidden = true;
  }
  update(_time: number, delta: number) {
    if (!this.hero) return;
    if (!ownsJourney()) {
      window.dispatchEvent(new Event("journey-lock-lost"));
      return;
    }
    const walkSpeed = stats(save).moveSpeed;
    const blocked =
      save.paused ||
      this.loadingActor ||
      !!document.querySelector("dialog[open]");
    this.input.enabled = !blocked;
    this.time.paused = blocked;
    this.presentation.pause(blocked);
    this.tweens.timeScale = blocked ? 0 : 1;
    delta = Math.min(delta, 100);
    if (!blocked) {
      session.activeMs += delta;
      if (!this.isLobby) sessionSegment().activeMs += delta;
    }
    if (blocked) this.hero.anims.pause();
    else this.hero.anims.resume();
    this.residents.update(delta, this.navigation, blocked);
    this.enemyField.update(
      delta,
      this.navigation,
      this.hero,
      new Set(this.hunt.livingOpponents.map((e) => e.id)),
      blocked,
      this.hunt.phase === "derrota" ||
        this.hunt.phase === "retomando explora\u00e7\u00e3o",
    );
    if (!blocked) {
      this.syncEncounters();
      this.hunt.tick(delta);
    }
    if (!this.isLobby && this.hunt.phase === "explorando") {
      if (!blocked && save.autoHunt) {
        const candidates = this.enemyField.members
          .filter((m) => m.alive && m.actor.visible)
          .map((m) => m.actor);
        const hunt = this.autoNavigator.update(
          this.hero,
          candidates,
          delta,
          this.navigation,
        );
        this.enemy = hunt.target || this.standbyEnemy;
        this.path = hunt.path;
      } else if (!save.autoHunt) {
        this.autoNavigator.reset();
        const manual =
          this.manualTarget && this.enemyField.member(this.manualTarget);
        this.enemy = manual?.alive
          ? manual.actor
          : this.enemyField.nearest(this.hero) || this.standbyEnemy;
        if (manual?.alive) {
          this.manualRepathMs -= delta;
          if (!blocked && this.manualRepathMs <= 0) {
            this.path = this.navigation.path(this.hero, manual.actor);
            this.manualRepathMs = 500;
          }
        }
      }
    }
    if (!this.enemyField.members.some((member) => member.actor === this.enemy))
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
          ((dx / norm) * walkSpeed * delta) / 1000,
          ((dy / norm) * walkSpeed * delta) / 1000,
        );
      } else {
        next = advancePath(
          this.hero,
          this.path,
          (walkSpeed * delta) / 1000,
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
        this.hero.anims.timeScale = walkSpeed / 96;
        const step = this.footsteps.update(distance, delta);
        if (step !== undefined) this.presentation.footstep(step);
      } else this.play("world-idle_" + this.lastFacing);
      if (!this.path.length) this.destination.setVisible(false);
      if (
        !this.isLobby &&
        this.enemy.visible &&
        Math.hypot(this.hero.x - this.enemy.x, this.hero.y - this.enemy.y) <
          28 &&
        this.navigation.clear(this.hero, this.enemy)
      ) {
        this.path = [];
        this.destination.setVisible(false);
        this.startEncounter(this.enemy);
      }
    } else if (
      !blocked &&
      ["iniciando combate", "combatendo", "recompensas"].includes(
        this.hunt.phase,
      ) &&
      !this.hero.anims.isPlaying
    )
      this.play("battle-C_idle");
    if (
      blocked ||
      this.hunt.phase !== "explorando" ||
      this.hero.anims.currentAnim?.key.startsWith("world-idle_")
    ) {
      this.footsteps.update(0, blocked ? 0 : delta);
      this.presentation.stopFootsteps();
    }
    this.party.update(
      this.hero,
      delta,
      this.navigation,
      blocked,
      walkSpeed,
      (id) => stats(save, id).moveSpeed,
    );
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
      for (const foe of this.hunt.livingOpponents) {
        const actor = this.enemyField.byId(foe.id)?.actor;
        if (!actor?.visible) continue;
        this.bars
          .fillStyle(0x14211b)
          .fillRect(actor.x - 12, actor.y + 4, 24, 3)
          .fillStyle(foe.id === this.hunt.targetId ? 0x72e5ef : 0xe69878)
          .fillRect(actor.x - 12, actor.y + 4, (24 * foe.hp) / foe.maxHp, 3);
      }
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
  private renderNavigation() {
    const active = this.hunt.phase === "explorando";
    const target = this.enemyField.members.find(
      (m) =>
        m.alive &&
        m.actor.visible &&
        m.actor === this.enemy &&
        ((!this.isLobby &&
          active &&
          (save.autoHunt || this.manualTarget === m.actor)) ||
          this.hunt.phase === "combatendo" ||
          this.hunt.phase === "iniciando combate"),
    );
    const path = active && !this.loadingActor ? this.path : [];
    this.routeOverlay?.update(this.hero, path, target?.actor, !!save.autoHunt);
    this.minimap?.update({
      hero: this.hero,
      path,
      auto: !!save.autoHunt,
      enemies: this.enemyField.members
        .filter((m) => m.alive && m.actor.visible)
        .map((m) => ({
          x: m.actor.x,
          y: m.actor.y,
          elite: m.profile.elite,
          name: m.actor.manifest.name,
        })),
      npcs: this.npcs.map((n) => ({ x: n.x, y: n.y, name: n.manifest.name })),
      portal: this.portal,
      target: target
        ? {
            x: target.actor.x,
            y: target.actor.y,
            name: target.actor.manifest.name,
          }
        : undefined,
      view: this.cameras.main.worldView,
    });
  }
  renderUI() {
    this.renderNavigation();
    this.renderCombatTargets();
    if (this.shownLevel !== undefined && save.level > this.shownLevel)
      this.presentation.ui("levelUp");
    this.shownLevel = save.level;
    const st = stats(save),
      pct = (save.xp / needed(save.level)) * 100;
    $("pause").textContent = save.paused
      ? t("main.960cc636c1")
      : t("main.cd25ee5b1d");
    $("world-name").textContent = this.map.name;
    $("world-help").textContent = this.isLobby
      ? t("main.ab8ef7e487")
      : t("main.ba4dfc88ee");
    if (!this.isLobby) $("world-help").textContent += " " + t("stealth.help");
    $("auto-hunt").hidden = this.isLobby;
    $("return-lobby").hidden = this.isLobby;
    const travelReason = this.loadingActor
      ? t("qol.processing")
      : this.hunt.phase !== "explorando"
        ? t("main.9c6a33d994")
        : "";
    for (const id of ["maps", "return-lobby"]) {
      const button = $(id) as HTMLButtonElement;
      button.disabled = !!travelReason;
      button.title = travelReason;
      button.setAttribute("aria-description", travelReason);
    }
    let travelFeedback = document.getElementById("travel-reason");
    if (!travelFeedback) {
      travelFeedback = document.createElement("p");
      travelFeedback.id = "travel-reason";
      travelFeedback.className = "caption";
      $("maps").after(travelFeedback);
    }
    travelFeedback.hidden = !travelReason;
    travelFeedback.textContent = travelReason;
    $("auto-hunt").textContent = save.autoHunt
      ? t("main.0ec6283eb1")
      : t("main.15a42e6c7b");
    $("cast-skill").hidden = this.isLobby;
    $("cast-skill").textContent = starterCharacter(save)
      ? t("common.jutsuCost")
      : t("balance.techniqueCost", {
          name: t(
            `balance.technique.${recruitProfile(activeCharacterId(save)).style}`,
          ),
          cost: st.skillCost,
        });
    ($("cast-skill") as HTMLButtonElement).disabled =
      save.paused ||
      this.hunt.phase !== "combatendo" ||
      this.hunt.opponents.get(this.hunt.targetId)?.inRange === false ||
      this.hunt.chakra < st.skillCost ||
      this.hunt.skillCooldown > 0;
    const phase = save.paused
      ? t("common.paused")
      : this.isLobby
        ? t("main.7ca4480827")
        : phaseText(this.hunt.phase);
    const skillReason = save.paused
      ? t("common.paused")
      : this.hunt.phase !== "combatendo"
        ? t("qol.needCombat")
        : this.hunt.opponents.get(this.hunt.targetId)?.inRange === false
          ? t("stealth.outOfRange")
          : this.hunt.chakra < st.skillCost
            ? t("balance.needChakra", { cost: st.skillCost })
            : this.hunt.skillCooldown > 0
              ? t("qol.cooldown")
              : "";
    $("cast-skill").title = skillReason;
    $("cast-skill").setAttribute("aria-description", skillReason);
    let skillFeedback = document.getElementById("skill-reason");
    if (!skillFeedback) {
      skillFeedback = document.createElement("p");
      skillFeedback.id = "skill-reason";
      skillFeedback.className = "caption";
      $("cast-skill").after(skillFeedback);
    }
    skillFeedback.hidden = this.isLobby || !skillReason;
    skillFeedback.textContent = skillReason;
    let huntStatus = document.getElementById("hunt-status");
    if (!huntStatus) {
      huntStatus = document.createElement("p");
      huntStatus.id = "hunt-status";
      huntStatus.className = "caption";
      $("auto-hunt").after(huntStatus);
    }
    huntStatus.hidden = this.isLobby || !save.autoHunt;
    huntStatus.textContent =
      save.paused || !!document.querySelector("dialog[open]")
        ? t("common.paused")
        : this.hunt.phase !== "explorando"
          ? phaseText(this.hunt.phase)
          : t(
              this.autoNavigator.status === "chasing"
                ? "qol.chasing"
                : this.autoNavigator.status === "waiting"
                  ? "qol.waiting"
                  : this.autoNavigator.status === "unreachable"
                    ? "qol.unreachable"
                    : "qol.searching",
            );
    $("status").innerHTML =
      `<div class="level">${th("main.27617734dd", { v0: save.level })}<span>${phase}</span></div><div class="meter"><i style="width:${(this.hunt.hp / st.maxHp) * 100}%"></i></div><p class="caption">${th("main.daff5c99bc", { v0: Math.ceil(this.hunt.hp), v1: st.maxHp })}</p><div class="meter xp"><i style="width:${pct}%"></i></div><p class="caption">${th("main.9e9fa512af", { v0: save.xp, v1: needed(save.level) })}</p><div class="meter chakra"><i style="width:${(this.hunt.chakra / st.maxChakra) * 100}%"></i></div><p class="caption">${th("main.28e9b6b10b", { v0: Math.floor(this.hunt.chakra), v1: st.maxChakra })}</p><dl><dt>${th("main.c7d55f788a")}</dt><dd>${save.coins}</dd><dt>${th("main.6c05b13ab4")}</dt><dd>${save.kills}</dd><dt>${th("main.ccbaf8a1d3")}</dt><dd>${save.defeats}</dd><dt>${th("main.023b326283")}</dt><dd>${save.inventory.fragmento || 0}</dd></dl>`;
    const cadence = document.createElement("p");
    cadence.className = "caption";
    cadence.dataset.cadence = "";
    cadence.textContent = t("main.e93105e45c", {
      v0: st.attack,
      v1: formatNumber(1000 / st.interval, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      v2: formatNumber(st.moveSpeed, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    });
    $("status").append(cadence);
    if (!this.isLobby) {
      const profile =
        this.hunt.phase === "explorando"
          ? this.enemyField.profileFor(this.enemy)
          : this.hunt.enemy;
      const info = document.createElement("p");
      info.className = "caption enemy-profile";
      info.dataset.enemyProfile = profile.kind;
      info.textContent = t("balance.enemySummary", {
        name: this.enemy.manifest.name,
        kind: `${profile.elite ? t("balance.elite") + " · " : ""}${t(`balance.enemy.${profile.kind}`)}`,
        hp: Math.round(AREAS[save.area].enemyHp * profile.hp),
        defense: profile.defense,
        ninjutsuDefense: profile.ninjutsuDefense,
        interval: formatNumber(profile.interval / 1000, {
          maximumFractionDigits: 2,
        }),
        xp: Math.round(AREAS[save.area].xp * profile.xp),
        coins: Math.round(AREAS[save.area].coins * profile.coins),
      });
      if (profile.elite) info.classList.add("elite-profile");
      if (this.hunt.enemyWindup)
        info.append(document.createTextNode(" · " + t("balance.warning")));
      info.append(
        document.createTextNode(" · " + t(`balance.enemyHint.${profile.kind}`)),
      );
      if (profile.elite)
        info.append(document.createTextNode(" · " + t("balance.eliteHint")));
      $("status").append(info);
    }
    const minutes = session.activeMs / 60000;
    $("session").textContent = t("qol.session", {
      minutes: formatNumber(minutes, { maximumFractionDigits: 1 }),
      wins: session.wins,
      defeats: session.defeats,
      xp: session.xp,
      coins: session.coins,
      xpRate: formatNumber(minutes >= 1 / 60 ? session.xp / minutes : 0, {
        maximumFractionDigits: 1,
      }),
      coinRate: formatNumber(minutes >= 1 / 60 ? session.coins / minutes : 0, {
        maximumFractionDigits: 1,
      }),
    });
    for (const segment of [...sessionSegments.values()].slice(-8)) {
      const minutes = segment.activeMs / 60000;
      const row = document.createElement("p");
      row.className = "caption";
      row.dataset.sessionSegment = "";
      row.textContent = t("qol.segment", {
        name: segment.name,
        minutes: formatNumber(minutes, { maximumFractionDigits: 1 }),
        wins: segment.wins,
        defeats: segment.defeats,
        xpRate: formatNumber(minutes >= 1 / 60 ? segment.xp / minutes : 0, {
          maximumFractionDigits: 1,
        }),
        coinRate: formatNumber(
          minutes >= 1 / 60 ? segment.coins / minutes : 0,
          { maximumFractionDigits: 1 },
        ),
      });
      $("session").append(row);
    }
    miniWindow.sync();
  }
}
