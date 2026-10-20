import { restore } from "../model";
import { installArena } from "./ui";
import { characterLoadout } from "../progression/character-progress";
const root = document.getElementById("app")!;
document.title = "Arena PvP · Caminho da Folha";
root.innerHTML =
  '<main class="arena-landing"><p class="eyebrow">CAMINHO DA FOLHA</p><h1>Arena PvP</h1><p>Duelo por chave, com turnos sincronizados no servidor.</p><p>Esta tela carrega apenas a arena para economizar memória.</p><button id="open-arena">Entrar na arena</button><p><a href="/">Voltar à vila</a></p></main>';
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
