import { ITEMS, QUESTS, buyItem, equipItem, claimQuest } from "./rules";
import { addXp, stats, needed, type Save } from "../model";
import { ATTRIBUTE_LABELS } from "./combat-stats";
import { CHARACTER_IDS, characterProgress, trainCharacter } from "./character-progress";
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
  let attributeId: string | undefined;
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
    if (selected === "attributes") {
      const entries = await entityCatalog.list();
      if (request !== version || !dialog.open) return;
      if (!attributeId || !save.collection?.includes(attributeId)) attributeId = heroId;
      const id = attributeId, p = characterProgress(save, id), st = stats(save, id);
      const picker = document.createElement("select");
      picker.setAttribute("aria-label", "Personagem da ficha");
      for (const ownedId of save.collection || []) {
        const option = document.createElement("option");
        const progress = characterProgress(save, ownedId);
        option.value = ownedId;
        option.textContent = `${entries.find(e => e.id === ownedId)?.name || ownedId} · Nível ${progress.level}`;
        picker.append(option);
      }
      picker.value = id;
      picker.onchange = () => { attributeId = picker.value; void render(); };
      const label = element("label", "Personagem ");
      label.append(picker);
      const summary = element("section", "");
      summary.className = "attribute-summary";
      summary.append(label, element("h3", entries.find(e => e.id === id)?.name || id),
        element("p", `Nível ${p.level} · ${p.level >= 100 ? "Nível máximo" : `${p.xp}/${needed(p.level)} XP`} · ${p.upgrades} treinos`),
        element("p", "Cada personagem tem seu próprio nível, XP, treinos e atributos. Protagonista e grupo ativo recebem o XP das caçadas; quem fica fora do grupo não recebe. Missões dão XP ao protagonista."),
        element("p", `Ataque ${st.attack} · Jutsu ${st.skillDamage} · Vida ${st.maxHp} · Chakra ${st.maxChakra}`),
        element("p", `${(1000 / st.interval).toFixed(2)} ataques/s · ${(st.interval / 1000).toFixed(2)} s entre golpes · Movimento ${st.moveSpeed.toFixed(1)} u/s`),
        element("p", `Regeneração ${st.chakraRegen.toFixed(1)} chakra/s · Redução de dano ${(100 * st.defense / (100 + st.defense)).toFixed(1)}%`),
        action("Treinar este personagem · 25 moedas", () => trainCharacter(save, id), save.coins < 25 || p.upgrades >= 10000));
      if (!Object.values(CHARACTER_IDS).includes(id)) summary.append(element("p", "Atributos-base provisórios de recruta; balanceamento individual pendente."));
      if (id !== heroId) summary.append(element("p", "No grupo de exploração este personagem acompanha o protagonista; ainda não ataca nas caçadas."));
      content.append(summary);
      const descriptions = {
        vitality: "Define a vida máxima.", strength: "Aumenta o dano dos ataques e contribui para os jutsus.",
        ninjutsu: "Aumenta o dano dos jutsus e a cura da Sakura.", speed: "Acelera os ataques automáticos e o movimento pelo mapa.",
        chakra: "Define a reserva máxima de chakra.", control: "Aumenta a regeneração de chakra.",
        resistance: "Reduz o dano recebido nas caçadas.",
      };
      for (const key of Object.keys(ATTRIBUTE_LABELS) as (keyof typeof ATTRIBUTE_LABELS)[]) {
        const card = element("article", ""); card.className = "progress-card";
        card.append(element("h3", `${ATTRIBUTE_LABELS[key]} · ${Number(st.attributes[key].toFixed(1))}`), element("p", descriptions[key]));
        content.append(card);
      }
    }
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
        card.dataset.characterId = id;
        const progress = characterProgress(save, id);
        if (e.preview) {
          const img = document.createElement("img");
          img.src = e.preview;
          img.alt = "Corpo inteiro de " + e.name;
          card.append(img);
        }
        card.append(
          element("h3", e.name + (e.variant ? " [" + e.variant + "]" : "")),
          element("p", `Nível ${progress.level} · ${progress.level >= 100 ? "Nível máximo" : `${progress.xp}/${needed(progress.level)} XP`} · ${progress.upgrades} treinos`),
          action("Ver atributos", () => { attributeId = id; selected = "attributes"; }),
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
    ["attributes", "Atributos"],
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
