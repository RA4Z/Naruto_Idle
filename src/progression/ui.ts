import { ITEMS, QUESTS, buyItem, equipItem, claimQuest } from "./rules";
import { addXp, type Save } from "../model";
import { entityCatalog } from "../entities/catalog";
type Context = {
  save: Save;
  onChange: () => void;
  invite: (id: string) => Promise<void>;
  heroId: string;
};
export function installProgression(context: () => Context) {
  const dialog = document.createElement("dialog");
  dialog.className = "progression-panel";
  dialog.innerHTML =
    '<div class="library-heading"><div><p class="eyebrow">SEU CAMINHO NINJA</p><h2>Mochila e progresso</h2></div><button class="secondary" data-close>Fechar</button></div><nav></nav><p data-balance></p><div data-content></div><p role="status"></p>';
  document.body.append(dialog);
  dialog
    .querySelector("[data-close]")!
    .addEventListener("click", () => dialog.close());
  let selected = "quests",
    version = 0;
  const element = (tag: string, text: string) => {
    const e = document.createElement(tag);
    e.textContent = text;
    return e;
  };
  const feedback = dialog.querySelector('[role="status"]')!;
  async function render() {
    const request = ++version,
      { save, onChange, invite, heroId } = context();
    dialog.querySelector("[data-balance]")!.textContent =
      `${save.coins} moedas · ${save.inventory.fragmento || 0} fragmentos de treino`;
    const content = dialog.querySelector("[data-content]")!;
    content.replaceChildren();
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === selected));
    const action = (
      label: string,
      run: () => void | Promise<void>,
      disabled = false,
    ) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.className = "secondary";
      b.disabled = disabled;
      b.onclick = async () => {
        b.disabled = true;
        try {
          await run();
          onChange();
          feedback.textContent = "Atualizado.";
          if (dialog.open) void render();
        } catch (e) {
          feedback.textContent = String(e);
          b.disabled = false;
        }
      };
      return b;
    };
    if (selected === "quests")
      for (const q of QUESTS) {
        const card = element("article", "");
        card.className = "progress-card";
        const claimed = save.questClaims?.includes(q.id),
          progress = Math.min(q.target, q.progress(save));
        card.append(
          element("h3", q.name),
          element("p", q.description),
          element(
            "p",
            `${progress}/${q.target} · ${q.coins} moedas + ${q.xp} XP`,
          ),
          action(
            claimed ? "Recebida" : "Receber recompensa",
            () => {
              const reward = claimQuest(save, q.id);
              addXp(save, reward.xp);
            },
            !!claimed || progress < q.target,
          ),
        );
        content.append(card);
      }
    if (selected === "shop" || selected === "inventory") {
      for (const item of ITEMS.filter(
        (i) => selected === "shop" || save.inventory[i.id],
      )) {
        const card = element("article", "");
        card.className = "progress-card";
        const equipped = save.equipment?.[item.slot] === item.id;
        card.append(
          element("h3", item.name + (equipped ? " · equipado" : "")),
          element("p", item.description),
          element(
            "p",
            `Ataque +${item.attack} · Vida +${item.hp} · Chakra +${item.chakra}${item.regen ? " · Regeneração +" + item.regen + "/s" : ""}`,
          ),
        );
        if (selected === "shop")
          card.append(
            action(
              save.inventory[item.id]
                ? "Na mochila"
                : `Comprar · ${item.price} moedas`,
              () => {
                buyItem(save, item.id);
              },
              !!save.inventory[item.id],
            ),
          );
        else
          card.append(
            action(
              equipped ? "Equipado" : "Equipar",
              () => {
                equipItem(save, item.id);
              },
              equipped,
            ),
          );
        content.append(card);
      }
      if (selected === "inventory") {
        const materials = Object.entries(save.inventory).filter(
          ([id]) => !ITEMS.some((i) => i.id === id),
        );
        content.append(
          element(
            "p",
            materials
              .map(
                ([id, n]) =>
                  `${id === "fragmento" ? "Fragmentos de treino" : id}: ${n}`,
              )
              .join(" · ") || "Sua mochila está vazia. Lute e visite a loja.",
          ),
        );
      }
    }
    if (selected === "collection") {
      const entries = await entityCatalog.list();
      if (request !== version || !dialog.open) return;
      for (const id of save.collection || []) {
        const e = entries.find((e) => e.id === id);
        if (!e) continue;
        const card = element("article", "");
        card.className = "progress-card";
        if (e.preview) {
          const img = document.createElement("img");
          img.src = e.preview;
          img.alt = "Corpo inteiro de " + e.name;
          card.append(img);
        }
        card.append(
          element("h3", e.name + (e.variant ? " [" + e.variant + "]" : "")),
          action(
            id === heroId
              ? "Seu protagonista"
              : save.partyIds?.includes(id)
                ? "Já no grupo"
                : "Convidar para grupo",
            async () => {
              await invite(id);
              dialog.close();
            },
            id === heroId || !!save.partyIds?.includes(id),
          ),
        );
        content.append(card);
      }
      content.append(
        element(
          "p",
          "Encontre novos personagens na biblioteca. O recrutamento custa 60 moedas e 3 fragmentos; o grupo ativo é opcional.",
        ),
      );
    }
  }
  for (const [id, name] of [
    ["quests", "Missões"],
    ["inventory", "Mochila"],
    ["shop", "Loja"],
    ["collection", "Coleção"],
  ]) {
    const b = document.createElement("button");
    b.className = "secondary";
    b.dataset.tab = id;
    b.textContent = name;
    b.onclick = () => {
      selected = id;
      feedback.textContent = "";
      void render();
    };
    dialog.querySelector("nav")!.append(b);
  }
  return () => {
    feedback.textContent = "";
    dialog.showModal();
    void render();
  };
}
