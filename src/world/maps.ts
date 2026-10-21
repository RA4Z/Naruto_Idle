import { t, th, errorText } from "../i18n/core.ts";
import type { NativeGrid, Point } from "./navigation";
import { withSceneGeometry } from "./scene-geometry";
import { runtimeIndex } from "../assets/runtime-index";
import { AREAS } from "../config/areas";
import {
  getPreferences,
  toggleFavorite,
  updatePreferences,
} from "../preferences";
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
  getDifficulty?: () => {
    area: { id: string; name: string; level: number };
    level: number;
  },
  setDifficulty?: (index: number) => void,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "map-library";
  dialog.innerHTML = `<div class="library-heading"><div><p class="eyebrow">${th("common.travels")}</p><h2>${th("world.maps.9be3dd6e3c")}</h2></div><button class="secondary" data-close>${th("world.maps.0f2bd88ef0")}</button></div><div class="library-controls"><input data-map-search type="search" placeholder="${th("qol.search")}" aria-label="${th("qol.search")}"><label><input data-map-favorites type="checkbox">${th("qol.favoritesOnly")}</label></div><p class="caption">${th("qol.sharedDifficulty")}</p><div class="map-grid"></div><p role="status"></p>`;
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  let busy = false;
  let renderVersion = 0;
  const search = dialog.querySelector<HTMLInputElement>("[data-map-search]")!;
  const favorites = dialog.querySelector<HTMLInputElement>(
    "[data-map-favorites]",
  )!;
  const difficulty = document.createElement("select");
  difficulty.dataset.difficultyPicker = "";
  difficulty.setAttribute("aria-label", t("balance.difficulty"));
  if (getDifficulty && setDifficulty) {
    dialog.querySelector(".library-controls")!.append(difficulty);
    difficulty.onchange = () => {
      if (!busy) {
        setDifficulty(Number(difficulty.value));
        void render();
      }
    };
  }
  const render = async () => {
    const request = ++renderVersion;
    const grid = dialog.querySelector(".map-grid")!,
      feedback = dialog.querySelector('[role="status"]')!;
    feedback.textContent = t("world.maps.b06b615999");
    grid.replaceChildren();
    try {
      const matches = (await listMaps())
        .filter(
          (map) =>
            `${map.name} ${map.id}`
              .toLocaleLowerCase()
              .includes(search.value.toLocaleLowerCase()) &&
            (!favorites.checked ||
              getPreferences().mapFavorites.includes(map.id)),
        )
        .sort(
          (a, b) =>
            Number(getPreferences().mapFavorites.includes(b.id)) -
            Number(getPreferences().mapFavorites.includes(a.id)),
        );
      if (request !== renderVersion || !dialog.open) return;
      grid.replaceChildren();
      for (const map of matches) {
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
        const favorite = document.createElement("button");
        favorite.className = "secondary";
        favorite.textContent =
          (getPreferences().mapFavorites.includes(map.id) ? "★ " : "☆ ") +
          t("qol.favorite");
        favorite.dataset.favoriteMap = map.id;
        favorite.setAttribute(
          "aria-pressed",
          String(getPreferences().mapFavorites.includes(map.id)),
        );
        favorite.onclick = () => {
          if (!busy) {
            toggleFavorite("mapFavorites", map.id);
            void render();
          }
        };
        if (getPreferences().lastMap === map.id) {
          const last = document.createElement("strong");
          last.textContent = t("qol.lastDestination");
          card.append(last);
        }
        if (map.kind !== "lobby" && getDifficulty) {
          const { area, level } = getDifficulty();
          const difficulty = document.createElement("p");
          difficulty.dataset.difficulty = map.id;
          difficulty.textContent = t("qol.difficulty", {
            area: area.name,
            level: area.level,
            player: level,
          });
          card.append(difficulty);
        }
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
          if (busy) return;
          busy = true;
          search.disabled = favorites.disabled = true;
          button.setAttribute("aria-busy", "true");
          dialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
          feedback.textContent = t("world.maps.80bfdbb9d3") + map.name + "…";
          try {
            await onChoose(map);
            updatePreferences({ lastMap: map.id });
            dialog.close();
          } catch (e) {
            feedback.textContent = errorText(e);
          } finally {
            busy = false;
            search.disabled = favorites.disabled = false;
            button.removeAttribute("aria-busy");
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
        card.append(image, title, text, favorite, button);
        grid.append(card);
      }
      feedback.textContent = matches.length
        ? t("world.maps.595a57e23c")
        : t("qol.noResults");
    } catch (e) {
      feedback.textContent = errorText(e);
    }
  };
  search.oninput = favorites.onchange = () => {
    if (!busy) void render();
  };
  return async () => {
    if (getDifficulty && setDifficulty) {
      difficulty.replaceChildren();
      const current = getDifficulty();
      for (const [index, area] of AREAS.entries()) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = t("balance.areaOption", {
          name: area.name,
          level: area.level,
        });
        option.disabled = current.level < area.level;
        option.selected = area.id === current.area.id;
        difficulty.append(option);
      }
    }
    dialog.showModal();
    await render();
  };
}
