import "./inspection.css";
import { t, formatNumber } from "../i18n/core";
import { runtimeIndex, type RuntimeEntry } from "../assets/runtime-index";
import { combatStats } from "../progression/combat-stats";
import { recruitProfile } from "../progression/recruit-profiles";
import { EQUIPMENT_SLOTS, ITEMS } from "../progression/rules";
import { cloudClient } from "../cloud/client";
import { getInspection, friendAction, type PlayerInspection } from "./api";
type Entries = Record<string, RuntimeEntry>;
let dialog: HTMLDialogElement | undefined,
  revision = 0;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) => {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
};
function button(text: string, action: () => void, secondary = true) {
  const b = el("button", text, secondary ? "secondary" : "");
  b.type = "button";
  b.onclick = action;
  return b;
}
function render(data: PlayerInspection, entries: Entries, host: HTMLElement) {
  const p = data.profile,
    c = data.character;
  host.replaceChildren();
  const identity = el("div", "", "inspection-identity");
  identity.append(
    el("h3", p.display_name),
    el("span", "@" + p.username, "caption"),
  );
  if (p.bio) identity.append(el("p", p.bio, "social-bio"));
  host.append(identity);
  const content = el("div", "", "inspection-layout");
  if (c) {
    const entry = entries[c.id],
      name = entry?.name ?? c.id;
    const character = el("section", "", "inspection-character");
    character.dataset.character = c.id;
    character.append(
      el("p", t("inspection.active"), "eyebrow"),
      el("h3", name),
      el("span", t("gear.level", { level: c.level }), "inspection-level"),
    );
    const art = el("div", "", "inspection-art");
    const image = el("img");
    image.alt = name;
    const source =
      c.id === "11000101"
        ? "/assets/character-sheet/naruto-kid.png"
        : entry?.portrait || entry?.preview;
    if (source) {
      image.src = source;
      image.onerror = () => image.remove();
      art.append(image);
    }
    character.append(art);
    content.append(character);
    const detail = el("section", "", "inspection-loadout");
    detail.append(el("h3", t("inspection.attributes")));
    const starters: Record<string, "naruto" | "sasuke" | "sakura"> = {
      "11000101": "naruto",
      "11000211": "sasuke",
      "11000301": "sakura",
    };
    const starter = starters[c.id];
    const recruit = starter ? undefined : recruitProfile(c.id);
    const st = combatStats(
      {
        ...c,
        character: starter ?? "naruto",
        inventory: Object.fromEntries(
          Object.values(c.equipment)
            .filter(Boolean)
            .map((id) => [id, 1]),
        ),
      },
      recruit?.base,
      recruit,
    );
    const stats = el("dl", "", "inspection-stats");
    for (const [key, value] of [
      ["qol.hp", st.maxHp],
      ["qol.attack", st.attack],
      ["balance.skillDamage", st.skillDamage],
      ["qol.chakra", st.maxChakra],
      ["balance.defense", st.defense],
      ["balance.moveSpeed", st.moveSpeed],
    ] as const) {
      const group = el("div");
      group.append(
        el("dt", t(key)),
        el("dd", formatNumber(value, { maximumFractionDigits: 1 })),
      );
      stats.append(group);
    }
    detail.append(stats, el("h3", t("inspection.equipment")));
    const gear = el("div", "", "inspection-equipment");
    for (const slot of EQUIPMENT_SLOTS) {
      const item = ITEMS.find(
        (i) => i.id === c.equipment[slot] && i.slot === slot,
      );
      const row = el("details", "", "inspection-slot");
      row.dataset.slot = slot;
      const summary = el("summary");
      summary.append(
        el("span", t(`state.${slot}`), "caption"),
        el("strong", item?.name ?? t("gear.empty")),
      );
      row.append(summary);
      if (item) {
        row.dataset.item = item.id;
        row.append(
          el("p", item.description),
          el("small", t("gear.level", { level: item.level })),
        );
        const bonuses = el("div", "", "inspection-bonuses");
        for (const [key, value] of [
          ["qol.hp", item.hp],
          ["qol.attack", item.attack],
          ["qol.chakra", item.chakra],
          ["qol.regen", item.regen],
          ["balance.defense", item.defense],
          ["progression.combat-stats.338f89bb9f", item.ninjutsu],
          ["progression.combat-stats.7780d60ca0", item.speed],
        ] as const)
          if (value)
            bonuses.append(el("span", t(key) + " +" + formatNumber(value)));
        row.append(bonuses);
      } else row.append(el("p", t("inspection.emptySlot")));
      gear.append(row);
    }
    detail.append(gear);
    content.append(detail);
  } else content.append(el("p", t("inspection.noCharacter"), "caption"));
  host.append(content);
  const actions = el("footer", "", "inspection-actions");
  actions.dataset.relationship = p.relationship;
  if (p.relationship === "self")
    actions.append(el("span", t("inspection.you"), "caption"));
  const options =
    p.relationship === "none"
      ? [["social.add", "request"]]
      : p.relationship === "incoming"
        ? [
            ["social.accept", "accept"],
            ["social.decline", "decline"],
          ]
        : p.relationship === "outgoing"
          ? [["social.cancel", "cancel"]]
          : [];
  if (p.relationship === "friends")
    actions.append(
      el("span", "✓ " + t("social.friends"), "inspection-friends"),
    );
  for (const [key, action] of options)
    actions.append(
      button(
        t(key as "social.add"),
        () => {
          void load(p.user_id, action);
        },
        action !== "request" && action !== "accept",
      ),
    );
  actions.append(button(t("social.refresh"), () => void load(p.user_id)));
  host.insertBefore(actions, content);
  host.append(el("p", t("inspection.saved"), "caption inspection-saved"));
}
async function load(id: string, action?: string) {
  const request = ++revision,
    d = dialog!;
  d.setAttribute("aria-busy", "true");
  d.querySelectorAll<HTMLButtonElement>("main button").forEach(
    (b) => (b.disabled = true),
  );
  const status = d.querySelector<HTMLElement>("[role=status]")!;
  status.textContent = t("cloud.processing");
  try {
    if (action) await friendAction(id, action);
    const [data, index] = await Promise.all([
      getInspection(id),
      runtimeIndex(),
    ]);
    if (request !== revision || !d.open) return;
    render(data, index.entities, d.querySelector("main")!);
    status.textContent = "";
  } catch {
    if (request === revision && d.open)
      status.textContent = t("social.failure");
  } finally {
    if (request === revision) {
      d.removeAttribute("aria-busy");
      d.querySelectorAll<HTMLButtonElement>("main button").forEach(
        (b) => (b.disabled = false),
      );
    }
  }
}
export async function openPlayerInspection(id: string) {
  if (!dialog) {
    dialog = el("dialog", "", "player-inspection");
    dialog.setAttribute("aria-labelledby", "inspection-title");
    const header = el("header", "", "library-heading"),
      title = el("div");
    const heading = el("h2", t("inspection.title"));
    heading.id = "inspection-title";
    title.append(el("p", t("social.eyebrow"), "eyebrow"), heading);
    header.append(
      title,
      button(t("social.close"), () => dialog!.close()),
    );
    const status = el("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    dialog.append(header, status, el("main"));
    dialog.addEventListener("close", () => {
      ++revision;
      dialog?.querySelector("main")?.replaceChildren();
    });
    document.body.append(dialog);
  }
  dialog.querySelector("main")!.replaceChildren();
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  await load(id);
}
cloudClient?.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") dialog?.close();
});
