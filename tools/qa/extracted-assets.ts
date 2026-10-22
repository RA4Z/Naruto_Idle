import Phaser from "phaser";
import { EntityActor, actorKey } from "../../src/entities/actor";
import type { EntityManifest, AnimationDef } from "../../src/entities/types";
const select = document.querySelector<HTMLSelectElement>("#action")!;
const state = document.querySelector<HTMLOutputElement>("#state")!;
const verification =
  document.querySelector<HTMLOutputElement>("#verification")!;
const catalog = await (await fetch("/assets/catalog/entities.json")).json();
const proof = await (
  await fetch("/reports/compact-animation-validation.json")
).json();
const entries = proof.actions.map((row: any) => ({
  ...row,
  entity: catalog.entities.find((e: any) => e.id === row.id),
}));
for (const [index, row] of entries.entries()) {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = `${row.entity.name} · ${row.id} · ${row.action}`;
  select.append(option);
}
let game: Phaser.Game | undefined;
let actor: EntityActor | undefined;
let selectedAction = "";
let version = 0;
async function load() {
  const request = ++version;
  select.disabled = true;
  actor = undefined;
  if (game) {
    const previous = game;
    game = undefined;
    await new Promise<void>((resolve) => {
      previous.events.once(Phaser.Core.Events.DESTROY, resolve);
      previous.destroy(true);
      previous.loop.wake();
    });
  }
  const row = entries[Number(select.value)];
  const manifest: EntityManifest = await (
    await fetch(row.entity.manifestUrl)
  ).json();
  if (request !== version) return;
  selectedAction = row.action;
  const definition = manifest.modes.battle!;
  class Preview extends Phaser.Scene {
    preload() {
      for (const action of new Set(["C_idle", row.action])) {
        const a = definition.animations[action];
        this.load.spritesheet(actorKey(manifest.id, "battle", action), a.url, {
          frameWidth: a.frameWidth,
          frameHeight: a.frameHeight,
          endFrame: a.frames - 1,
        });
      }
      this.load.on(
        "loaderror",
        () => (state.textContent = "Falha no carregamento do atlas"),
      );
    }
    create() {
      this.add.line(0, 0, 0, 340, 960, 340, 0x968361).setOrigin(0);
      this.add.circle(320, 340, 8, 0xe4bd68, 0.4);
      for (const action of new Set(["C_idle", row.action])) {
        const a = definition.animations[action];
        const key = actorKey(manifest.id, "battle", action);
        this.anims.create({
          key,
          frames: (
            a.timeline || Array.from({ length: a.frames }, (_, i) => i)
          ).map((frame) => ({ key, frame })),
          frameRate: a.fps,
          repeat: -1,
        });
      }
      actor = new EntityActor(this, 320, 340, manifest, "enemy");
      actor.setScale(2.5);
      actor.play("battle", row.action, true);
      select.disabled = false;
    }
    update() {
      if (!actor) return;
      actor.tick(false);
      state.textContent = `${manifest.name} / ${row.action}\nQuadro ${actor.visual.frame.name} · origem ${actor.visual.originX.toFixed(3)}, ${actor.visual.originY.toFixed(3)}\nEstado: ${definition.animations[row.action].status} · atlas carregado · ${this.game.renderer.type === Phaser.WEBGL ? "WebGL" : "Canvas"}`;
    }
  }
  game = new Phaser.Game({
    type: new URLSearchParams(location.search).has("canvas")
      ? Phaser.CANVAS
      : Phaser.AUTO,
    parent: "stage",
    width: 960,
    height: 460,
    backgroundColor: "#213540",
    scene: Preview,
    audio: { noAudio: true },
    render: { antialias: true },
  });
}
select.onchange = () => {
  void load().catch((error) => {
    state.textContent = String(error);
    select.disabled = false;
  });
};
document.querySelector<HTMLButtonElement>("#play")!.onclick = () =>
  actor?.play("battle", selectedAction, true);
document.querySelector<HTMLButtonElement>("#verify")!.onclick = async (
  event,
) => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  let count = 0;
  try {
    for (const row of entries) {
      const m: EntityManifest = await (
        await fetch(row.entity.manifestUrl)
      ).json();
      const a: AnimationDef = m.modes.battle!.animations[row.action];
      const image = new Image();
      image.src = a.url;
      await image.decode();
      if (
        image.width % a.frameWidth ||
        image.height % a.frameHeight ||
        a.frameOrigins?.length !== a.frames ||
        !a.frameOrigins.every((p) => p.length === 2 && p.every(Number.isFinite))
      )
        throw new Error(row.id + ": metadados inválidos");
      image.removeAttribute("src");
      verification.textContent = `${++count}/${entries.length} atlas decodificados no navegador`;
    }
    verification.textContent = `PASSOU: ${count}/${entries.length} atlas, URLs, dimensões e origens por quadro.`;
  } catch (error) {
    verification.textContent = String(error);
  } finally {
    button.disabled = false;
  }
};
void load().catch((error) => (state.textContent = String(error)));
