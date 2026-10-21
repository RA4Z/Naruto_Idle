import { t, th } from "../i18n/core.ts";
import { cloudClient } from "../cloud/client";
import { requireAccount } from "../cloud/profile";
import { cloudSnapshot } from "../cloud/snapshot";
import type { Save } from "../model";
import { installArena } from "./ui";
import { characterLoadout } from "../progression/character-progress";
const root = document.getElementById("app")!;
document.title = t("arena.page.61c031c567");
root.innerHTML = `<main class="arena-landing"><p class="eyebrow">${th("arena.page.7984cfa6d0")}</p><h1>${th("arena.page.da8fa6e923")}</h1><p>${th("arena.page.0bf8b72edb")}</p><p>${th("arena.page.6216f272be")}</p><button id="open-arena">${th("arena.page.ec077a30d7")}</button><p><a href="/">Voltar \u00E0 vila</a></p></main>`;
let saved: Save | undefined;
async function loadProfile() {
  const { user } = await requireAccount();
  const { data, error } = await cloudClient!.from("game_saves").select("snapshot").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  saved = data ? cloudSnapshot(data.snapshot) : undefined;
}
await loadProfile();
const open = installArena(
  () => saved?.character || "naruto",
  (character) => {
    return saved
      ? characterLoadout(saved, character)
      : { level: 1, upgrades: 0, equipment: {} };
  },
);
document.getElementById("open-arena")!.onclick = () => {
  void loadProfile().then(() => open()).catch(() => location.reload());
};
