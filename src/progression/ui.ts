import { t, th, errorText, formatNumber } from "../i18n/core.ts";
import {
  ITEMS,
  QUESTS,
  buyItem,
  equipItem,
  claimQuest,
  EQUIPMENT_SLOTS,
} from "./rules";
import { renderEquipmentMenu, type EquipmentMenuState } from "./equipment-menu";
import { addXp, stats, needed, type Save } from "../model";
import { ATTRIBUTE_LABELS } from "./combat-stats";
import {
  CHARACTER_IDS,
  characterProgress,
  trainCharacter,
  FUTURE_CHARACTERS,
} from "./character-progress";
import { runtimeIndex } from "../assets/runtime-index";
import { getPreferences, toggleFavorite } from "../preferences";
import { compareEquipment } from "./equipment-comparison";
import { recruitProfile } from "./recruit-profiles";
import {
  PRESET_IDS,
  savePreset,
  applyPreset,
  presetEquipment,
  comparePreset,
} from "./equipment-presets";
type Context = {
  save: Save;
  onChange: () => void;
  switchCharacter: (id: string) => Promise<void>;
  heroId: string;
  canSwitch: () => boolean;
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
  const equipmentState: EquipmentMenuState = { shop: false };
  const shopState: EquipmentMenuState = { shop: true };
  let selected = "equipment",
    version = 0;
  let collectionSearch = "",
    collectionSort = "level",
    favoritesOnly = false;
  let gearSlot = "all",
    gearPath = "all";
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
    content.classList.toggle(
      "gear-workshop",
      selected === "equipment" || selected === "shop",
    );
    dialog.querySelector("h2")!.textContent = t(
      selected === "shop"
        ? "gear.shop"
        : selected === "equipment"
          ? "gear.characters"
          : selected === "quests" ? "hud.quests" : "common.bagProgress",
    );
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
      if (disabled && label !== t("common.equipped")) b.title = label;
      b.onclick = async () => {
        b.disabled = true;
        b.setAttribute("aria-busy", "true");
        b.textContent = t("qol.processing");
        try {
          await run();
          onChange();
          feedback.textContent = t("common.updated");
          if (dialog.open) void render();
        } catch (e) {
          feedback.textContent = errorText(e);
          b.disabled = false;
          b.textContent = label;
        } finally {
          b.removeAttribute("aria-busy");
        }
      };
      return b;
    };
    if (selected === "equipment" || selected === "shop") {
      const state = selected === "shop" ? shopState : equipmentState;
      const runtime =
        selected === "shop" ? { entities: {} } : await runtimeIndex();
      if (request !== version || !dialog.open) return;
      renderEquipmentMenu(content as HTMLElement, {
        save,
        heroId,
        entries: runtime.entities,
        state,
        switchCharacter: (id) => context().switchCharacter(id),
        allowed: () => context().canSwitch(),
        changed: onChange,
        rerender: () => {
          void render();
        },
        feedback: (message) => {
          feedback.textContent = message;
        },
      });
    }
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
            v1: t("progression.ui.29612b2ab1", {
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
      if (!Object.values(CHARACTER_IDS).includes(id)) {
        const profile = recruitProfile(id);
        const details = element(
          "p",
          `${t(`balance.profile.${profile.style}`)} · ${t(`balance.trait.${profile.style}`)}`,
        );
        details.dataset.recruitProfile = profile.style;
        summary.append(details, element("p", t("balance.authoredTechnique")));
      }
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
    if (selected === "presets") {
      const help = element("p", t("expansion.presetHelp"));
      help.className = "preset-help";
      content.append(help);
      for (const key of PRESET_IDS) {
        const gear = presetEquipment(save, key);
        const card = element("article", "");
        card.className = "progress-card";
        card.dataset.preset = key;
        card.append(element("h3", t(`balance.path.${key}`)));
        const same =
          gear &&
          EQUIPMENT_SLOTS.every(
            (slot) =>
              (save.equipment as Record<string, string>)?.[slot] ===
              (gear as Record<string, string>)[slot],
          );
        if (same) card.append(element("p", t("common.equipped")));
        if (gear) {
          for (const slot of EQUIPMENT_SLOTS)
            card.append(
              element(
                "p",
                `${t(`state.${slot}`)}: ${ITEMS.find((i) => i.id === gear[slot])?.name || t("expansion.emptySlot")}`,
              ),
            );
          const delta = comparePreset(save, key)!;
          card.append(
            element(
              "p",
              t("qol.comparison", {
                values: (
                  [
                    ["attack", "qol.attack"],
                    ["hp", "qol.hp"],
                    ["chakra", "qol.chakra"],
                    ["regen", "qol.regen"],
                    ["skillDamage", "balance.skillDamage"],
                    ["attackRate", "balance.attackRate"],
                    ["moveSpeed", "balance.moveSpeed"],
                    ["defense", "balance.defense"],
                  ] as const
                )
                  .map(
                    ([value, label]) =>
                      `${t(label)} ${delta[value] > 0 ? "+" : ""}${formatNumber(delta[value], { maximumFractionDigits: 2 })}`,
                  )
                  .join(" · "),
              }),
            ),
          );
        } else card.append(element("p", t("expansion.presetMissing")));
        const storeButton = action(
          t(gear ? "expansion.overwritePreset" : "expansion.savePreset"),
          () => savePreset(save, key),
        );
        storeButton.dataset.savePreset = key;
        const applyButton = action(
          t("expansion.applyPreset"),
          () => applyPreset(save, key, context().canSwitch()),
          !gear || !context().canSwitch(),
        );
        applyButton.dataset.applyPreset = key;
        card.append(storeButton, applyButton);
        if (gear && !context().canSwitch())
          card.append(element("p", t("qol.switchBlocked")));
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
    if (["inventory"].includes(selected)) {
      const controls = element("div", "");
      controls.className = "library-controls";
      const slots = document.createElement("select");
      slots.dataset.gearSlot = "";
      slots.setAttribute("aria-label", t("balance.allSlots"));
      for (const [value, label] of [
        ["all", t("balance.allSlots")],
        ["weapon", t("state.weapon")],
        ["armor", t("state.armor")],
        ["charm", t("state.charm")],
        ["headband", t("state.headband")],
        ["scroll", t("state.scroll")],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        slots.append(option);
      }
      slots.value = gearSlot;
      slots.onchange = () => {
        gearSlot = slots.value;
        void render();
      };
      const paths = document.createElement("select");
      paths.dataset.gearPath = "";
      paths.setAttribute("aria-label", t("balance.allPaths"));
      for (const [value, label] of [
        ["all", t("balance.allPaths")],
        ["damage", t("balance.path.damage")],
        ["survival", t("balance.path.survival")],
        ["chakra", t("balance.path.chakra")],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        paths.append(option);
      }
      paths.value = gearPath;
      paths.onchange = () => {
        gearPath = paths.value;
        void render();
      };
      controls.append(slots, paths);
      content.append(controls);
      for (const item of ITEMS.filter(
        (i) =>
          (selected === "shop" || save.inventory[i.id]) &&
          (gearSlot === "all" || i.slot === gearSlot) &&
          (gearPath === "all" || i.path === gearPath),
      )) {
        const card = element("article", "");
        card.className = "progress-card";
        const equipped = save.equipment?.[item.slot] === item.id;
        card.dataset.item = item.id;
        card.append(
          element(
            "h3",
            item.name + (equipped ? t("common.equippedSuffix") : ""),
          ),
          element("p", item.description),
          element(
            "p",
            (
              [
                ["attack", "qol.attack"],
                ["hp", "qol.hp"],
                ["chakra", "qol.chakra"],
                ["regen", "qol.regen"],
                ["ninjutsu", "progression.combat-stats.338f89bb9f"],
                ["speed", "progression.combat-stats.7780d60ca0"],
                ["defense", "balance.defense"],
              ] as const
            )
              .filter(([key]) => item[key])
              .map(
                ([key, label]) =>
                  `${t(label)} ${(item[key] || 0) > 0 ? "+" : ""}${formatNumber(item[key] || 0)}`,
              )
              .join(" · "),
          ),
          element(
            "p",
            t("balance.equipmentTier", {
              tier: item.tier,
              level: item.level,
              path: t(`balance.path.${item.path}`),
            }),
          ),
        );
        if (save.level < item.level)
          card.append(
            element("p", t("balance.previewLevel", { level: item.level })),
          );
        const delta = compareEquipment(save, item.id);
        const comparison = element(
          "p",
          t("qol.comparison", {
            values: (
              [
                ["attack", "qol.attack"],
                ["hp", "qol.hp"],
                ["chakra", "qol.chakra"],
                ["regen", "qol.regen"],
                ["skillDamage", "balance.skillDamage"],
                ["attackRate", "balance.attackRate"],
                ["moveSpeed", "balance.moveSpeed"],
                ["defense", "balance.defense"],
              ] as const
            )
              .map(
                ([key, label]) =>
                  `${t(label)} ${delta[key] > 0 ? "+" : ""}${formatNumber(delta[key], { maximumFractionDigits: key === "attackRate" ? 2 : 1 })}`,
              )
              .join(" · "),
          }),
        );
        comparison.dataset.comparison = item.id;
        card.append(comparison);
        if (selected === "shop")
          card.append(
            action(
              t("progression.ui.370bf0579c", { v0: item.price }),
              () => {
                buyItem(save, item.id);
              },
              save.coins < item.price ||
                save.level < item.level,
            ),
          );
        else
          card.append(
            action(
              equipped ? t("common.equipped") : t("progression.ui.82ed3d66ab"),
              () => {
                equipItem(save, item.id, heroId, context().canSwitch());
              },
              equipped || save.level < item.level || !context().canSwitch(),
            ),
          );
        content.append(card);
        if (save.level < item.level) {
          card.querySelector("button")!.title = t("balance.requireLevel", {
            level: item.level,
          });
          card.append(
            element("p", t("balance.requireLevel", { level: item.level })),
          );
        }
        if (
          selected === "shop" &&
          save.coins < item.price
        ) {
          card.querySelector("button")!.title = t("qol.cannotAfford");
          card.append(element("p", t("qol.cannotAfford")));
        }
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
      const controls = element("div", "");
      controls.className = "library-controls";
      const search = document.createElement("input");
      search.type = "search";
      search.value = collectionSearch;
      search.placeholder = t("qol.search");
      search.setAttribute("aria-label", t("qol.search"));
      // Keep focus and cursor while filtering, even though cards are rebuilt.
      search.oninput = async () => {
        collectionSearch = search.value;
        const cursor = search.selectionStart;
        await render();
        const next = dialog.querySelector<HTMLInputElement>(
          "[data-owned-search]",
        );
        next?.focus();
        if (cursor !== null) next?.setSelectionRange(cursor, cursor);
      };
      search.dataset.ownedSearch = "";
      const sort = document.createElement("select");
      sort.setAttribute("aria-label", t("qol.sortLevel"));
      for (const [value, label] of [
        ["level", t("qol.sortLevel")],
        ["name", t("qol.sortName")],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sort.append(option);
      }
      sort.value = collectionSort;
      sort.onchange = () => {
        collectionSort = sort.value;
        void render();
      };
      const favLabel = element("label", t("qol.favoritesOnly"));
      const fav = document.createElement("input");
      fav.type = "checkbox";
      fav.checked = favoritesOnly;
      fav.onchange = () => {
        favoritesOnly = fav.checked;
        void render();
      };
      favLabel.prepend(fav);
      const archiveButton = action(t("qol.archive"), () => {
        dialog.close();
        window.dispatchEvent(new Event("open-character-archive"));
      });
      archiveButton.dataset.openArchive = "";
      controls.append(search, sort, favLabel, archiveButton);
      content.append(controls);
      const owned = entries
        .filter(
          (e) =>
            !FUTURE_CHARACTERS.has(e.id) &&
            (!favoritesOnly ||
              getPreferences().characterFavorites.includes(e.id)) &&
            `${e.name} ${e.id}`
              .toLocaleLowerCase()
              .includes(collectionSearch.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          collectionSort === "level"
            ? characterProgress(save, b.id).level -
                characterProgress(save, a.id).level ||
              a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name),
        );
      if (!owned.length) content.append(element("p", t("qol.noResults")));
      for (const { id } of owned) {
        if (FUTURE_CHARACTERS.has(id)) continue;
        const e = entries.find((e) => e.id === id);
        if (!e) continue;
        const card = element("article", "");
        card.className = "progress-card";
        card.dataset.characterId = id;
        card.classList.toggle("active-character", id === heroId);
        if (!Object.values(CHARACTER_IDS).includes(id))
          card.append(
            element("p", t(`balance.profile.${recruitProfile(id).style}`)),
          );
        if (id === heroId) card.append(element("strong", t("qol.active")));
        const favorite = action(
          (getPreferences().characterFavorites.includes(id) ? "★ " : "☆ ") +
            t("qol.favorite"),
          () => toggleFavorite("characterFavorites", id),
        );
        favorite.dataset.favoriteCharacter = id;
        favorite.setAttribute(
          "aria-pressed",
          String(getPreferences().characterFavorites.includes(id)),
        );
        card.append(favorite);
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
              v1: t("progression.ui.29612b2ab1", {
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
        const switchButton =
          card.querySelector<HTMLButtonElement>("button:last-child");
        if (id !== heroId && !context().canSwitch() && switchButton) {
          switchButton.disabled = true;
          switchButton.title = t("qol.switchBlocked");
          card.append(element("p", t("qol.switchBlocked")));
        }
        content.append(card);
      }
      content.append(element("p", t("progression.ui.62ec09bfd4")));
    }
  }
  for (const [id, name] of [
    ["equipment", t("gear.characters")],
    ["shop", t("progression.ui.70feed55e9")],
    ["quests", t("hud.quests")],
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
  return (tab?: string) => {
    if (tab) selected = tab;
    if (selected === "equipment") equipmentState.character = undefined;
    feedback.textContent = "";
    dialog.showModal();
    void render();
  };
}
