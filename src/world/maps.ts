import { t, th, errorText } from "../i18n/core.ts";
import type { NativeGrid, Point } from "./navigation";
import { withSceneGeometry } from "./scene-geometry";
import { runtimeIndex } from "../assets/runtime-index";
export type WorldMap = {
  id: string;
  name: string;
  kind: "lobby" | "adventure";
  background: string;
  foreground: string;
  nativeAlpha?: {
    url: string;
    width: number;
    height: number;
    sha256: string;
  };
  thumbnail: string;
  navigation: string;
  width: number;
  height: number;
  spawn: Point;
  enemies: string[];
  description: string;
};
let catalog: Promise<WorldMap[]> | undefined;
export function listMaps() {
  return (catalog ??= runtimeIndex()
    .then((data) => data.maps)
    .catch((e) => {
      catalog = undefined;
      throw e;
    }));
}
export async function mapNavigation(map: WorldMap) {
  const r = await fetch(map.navigation, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(t("world.maps.3a9da8ffb0"));
  return withSceneGeometry(map.id, (await r.json()) as NativeGrid);
}
export function installTravel(
  getCurrent: () => string,
  onChoose: (map: WorldMap) => Promise<void>,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "map-library";
  dialog.innerHTML = `<div class="library-heading"><div><p class="eyebrow">${th("common.travels")}</p><h2>${th("world.maps.9be3dd6e3c")}</h2></div><button class="secondary" data-close>${th("world.maps.0f2bd88ef0")}</button></div><div class="map-grid"></div><p role="status"></p>`;
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  return async () => {
    dialog.showModal();
    const grid = dialog.querySelector(".map-grid")!,
      feedback = dialog.querySelector('[role="status"]')!;
    feedback.textContent = t("world.maps.b06b615999");
    grid.replaceChildren();
    try {
      for (const map of await listMaps()) {
        const card = document.createElement("article");
        card.className = "map-card";
        const image = document.createElement("img");
        image.src = map.thumbnail;
        image.alt = map.name;
        image.loading = "lazy";
        const title = document.createElement("h3");
        title.textContent = map.name;
        const text = document.createElement("p");
        text.textContent = map.description;
        const button = document.createElement("button");
        button.dataset.map = map.id;
        button.textContent =
          map.id === getCurrent()
            ? t("world.maps.dbe19f7fd8")
            : map.kind === "lobby"
              ? t("world.maps.6b91bfdb4a")
              : t("common.explore");
        button.disabled = map.id === getCurrent();
        button.onclick = async () => {
          dialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
          feedback.textContent = t("world.maps.80bfdbb9d3") + map.name + "…";
          try {
            await onChoose(map);
            dialog.close();
          } catch (e) {
            feedback.textContent = errorText(e);
          } finally {
            dialog
              .querySelectorAll("button")
              .forEach((b) => (b.disabled = false));
            dialog
              .querySelectorAll<HTMLButtonElement>("[data-map]")
              .forEach((b) => {
                b.disabled = b.dataset.map === getCurrent();
              });
          }
        };
        card.append(image, title, text, button);
        grid.append(card);
      }
      feedback.textContent = t("world.maps.595a57e23c");
    } catch (e) {
      feedback.textContent = errorText(e);
    }
  };
}
