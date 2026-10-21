import { t, th } from "../i18n/core.ts";
import { restore } from "../model";
import { installArena } from "./ui";
import { characterLoadout } from "../progression/character-progress";
const root = document.getElementById("app")!;
document.title = t("arena.page.61c031c567");
root.innerHTML = `<main class="arena-landing"><p class="eyebrow">${th("arena.page.7984cfa6d0")}</p><h1>${th("arena.page.da8fa6e923")}</h1><p>${th("arena.page.0bf8b72edb")}</p><p>${th("arena.page.6216f272be")}</p><button id="open-arena">${th("arena.page.ec077a30d7")}</button><p><a href="/">Voltar \u00E0 vila</a></p></main>`;
const profile = () =>
  restore({
    read: () => localStorage.getItem("folha-idle-v1"),
    write: () => {
      /* Read-only arena preview; PvE owns save commits. */
    },
  })?.save;
const open = installArena(
  () => profile()?.character || "naruto",
  (character) => {
    const saved = profile();
    return saved
      ? characterLoadout(saved, character)
      : { level: 1, upgrades: 0, equipment: {} };
  },
);
document.getElementById("open-arena")!.onclick = () => void open();
