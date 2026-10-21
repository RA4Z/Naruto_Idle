import { t } from "../i18n/core.ts";
import type Phaser from "phaser";
const jobs = new WeakMap<Phaser.Scene, Promise<void>>();
// One queue owns Phaser's loader: optional audio/NPCs cannot race with travel or recruitment.
export function loadSceneAssets(
  scene: Phaser.Scene,
  queue: () => void,
  ready: () => boolean = () => false,
) {
  const operation = (jobs.get(scene) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (!scene.sys.isActive())
        throw new Error(t("assets.scene-loader.09ba472af1"));
      if (ready()) return;
      const wait = (enqueue: boolean) =>
        new Promise<void>((resolve, reject) => {
          const failed: string[] = [];
          const cleanup = () => {
            scene.load.off("complete", complete);
            scene.load.off("loaderror", error);
            scene.events.off("shutdown", cancel);
            scene.events.off("destroy", cancel);
          };
          const complete = () => {
            cleanup();
            failed.length
              ? reject(new Error(t("assets.scene-loader.168ba6316b")))
              : resolve();
          };
          const error = (file: Phaser.Loader.File) => {
            failed.push(file.key);
          };
          const cancel = () => {
            cleanup();
            reject(new Error(t("assets.scene-loader.09ba472af1")));
          };
          scene.load.once("complete", complete);
          scene.load.on("loaderror", error);
          scene.events.once("shutdown", cancel);
          scene.events.once("destroy", cancel);
          if (enqueue) {
            try {
              queue();
              scene.load.start();
            } catch (reason) {
              cleanup();
              reject(reason);
            }
          }
        });
      if (scene.load.isLoading()) await wait(false);
      if (!scene.sys.isActive())
        throw new Error(t("assets.scene-loader.426b6eda53"));
      if (!ready()) await wait(true);
    });
  jobs.set(
    scene,
    operation.catch(() => {}),
  );
  return operation;
}
