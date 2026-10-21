import { t, th, errorText, formatNumber } from "../i18n/core.ts";
import { ITEMS, QUESTS, buyItem, equipItem, claimQuest } from "./rules";
import { addXp, stats, needed, type Save } from "../model";
import { ATTRIBUTE_LABELS } from "./combat-stats";
import {
  CHARACTER_IDS,
  characterProgress,
  trainCharacter,
  FUTURE_CHARACTERS,
} from "./character-progress";
import { runtimeIndex } from "../assets/runtime-index";
type Context = {
  save: Save;
  onChange: () => void;
  switchCharacter: (id: string) => Promise<void>;
  heroId: string;
};
export function installProgression(context: () => Context) {
  const dialog = document.createElement("dialog");
  dialog.className = "progression-panel";
  dialog.innerHTML = `<div class="library-heading"><div><p class="eyebrow">${th("progression.ui.d768a61929")}</p><h2>${th("common.bagProgress")}</h2></div><button class="secondary" data-close>${th("progression.ui.0f2bd88ef0")}</button></div><nav></nav><p data-balance></p><div data-content></div><p role="status"></p>`;
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
      { save, onChange, switchCharacter, heroId } = context();
    dialog.querySelector("[data-balance]")!.textContent = t(
      "progression.ui.89b45cb7e8",
      { v0: save.coins, v1: save.inventory.fragmento || 0 },
    );
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
          feedback.textContent = t("common.updated");
          if (dialog.open) void render();
        } catch (e) {
          feedback.textContent = errorText(e);
          b.disabled = false;
        }
      };
      return b;
    };
    if (selected === "attributes") {
      const runtime = await runtimeIndex();
      const entries = (save.collection || [])
        .filter((id) => runtime.entities[id] && !FUTURE_CHARACTERS.has(id))
        .map((id) => ({ id, ...runtime.entities[id] }));
      if (request !== version || !dialog.open) return;
      if (!attributeId || !save.collection?.includes(attributeId))
        attributeId = heroId;
      const id = attributeId,
        p = characterProgress(save, id),
        st = stats(save, id);
      const picker = document.createElement("select");
      picker.setAttribute("aria-label", t("progression.ui.a89c4c5f33"));
      for (const ownedId of save.collection || []) {
        if (FUTURE_CHARACTERS.has(ownedId)) continue;
        const option = document.createElement("option");
        const progress = characterProgress(save, ownedId);
        option.value = ownedId;
        option.textContent = t("progression.ui.33a1d3557c", {
          v0: entries.find((e) => e.id === ownedId)?.name || ownedId,
          v1: progress.level,
        });
        picker.append(option);
      }
      picker.value = id;
      picker.onchange = () => {
        attributeId = picker.value;
        void render();
      };
      const label = element("label", t("progression.ui.aa45b4c186"));
      label.append(picker);
      const summary = element("section", "");
      summary.className = "attribute-summary";
      summary.append(
        label,
        element("h3", entries.find((e) => e.id === id)?.name || id),
        element(
          "p",
          t("progression.ui.20cb1676ce", {
            v0: p.level,
            v1:
              p.level >= 100
                ? t("progression.ui.f20408d1c9")
                : t("progression.ui.29612b2ab1", {
                    v0: p.xp,
                    v1: needed(p.level),
                  }),
            v2: p.upgrades,
          }),
        ),
        element("p", t("progression.ui.281a9eee15")),
        element(
          "p",
          t("progression.ui.157bed64c8", {
            v0: st.attack,
            v1: st.skillDamage,
            v2: st.maxHp,
            v3: st.maxChakra,
          }),
        ),
        element(
          "p",
          t("progression.ui.9ca9ba07c4", {
            v0: formatNumber(1000 / st.interval, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            v1: formatNumber(st.interval / 1000, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            v2: formatNumber(st.moveSpeed, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
        ),
        element(
          "p",
          t("progression.ui.54739eb301", {
            v0: formatNumber(st.chakraRegen, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
            v1: formatNumber((100 * st.defense) / (100 + st.defense), {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
        ),
        action(
          t("progression.ui.ffd73c0921"),
          () => trainCharacter(save, id),
          save.coins < 25 || p.upgrades >= 10000,
        ),
      );
      if (!Object.values(CHARACTER_IDS).includes(id))
        summary.append(element("p", t("progression.ui.593edf69bc")));
      if (id !== heroId)
        summary.append(element("p", t("progression.ui.50268bde1b")));
      content.append(summary);
      const descriptions = {
        vitality: t("progression.ui.d4ff71ed5f"),
        strength: t("progression.ui.c58888502e"),
        ninjutsu: t("progression.ui.1429d1edd1"),
        speed: t("progression.ui.4f9dded311"),
        chakra: t("progression.ui.8d97d3bd5a"),
        control: t("progression.ui.27f9a01512"),
        resistance: t("progression.ui.80f02da48c"),
      };
      for (const key of Object.keys(
        ATTRIBUTE_LABELS,
      ) as (keyof typeof ATTRIBUTE_LABELS)[]) {
        const card = element("article", "");
        card.className = "progress-card";
        card.append(
          element(
            "h3",
            `${ATTRIBUTE_LABELS[key]} · ${Number(st.attributes[key].toFixed(1))}`,
          ),
          element("p", descriptions[key]),
        );
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
            t("progression.ui.878825bc1a", {
              v0: progress,
              v1: q.target,
              v2: q.coins,
              v3: q.xp,
            }),
          ),
          action(
            claimed ? t("common.claimed") : t("progression.ui.df6466e7d9"),
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
          element(
            "h3",
            item.name + (equipped ? t("common.equippedSuffix") : ""),
          ),
          element("p", item.description),
          element(
            "p",
            `Ataque +${item.attack} · Vida +${item.hp} · Chakra +${item.chakra}${item.regen ? t("progression.ui.182b9d2e42") + item.regen + "/s" : ""}`,
          ),
        );
        if (selected === "shop")
          card.append(
            action(
              save.inventory[item.id]
                ? t("progression.ui.0dd8617e2b")
                : t("progression.ui.370bf0579c", { v0: item.price }),
              () => {
                buyItem(save, item.id);
              },
              !!save.inventory[item.id],
            ),
          );
        else
          card.append(
            action(
              equipped ? t("common.equipped") : t("progression.ui.82ed3d66ab"),
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
                  `${id === "fragmento" ? t("progression.ui.892dd2b4e9") : id === "chakra-shard" ? t("content.chakraShard") : id}: ${n}`,
              )
              .join(" · ") || t("progression.ui.93faee80ef"),
          ),
        );
      }
    }
    if (selected === "collection") {
      const runtime = await runtimeIndex();
      const entries = (save.collection || [])
        .filter((id) => runtime.entities[id])
        .map((id) => ({ id, ...runtime.entities[id] }));
      if (request !== version || !dialog.open) return;
      for (const id of save.collection || []) {
        if (FUTURE_CHARACTERS.has(id)) continue;
        const e = entries.find((e) => e.id === id);
        if (!e) continue;
        const card = element("article", "");
        card.className = "progress-card";
        card.dataset.characterId = id;
        const progress = characterProgress(save, id);
        if (e.preview) {
          const img = document.createElement("img");
          img.src = e.preview;
          img.alt = t("progression.ui.40e5dc98cf") + e.name;
          card.append(img);
        }
        card.append(
          element("h3", e.name + (e.variant ? " [" + e.variant + "]" : "")),
          element(
            "p",
            t("progression.ui.20cb1676ce", {
              v0: progress.level,
              v1:
                progress.level >= 100
                  ? t("progression.ui.f20408d1c9")
                  : t("progression.ui.29612b2ab1", {
                      v0: progress.xp,
                      v1: needed(progress.level),
                    }),
              v2: progress.upgrades,
            }),
          ),
          action(t("progression.ui.7e182509da"), () => {
            attributeId = id;
            selected = "attributes";
          }),
          action(
            id === heroId
              ? t("progression.ui.2ddbfee8b6")
              : t("progression.ui.2e7fa90a28"),
            async () => {
              await switchCharacter(id);
            },
            id === heroId || !e.capabilities.companion || !e.capabilities.enemy,
          ),
        );
        content.append(card);
      }
      content.append(element("p", t("progression.ui.62ec09bfd4")));
    }
  }
  for (const [id, name] of [
    ["attributes", t("progression.ui.d6436ac4f7")],
    ["quests", t("progression.ui.2d1c19f7e3")],
    ["inventory", t("progression.ui.a5aa9d7a87")],
    ["shop", t("progression.ui.70feed55e9")],
    ["collection", t("progression.ui.7c52deaf16")],
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
