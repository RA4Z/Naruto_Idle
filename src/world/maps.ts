import type { NativeGrid, Point } from "./navigation";
export type WorldMap = {
  id: string;
  name: string;
  kind: "lobby" | "adventure";
  background: string;
  foreground: string;
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
  return (catalog ??= fetch("/assets/maps/index.json")
    .then(async (r) => {
      if (!r.ok) throw new Error("Mapas indisponíveis");
      return (await r.json()).maps as WorldMap[];
    })
    .catch((e) => {
      catalog = undefined;
      throw e;
    }));
}
export async function mapNavigation(map: WorldMap) {
  const r = await fetch(map.navigation);
  if (!r.ok) throw new Error("Não foi possível carregar os caminhos do mapa.");
  return r.json() as Promise<NativeGrid>;
}
export function installTravel(
  getCurrent: () => string,
  onChoose: (map: WorldMap) => Promise<void>,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "map-library";
  dialog.innerHTML =
    '<div class="library-heading"><div><p class="eyebrow">VIAGENS</p><h2>Escolha seu destino</h2></div><button class="secondary" data-close>Fechar</button></div><div class="map-grid"></div><p role="status"></p>';
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  return async () => {
    dialog.showModal();
    const grid = dialog.querySelector(".map-grid")!,
      feedback = dialog.querySelector('[role="status"]')!;
    feedback.textContent = "Carregando destinos…";
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
            ? "Você está aqui"
            : map.kind === "lobby"
              ? "Voltar ao lobby"
              : "Explorar";
        button.disabled = map.id === getCurrent();
        button.onclick = async () => {
          dialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
          feedback.textContent = "Viajando para " + map.name + "…";
          try {
            await onChoose(map);
            dialog.close();
          } catch (e) {
            feedback.textContent = String(e);
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
      feedback.textContent =
        "Na vila você pode caminhar livremente. A caçada automática pode ser ativada nos mapas de exploração.";
    } catch (e) {
      feedback.textContent = String(e);
    }
  };
}
