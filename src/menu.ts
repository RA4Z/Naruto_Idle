import { CHARACTERS, type CharacterId } from "./data";
import { loadingScreen } from "./loading-screen";
let engine: Promise<typeof import("./main")> | undefined;
let version = 0;
export function installMenu() {
  const element = (id: string) => document.getElementById(id)!;
  async function launch(character?: CharacterId) {
    const request = ++version;
    const stage = loadingScreen.begin(
      "Carregando o jogo",
      () => location.reload(),
      () => {
        version++;
        loadingScreen.hide();
      },
    );
    stage.update("Carregando o motor e preparando os recursos essenciais…");
    try {
      const game = await (engine ??= import("./main").catch((error) => {
        engine = undefined;
        throw error;
      }));
      if (request !== version) return;
      if (character) await game.startNewJourney(character);
      else await game.continueJourney();
    } catch (error) {
      stage.fail(error);
    }
  }
  element("new").onclick = () => {
    const choices = element("choices");
    choices.hidden = false;
    choices.innerHTML = (Object.keys(CHARACTERS) as CharacterId[])
      .map((id) => {
        const c = CHARACTERS[id];
        return `<button class="character" data-character="${id}"><img src="${c.portrait}" alt="Retrato recuperado de ${c.name}"><span class="character-name">${c.name}</span><em>${c.subtitle}</em><p>${c.description}</p><p>Vitalidade ${c.attributes.vitality} · Força ${c.attributes.strength} · Velocidade ${c.attributes.speed}</p><span class="select-label">Escolher ${c.name} →</span></button>`;
      })
      .join("");
    choices
      .querySelectorAll<HTMLButtonElement>("[data-character]")
      .forEach((button) => {
        button.onclick = () => {
          if (
            localStorage.getItem("folha-idle-v1") &&
            !confirm(
              "Começar uma nova jornada substituirá seu progresso local. Continuar?",
            )
          )
            return;
          void launch(button.dataset.character as CharacterId);
        };
      });
  };
  element("continue").onclick = () => void launch();
}
