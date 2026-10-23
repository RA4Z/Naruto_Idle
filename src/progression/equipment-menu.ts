import { t, formatNumber } from "../i18n/core";
import { stats, type Save } from "../model";
import type { RuntimeEntry } from "../assets/runtime-index";
import { characterProgress, FUTURE_CHARACTERS } from "./character-progress";
import {
  EQUIPMENT_SLOTS,
  ITEMS,
  equipItem,
  unequipItem,
  replaceEquipment,
  validateEquipmentReplacement,
  type Slot,
} from "./rules";
import { compareEquipment } from "./equipment-comparison";
import { equipmentCopies } from "./equipment-ownership";
import "./equipment-menu.css";
import {
  equipmentCatalog,
  shopLevel,
  buyShopItem,
  type GearFilters,
  equipmentCopyCards,
  equipmentCopyCard,
  type EquipmentCopyCard,
} from "./equipment-catalog";

export type EquipmentMenuState = GearFilters & {
  character?: string;
  slot?: Slot;
  item?: string;
  copy?: string;
  copyLimit?: number;
  shop: boolean;
  search?: string;
  inventoryScroll?: number;
  switching?: boolean;
  anchor?: { left: number; top: number; width: number; height: number };
};
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const shapes: Record<Slot, string> = {
  headband:
    '<path d="M4 18h40v17H4zM4 22l-3 17 10-4M44 22l3 17-10-4"/><path d="M29 24c-8-8-15 9-4 7 7-2-3-9-4-2m4-6 4-6"/>',
  weapon:
    '<path d="m13 33 17-22 8 8-22 17zM16 36l-5 5m19-30 5-5 8 8-5 5"/><circle cx="8" cy="40" r="5"/>',
  armor:
    '<path d="m15 6 9 6 9-6 10 12-8 6v20H13V24l-8-6zM24 12v32M15 27h7m4 0h7M15 34h7m4 0h7"/>',
  scroll:
    '<path d="M12 9h25v30H12zM12 15h25M12 33h25M18 20h13m-13 6h10"/><ellipse cx="10" cy="24" rx="4" ry="18"/><ellipse cx="39" cy="24" rx="4" ry="18"/>',
  charm:
    '<path d="M7 7c0 30 34 30 34 0M16 29l8 14 8-14-8-6z"/><circle cx="24" cy="32" r="3"/>',
};
function icon(slot: Slot) {
  const node = el("span", "gear-icon");
  node.dataset.slot = slot;
  node.innerHTML = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${shapes[slot]}</svg>`;
  return node;
}
function portrait(entry: RuntimeEntry, characterId?: string) {
  const wrap = el("div", "gear-portrait");
  const placeholder = el("span", "gear-silhouette", entry.name.charAt(0));
  placeholder.setAttribute("aria-hidden", "true");
  wrap.append(placeholder);
  const sheetArt =
    characterId === "11000101"
      ? "/assets/character-sheet/naruto-kid.png"
      : undefined;
  const artwork = sheetArt || entry.portrait;
  if (artwork) {
    wrap.classList.toggle("has-sheet-art", !!sheetArt);
    const image = el("img");
    image.src = artwork;
    image.alt = entry.name;
    image.loading = "lazy";
    image.onerror = () => {
      if (wrap.classList.contains("has-sheet-art") && entry.portrait) {
        wrap.classList.remove("has-sheet-art");
        image.src = entry.portrait;
      } else image.remove();
    };
    wrap.append(image);
  }
  return wrap;
}
function copyOwner(
  owner: string,
  entries: Record<string, RuntimeEntry>,
  other: boolean,
  compact = false,
) {
  const entry = entries[owner];
  const name = entry?.name || owner;
  const badge = el("span", "gear-copy-owner");
  badge.classList.toggle("is-other", other);
  badge.classList.toggle("is-compact", compact);
  badge.title = t("gear.equippedBy", { name });
  if (compact) {
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", badge.title);
  }
  const avatar = el("span", "gear-copy-avatar");
  const initial = el("span", "", name.charAt(0));
  avatar.append(initial);
  avatar.setAttribute("aria-hidden", "true");
  if (entry?.portrait) {
    const image = el("img");
    image.src = entry.portrait;
    image.alt = "";
    image.loading = "lazy";
    image.onload = () => {
      initial.hidden = true;
    };
    image.onerror = () => image.remove();
    avatar.append(image);
  }
  const text = el("span");
  text.append(
    el("small", "", t("gear.equippedByLabel")),
    el("strong", "", name),
  );
  badge.append(avatar);
  if (!compact) badge.append(text);
  return badge;
}
export function renderEquipmentMenu(
  host: HTMLElement,
  options: {
    save: Save;
    heroId: string;
    entries: Record<string, RuntimeEntry>;
    state: EquipmentMenuState;
    allowed: () => boolean;
    changed: () => void;
    rerender: () => void;
    feedback: (message: string) => void;
    switchCharacter: (id: string) => Promise<void>;
  },
) {
  const { save, entries, state, heroId, rerender, feedback } = options;
  const button = (text: string, run: () => void, className = "secondary") => {
    const b = el("button", className, text);
    b.type = "button";
    b.onclick = () => {
      try {
        run();
      } catch (error) {
        feedback(
          error instanceof Error ? error.message : t("gear.unavailable"),
        );
      }
    };
    return b;
  };
  const owned = [...new Set(save.collection || [])]
    .filter((id) => entries[id] && !FUTURE_CHARACTERS.has(id))
    .sort(
      (a, b) =>
        characterProgress(save, b).level - characterProgress(save, a).level ||
        entries[a].name.localeCompare(entries[b].name),
    );
  if (!state.shop && (!state.character || !owned.includes(state.character))) {
    state.character = undefined;
    const intro = el("div", "gear-intro");
    intro.append(el("span", "gear-kicker", t("gear.characters")));
    intro.append(
      el("h3", "gear-heading", t("gear.choose")),
      el("p", "gear-muted", t("gear.chooseHelp")),
    );
    host.append(intro);
    const search = el("input");
    search.type = "search";
    search.placeholder = t("qol.search");
    search.setAttribute("aria-label", t("qol.search"));
    const grid = el("div", "gear-character-grid");
    const cards: { id: string; node: HTMLElement }[] = [];
    for (const id of owned) {
      const p = characterProgress(save, id),
        entry = entries[id];
      const card = button(
        "",
        () => {
          state.character = id;
          state.slot = undefined;
          state.item = undefined;
          state.copy = undefined;
          state.copyLimit = 60;
          rerender();
        },
        "gear-character",
      );
      card.dataset.gearCharacter = id;
      card.classList.toggle("is-active", id === heroId);
      const top = el("div", "gear-card-top");
      top.append(el("span", "gear-level", t("gear.level", { level: p.level })));
      if (id === heroId) top.append(el("span", "gear-active", t("qol.active")));
      const copy = el("div", "gear-card-copy");
      copy.append(el("strong", "", entry.name));
      copy.append(
        el(
          "small",
          "gear-muted",
          t("gear.filled", { count: Object.keys(p.equipment).length }),
        ),
      );
      const pips = el("span", "gear-slot-pips");
      pips.setAttribute("aria-hidden", "true");
      for (const slot of EQUIPMENT_SLOTS) {
        const pip = el("i");
        pip.classList.toggle("filled", !!p.equipment[slot]);
        pips.append(pip);
      }
      copy.append(
        pips,
        el("span", "gear-card-action", t("gear.manage") + " →"),
      );
      const art = portrait(entry);
      art.querySelector("img")?.setAttribute("alt", "");
      card.append(top, art, copy);
      cards.push({ id, node: card });
      grid.append(card);
    }
    const empty = el("p", "gear-muted", t("qol.noResults"));
    empty.hidden = owned.length > 0;
    search.oninput = () => {
      let count = 0;
      for (const c of cards) {
        c.node.hidden = !`${entries[c.id].name} ${c.id}`
          .toLocaleLowerCase()
          .includes(search.value.toLocaleLowerCase());
        if (!c.node.hidden) count++;
      }
      empty.hidden = count > 0;
    };
    host.append(search, grid, empty);
    return;
  }
  const id = state.character || "",
    entry = entries[id],
    progress = state.shop
      ? {
          level: shopLevel(save),
          equipment: {} as Partial<Record<Slot, string>>,
        }
      : characterProgress(save, id);
  if (!state.shop) {
    const header = el("div", "gear-toolbar");
    header.append(
      button(t("gear.back"), () => {
        state.character = undefined;
        rerender();
      }),
      el("span", "gear-muted", t("gear.editing")),
    );
    host.append(header);
  } else {
    const intro = el("div", "gear-shop-intro");
    intro.append(
      el("p", "gear-muted", t("gear.shopHelp")),
      el(
        "span",
        "gear-shop-level",
        t("gear.shopLevel", { level: progress.level }),
      ),
    );
    host.append(intro);
  }
  const layout = el("div", "gear-layout"),
    sheet = el("section", "gear-sheet"),
    bag = el("section", "gear-bag");
  layout.classList.toggle("is-shop", state.shop);
  if (!state.shop) {
    const st = stats(save, id);
    const identity = el("div", "gear-identity");
    const name = el("div", "gear-identity-name");
    name.append(
      el("span", "gear-kicker", t("gear.sheet")),
      el("h3", "", entry.name),
    );
    identity.append(
      el("span", "gear-level", t("gear.level", { level: progress.level })),
      name,
    );
    if (id === heroId)
      identity.append(el("span", "gear-active", t("qol.active")));
    else {
      const play = el(
        "button",
        "gear-play",
        t("gear.playAs", { name: entry.name }),
      );
      play.type = "button";
      play.disabled =
        !!state.switching ||
        !options.allowed() ||
        !entry.capabilities.companion ||
        !entry.capabilities.enemy;
      if (!options.allowed()) play.title = t("qol.switchBlocked");
      play.onclick = async () => {
        if (state.switching) return;
        state.switching = true;
        play.disabled = true;
        play.setAttribute("aria-busy", "true");
        play.textContent = t("qol.processing");
        try {
          if (!options.allowed()) throw new Error(t("qol.switchBlocked"));
          await options.switchCharacter(id);
        } catch (error) {
          feedback(
            error instanceof Error ? error.message : t("gear.unavailable"),
          );
        } finally {
          state.switching = false;
          play.removeAttribute("aria-busy");
          rerender();
        }
      };
      identity.append(play);
    }
    sheet.append(identity);
    const stage = el("div", "gear-stage"),
      left = el("div", "gear-slots"),
      right = el("div", "gear-slots");
    const art = portrait(entry, id);
    art.classList.add("gear-portrait-main");
    for (const [index, slot] of EQUIPMENT_SLOTS.entries()) {
      const current = ITEMS.find((i) => i.id === progress.equipment[slot]);
      const b = button(
        "",
        () => {
          state.slot = state.slot === slot ? undefined : slot;
          state.item = current?.id;
          state.copy = current ? `owner:${id}` : undefined;
          state.anchor = b.getBoundingClientRect().toJSON();
          rerender();
        },
        "gear-slot",
      );
      b.dataset.slot = slot;
      b.dataset.tier = String(current?.tier || 0);
      b.classList.toggle("is-filled", !!current);
      b.setAttribute("aria-pressed", String(state.slot === slot));
      b.title = `${t(`state.${slot}`)}: ${current?.name || t("expansion.emptySlot")}`;
      b.setAttribute("aria-label", b.title);
      b.append(
        el("span", "", t(`state.${slot}`)),
        icon(slot),
        el("small", "", current ? current.name : t("gear.empty")),
      );
      (index < 3 ? left : right).append(b);
    }
    stage.append(left, art, right);
    sheet.append(
      stage,
      el(
        "p",
        "gear-equipped-count",
        t("gear.filled", { count: Object.keys(progress.equipment).length }),
      ),
    );
    sheet.append(
      el("h4", "gear-section-label", t("progression.ui.d6436ac4f7")),
    );
    const attributes = el("dl", "gear-stats");
    for (const [label, value] of [
      ["qol.hp", st.maxHp],
      ["qol.attack", st.attack],
      ["balance.skillDamage", st.skillDamage],
      ["qol.chakra", st.maxChakra],
      ["balance.defense", st.defense],
      ["balance.moveSpeed", st.moveSpeed],
    ] as const) {
      const group = el("div", "gear-stat");
      group.append(
        el("dt", "", t(label)),
        el("dd", "", formatNumber(value, { maximumFractionDigits: 1 })),
      );
      attributes.append(group);
    }
    sheet.append(attributes);
  }
  const bagHeading = el("div", "gear-bag-heading");
  bagHeading.append(
    el("span", "gear-kicker", t("gear.title")),
    el("h3", "", t(state.shop ? "gear.shopCatalog" : "gear.arsenal")),
  );
  bag.append(bagHeading);
  const filters = el("div", "gear-filters");
  const filter = el("select");
  filter.setAttribute("aria-label", t("balance.allSlots"));
  for (const slot of ["all", ...EQUIPMENT_SLOTS] as const) {
    const opt = el(
      "option",
      "",
      slot === "all" ? t("balance.allSlots") : t(`state.${slot}`),
    );
    opt.value = slot;
    filter.append(opt);
  }
  filter.value = state.slot || "all";
  filter.onchange = () => {
    state.slot = filter.value === "all" ? undefined : (filter.value as Slot);
    state.item = undefined;
    state.inventoryScroll = 0;
    state.copyLimit = 60;
    rerender();
  };
  const search = el("input");
  search.type = "search";
  search.placeholder = t("gear.searchItems");
  search.value = state.search || "";
  search.setAttribute("aria-label", t("gear.searchItems"));
  filters.append(filter, search);
  const refinements = el("div", "gear-refinements");
  const picker = (
    label: string,
    value: string,
    choices: [string, string][],
    change: (value: string) => void,
  ) => {
    const select = el("select");
    select.setAttribute("aria-label", label);
    for (const [key, name] of choices) {
      const option = el("option", "", name);
      option.value = key;
      select.append(option);
    }
    select.value = value;
    select.onchange = () => {
      change(select.value);
      state.item = undefined;
      state.inventoryScroll = 0;
      state.copyLimit = 60;
      rerender();
    };
    return select;
  };
  refinements.append(
    picker(
      t("balance.allPaths"),
      state.path || "",
      [
        ["", t("balance.allPaths")],
        ["damage", t("balance.path.damage")],
        ["survival", t("balance.path.survival")],
        ["chakra", t("balance.path.chakra")],
      ],
      (value) => (state.path = value || undefined),
    ),
    picker(
      t("gear.availability"),
      state.availability || "all",
      [
        ["all", t("gear.showAll")],
        ["usable", t(state.shop ? "gear.shopUnlocked" : "gear.usable")],
        ...(state.shop
          ? ([["affordable", t("gear.affordable")]] as [string, string][])
          : []),
      ],
      (value) => (state.availability = value as GearFilters["availability"]),
    ),
    picker(
      t("gear.sort"),
      state.sort || "level",
      [
        ["level", t("gear.sortLevel")],
        ["price", t("gear.sortPrice")],
        ["priceDescending", t("gear.sortPriceDescending")],
      ],
      (value) => (state.sort = value as GearFilters["sort"]),
    ),
  );
  filters.append(refinements);
  bag.append(filters);
  const inventory = el("div", "gear-item-grid");
  inventory.setAttribute(
    "aria-label",
    t(state.shop ? "gear.shopCatalog" : "gear.ownedItems"),
  );
  const items = equipmentCatalog(save, id, state);
  const resultCount = el("span", "gear-result-count");
  bagHeading.append(resultCount);
  inventory.onscroll = () => {
    state.inventoryScroll = inventory.scrollTop;
  };
  const empty = el("p", "gear-empty", t("gear.noItems"));
  let rows: EquipmentCopyCard[] = [];
  const renderCards = () => {
    inventory.replaceChildren();
    const filtered = items.filter((item) =>
      item.name
        .toLocaleLowerCase()
        .includes((state.search || "").toLocaleLowerCase()),
    );
    const page = state.shop
      ? {
          cards: filtered.map(
            (item) => ({ item, key: "shop" }) as EquipmentCopyCard,
          ),
          total: filtered.length,
        }
      : equipmentCopyCards(
          save,
          filtered,
          id,
          state.availability === "usable",
          state.copyLimit || 60,
        );
    rows = page.cards;
    for (const row of rows) {
      const { item, owner } = row;
      const equipped = !state.shop && owner === id;
      const card = button(
        "",
        () => {
          state.item = item.id;
          state.copy = row.key;
          const rect = card.getBoundingClientRect();
          state.anchor = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
          rerender();
        },
        "gear-item",
      );
      card.dataset.gearItem = item.id;
      card.dataset.gearCopy = row.key;
      if (owner) card.dataset.gearOwner = owner;
      card.dataset.tier = String(item.tier);
      card.classList.toggle("is-equipped", equipped);
      card.classList.toggle("is-reserved", !!owner && owner !== id);
      card.setAttribute(
        "aria-pressed",
        String(
          state.item === item.id && (state.copy || `owner:${id}`) === row.key,
        ),
      );
      card.append(
        el("span", "gear-tier", ["I", "II", "III"][item.tier - 1]),
        icon(item.slot),
        el("strong", "gear-item-name", item.name),
      );
      const meta = el("span", "gear-item-meta");
      meta.append(
        el("small", "gear-muted", t("gear.level", { level: item.level })),
      );
      card.append(meta);
      if (progress.level < item.level)
        card.title = t("balance.requireLevel", { level: item.level });
      if (!state.shop) {
        if (owner) card.append(copyOwner(owner, entries, owner !== id, true));
        else card.append(el("span", "gear-copy-free", t("gear.freeCopy")));
      }
      if (state.shop) {
        const price = el(
          "span",
          "gear-price",
          t("gear.price", { price: item.price }),
        );
        price.classList.toggle("cannot-afford", save.coins < item.price);
        meta.append(price);
      }
      inventory.append(card);
    }
    if (page.total > rows.length) {
      const more = button(
        t("gear.moreCopies", { count: page.total - rows.length }),
        () => {
          state.copyLimit = (state.copyLimit || 60) + 60;
          renderCards();
        },
        "gear-more-copies secondary",
      );
      inventory.append(more);
    }
    empty.hidden = page.total > 0;
    resultCount.textContent = t(
      state.shop ? "gear.results" : "gear.copyResults",
      { count: page.total },
    );
  };
  search.oninput = () => {
    state.search = search.value;
    state.copyLimit = 60;
    renderCards();
  };
  renderCards();
  bag.append(inventory, empty);
  const item = items.find(
    (i) =>
      i.id === state.item &&
      (state.shop || save.inventory[i.id]) &&
      (!state.slot || state.slot === i.slot),
  );
  const detail = el("section", "gear-detail");
  detail.setAttribute("aria-live", "polite");
  if (item) {
    const selectedCopy = equipmentCopyCard(
        save,
        item,
        state.copy || `owner:${id}`,
      ),
      owner = selectedCopy?.owner,
      equipped = !state.shop && owner === id,
      otherOwner = !!owner && owner !== id,
      alreadyEquipped =
        !state.shop && !owner && progress.equipment[item.slot] === item.id;
    const heading = el("div", "gear-detail-heading");
    const name = el("div");
    name.append(
      el("span", "gear-kicker", t(`state.${item.slot}`)),
      el("h4", "", item.name),
    );
    heading.append(icon(item.slot), name);
    detail.append(heading, el("p", "gear-muted", item.description));
    if (!state.shop) {
      if (owner) detail.append(copyOwner(owner, entries, otherOwner));
      else detail.append(el("p", "gear-copy-free", t("gear.freeCopy")));
    }
    const delta = state.shop
        ? {
            attack: item.attack,
            hp: item.hp,
            chakra: item.chakra,
            regen: item.regen,
            skillDamage: item.ninjutsu || 0,
            attackRate: 0,
            moveSpeed: item.speed || 0,
            defense: item.defense || 0,
          }
        : compareEquipment(save, item.id, id),
      comparisons = el("div", "gear-comparisons");
    for (const [key, label] of [
      ["attack", "qol.attack"],
      ["hp", "qol.hp"],
      [
        "skillDamage",
        state.shop
          ? "progression.combat-stats.338f89bb9f"
          : "balance.skillDamage",
      ],
      ["chakra", "qol.chakra"],
      ["regen", "qol.regen"],
      ["defense", "balance.defense"],
      ["attackRate", "balance.attackRate"],
      [
        "moveSpeed",
        state.shop
          ? "progression.combat-stats.7780d60ca0"
          : "balance.moveSpeed",
      ],
    ] as const) {
      const value = delta[key];
      if (!value) continue;
      comparisons.append(
        el(
          "span",
          value > 0 ? "gear-gain" : "gear-loss",
          `${t(label)} ${value > 0 ? "+" : ""}${formatNumber(value, { maximumFractionDigits: 2 })}`,
        ),
      );
    }
    detail.append(comparisons);
    let swapError = "";
    if (otherOwner) {
      try {
        validateEquipmentReplacement(
          save,
          item.id,
          owner!,
          id,
          options.allowed(),
        );
      } catch (error) {
        swapError =
          error instanceof Error ? error.message : t("gear.unavailable");
      }
      const outgoing = ITEMS.find(
        (i) => i.id === progress.equipment[item.slot],
      );
      detail.append(
        el(
          "p",
          "gear-muted",
          t(outgoing ? "gear.swapPreview" : "gear.transferPreview", {
            name: entries[owner!]?.name || owner!,
            item: outgoing?.name || "",
          }),
        ),
      );
    }
    const blocked = !state.shop && !options.allowed(),
      low = progress.level < item.level,
      unavailable =
        !state.shop &&
        !equipped &&
        (!selectedCopy ||
          (!otherOwner && equipmentCopies(save, item.id, id).available < 1));
    detail.append(
      el("p", "gear-muted", t("gear.copies", equipmentCopies(save, item.id))),
    );
    const act = button(
      state.shop
        ? t("gear.buy", { price: item.price })
        : otherOwner
          ? t("gear.replace")
          : equipped
            ? t("gear.unequip")
            : alreadyEquipped
              ? t("common.equipped")
              : t("gear.equip"),
      () => {
        if (!state.shop && !options.allowed())
          throw new Error(t("qol.switchBlocked"));
        if (state.shop) buyShopItem(save, item.id);
        else if (otherOwner)
          replaceEquipment(save, item.id, owner!, id, options.allowed());
        else if (equipped) {
          unequipItem(save, item.slot, id, options.allowed());
          state.copy = "free:0";
        } else {
          equipItem(save, item.id, id, options.allowed());
          state.copy = `owner:${id}`;
        }
        options.changed();
        feedback(t("common.updated"));
        state.item = undefined;
        state.copy = undefined;
        rerender();
      },
      "gear-primary",
    );
    act.disabled =
      blocked ||
      unavailable ||
      !!swapError ||
      alreadyEquipped ||
      (!equipped && low) ||
      (state.shop && save.coins < item.price);
    const reason = blocked
      ? t("qol.switchBlocked")
      : otherOwner
        ? swapError
        : alreadyEquipped
          ? t("gear.alreadyEquippedHere")
          : unavailable
            ? t("gear.copyInUse")
            : low && !equipped
              ? t("balance.requireLevel", { level: item.level })
              : state.shop && save.coins < item.price
                ? t("qol.cannotAfford")
                : "";
    if (reason) {
      act.title = reason;
      detail.append(el("p", "gear-muted", reason));
    }
    detail.append(act);
  } else {
    detail.classList.add("is-empty");
    detail.append(
      icon("weapon"),
      el(
        "p",
        "gear-muted",
        t(state.shop ? "gear.shopInspect" : "gear.inspect"),
      ),
    );
  }
  // Item details live in the top layer instead of reserving arsenal space.
  if (!state.shop) layout.append(sheet);
  layout.append(bag);
  host.append(layout);
  inventory.scrollTop = state.inventoryScroll || 0;
  if (item) {
    detail.classList.add("gear-item-popover");
    detail.setAttribute("popover", "auto");
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-label", item.name);
    detail.tabIndex = -1;
    const returnFocus = () => {
      const trigger = Array.from(
        inventory.querySelectorAll<HTMLButtonElement>("[data-gear-item]"),
      ).find(
        (c) =>
          c.dataset.gearItem === item.id &&
          c.dataset.gearCopy === (state.copy || `owner:${id}`),
      );
      trigger?.focus({ preventScroll: true });
    };
    const close = button(
      t("progression.ui.0f2bd88ef0"),
      () => {
        returnFocus();
        detail.hidePopover();
      },
      "gear-popover-close secondary",
    );
    detail.prepend(close);
    detail.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        returnFocus();
        detail.hidePopover();
      }
    };
    detail.addEventListener("toggle", (event) => {
      if ((event as ToggleEvent).newState === "closed") {
        resizeController.abort();
        if (detail.isConnected) state.item = undefined;
      }
    });
    const resizeController = new AbortController();
    window.addEventListener("resize", () => detail.hidePopover(), {
      signal: resizeController.signal,
    });
    host.append(detail);
    detail.showPopover();
    const rect = detail.getBoundingClientRect();
    const anchor = state.anchor || {
      left: innerWidth / 2,
      top: innerHeight / 2,
      width: 0,
      height: 0,
    };
    const right = anchor.left + anchor.width + 12;
    const x =
      right + rect.width <= innerWidth - 12
        ? right
        : anchor.left - rect.width - 12;
    detail.style.left = `${Math.max(12, Math.min(innerWidth - rect.width - 12, x))}px`;
    detail.style.top = `${Math.max(12, Math.min(innerHeight - rect.height - 12, anchor.top))}px`;
    detail.focus({ preventScroll: true });
  }
}
