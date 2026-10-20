import { installArena } from "./ui";
const root = document.getElementById("app")!;
document.title = "Arena PvP · Caminho da Folha";
root.innerHTML =
  '<main class="arena-landing"><p class="eyebrow">CAMINHO DA FOLHA</p><h1>Arena PvP</h1><p>Duelo por chave, com turnos sincronizados no servidor.</p><p>Esta tela carrega apenas a arena para economizar memória.</p><button id="open-arena">Entrar na arena</button><p><a href="/">Voltar à vila</a></p></main>';
const open = installArena(() => "naruto");
document.getElementById("open-arena")!.onclick = () => void open();
