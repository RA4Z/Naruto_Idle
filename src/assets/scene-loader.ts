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
        throw new Error("Carregamento cancelado ao sair da cena.");
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
              ? reject(
                  new Error(
                    "Não foi possível carregar alguns recursos. Verifique sua conexão e tente novamente.",
                  ),
                )
              : resolve();
          };
          const error = (file: Phaser.Loader.File) => {
            failed.push(file.key);
          };
          const cancel = () => {
            cleanup();
            reject(new Error("Carregamento cancelado ao sair da cena."));
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
      if (!scene.sys.isActive()) throw new Error("Cena encerrada.");
      if (!ready()) await wait(true);
    });
  jobs.set(
    scene,
    operation.catch(() => {}),
  );
  return operation;
}
