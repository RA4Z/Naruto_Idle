import { t, th } from "./i18n/core.ts";
import { CHARACTERS, type CharacterId } from "./data";
import { loadingScreen } from "./loading-screen";
import { acquireJourney, releaseJourney } from "./journey-lock";
let engine: Promise<typeof import("./main")> | undefined;
let version = 0;
export function installMenu() {
  const element = (id: string) => document.getElementById(id)!;
  async function launch(character?: CharacterId) {
    const request = ++version;
    const stage = loadingScreen.begin(
      t("common.loadingGame"),
      () => location.reload(),
      () => {
        version++;
        releaseJourney();
        loadingScreen.hide();
      },
    );
    stage.update(t("menu.6d1ba3345a"));
    try {
      await acquireJourney();
      if (request !== version) {
        if (version === request + 1) releaseJourney();
        return;
      }
      const game = await (engine ??= import("./main").catch((error) => {
        engine = undefined;
        throw error;
      }));
      if (request !== version) return;
      if (character) await game.startNewJourney(character);
      else await game.continueJourney();
    } catch (error) {
      if (request === version) releaseJourney();
      stage.fail(error);
    }
  }
  element("new").onclick = () => {
    const choices = element("choices");
    choices.hidden = false;
    choices.innerHTML = (Object.keys(CHARACTERS) as CharacterId[])
      .map((id) => {
        const c = CHARACTERS[id];
        return `<button class="character" data-character="${id}"><img src="${c.portrait}" alt="${th("menu.74687eddfe", { v0: c.name })}"><span class="character-name">${c.name}</span><em>${c.subtitle}</em><p>${c.description}</p><p>${th("menu.e296b7d57d", { v0: c.attributes.vitality, v1: c.attributes.strength, v2: c.attributes.speed })}</p><span class="select-label">${th("menu.10ce8b712b", { v0: c.name })}</span></button>`;
      })
      .join("");
    choices
      .querySelectorAll<HTMLButtonElement>("[data-character]")
      .forEach((button) => {
        button.onclick = () => {
          if (
            localStorage.getItem("folha-idle-v1") &&
            !confirm(t("menu.3cd10efbb8"))
          )
            return;
          void launch(button.dataset.character as CharacterId);
        };
      });
  };
  element("continue").onclick = () => void launch();
}
