import { t, formatNumber, type MessageKey } from "../i18n/core";
import "./game-hud.css";
import "./dialog-glass.css";
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};
export interface HudState {
  name: string;
  portrait?: string;
  level: number;
  accountLevel: number;
  hp: number;
  maxHp: number;
  chakra: number;
  maxChakra: number;
  xp: number;
  needed: number;
  coins: number;
  fragments: number;
  phase: string;
  lobby: boolean;
  paused: boolean;
  auto: boolean;
}
export function installGameHud(options: {
  host: HTMLElement;
  restore: () => void;
  shop: () => void;
}) {
  const get = (id: string) =>
    (document.getElementById(id) ||
      options.host.querySelector<HTMLElement>("#" + CSS.escape(id)))!;
  const legacy = get("hud-legacy"),
    root = el("div", "game-hud");
  root.dataset.gameHud = "";
  const nav = el("nav", "hud-shortcuts");
  nav.setAttribute("aria-label", t("hud.shortcuts"));
  const portrait = el("button", "hud-portrait");
  portrait.type = "button";
  portrait.id = "hud-hero";
  portrait.setAttribute("aria-label", t("hud.journey"));
  portrait.title = t("hud.journey");
  const image = el("img");
  image.alt = "";
  portrait.append(image);
  const identity = el("div", "hud-identity"),
    name = el("strong", "hud-name"),
    level = el("span", "hud-level");
  const heading = el("div", "hud-hero-heading");
  heading.append(name, level);
  const bars = el("div", "hud-vitals");
  function meter(key: MessageKey, kind: string) {
    const wrap = el("div", "hud-vital " + kind),
      track = el("div", "hud-track"),
      fill = el("i"),
      value = el("span");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", t(key));
    track.append(fill);
    wrap.append(track, value);
    bars.append(wrap);
    return { track, fill, value };
  }
  const hp = meter("qol.hp", "hud-health"),
    chakra = meter("qol.chakra", "hud-chakra");
  const xp = el("div", "hud-experience");
  xp.setAttribute("role", "progressbar");
  xp.setAttribute("aria-label", t("hud.experience"));
  const xpFill = el("i");
  xp.append(xpFill);
  identity.append(heading, bars, xp);
  const hero = el("div", "hud-hero");
  hero.append(portrait, identity);
  const wallet = el("div", "hud-wallet"),
    coinIcon = el("img"),
    coins = el("span"),
    fragments = el("span", "hud-fragments");
  coinIcon.src = "/assets/hud/coins.png";
  coinIcon.alt = "";
  wallet.append(coinIcon, coins, fragments);
  const phase = el("p", "hud-phase"),
    actions = el("div", "hud-combat"),
    feedback = el("div", "hud-feedback");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", t("hud.combat"));
  feedback.id = "hud-feedback";
  const targets = el("div", "hud-targets");
  targets.id = "hud-targets";
  root.append(hero, nav, wallet, phase, feedback, actions, targets);
  options.host.append(root);
  const cloudWarning = el("p", "hud-cloud-warning");
  cloudWarning.hidden = true;
  cloudWarning.setAttribute("role", "status");
  root.append(cloudWarning);
  window.addEventListener("cloud-state", (event) => {
    const state = (event as CustomEvent<string>).detail;
    cloudWarning.hidden = state !== "retry" && state !== "lost";
    cloudWarning.textContent =
      state === "retry"
        ? t("cloud.state.retry")
        : state === "lost"
          ? t("cloud.state.lost")
          : "";
  });
  function dialog(id: string, title: string) {
    const d = el("dialog", "hud-dialog");
    d.id = id;
    const head = el("div", "hud-dialog-heading"),
      h = el("h2", "", title),
      close = el("button", "secondary", t("social.close"));
    h.id = id + "-title";
    d.setAttribute("aria-labelledby", h.id);
    close.type = "button";
    close.onclick = () => d.close();
    head.append(h, close);
    d.append(head);
    document.body.append(d);
    return d;
  }
  const details = dialog("hud-details", t("hud.journey")),
    detailsContent = el("div", "hud-details-content");
  for (const id of ["hero-name", "world-name", "world-help", "status", "party"])
    detailsContent.append(get(id));
  const detailActions = el("div", "hud-detail-actions");
  detailActions.append(get("equipment-menu"), get("upgrade"));
  detailsContent.append(detailActions);
  for (const [id, key] of [
    ["session", "index.107de59cb6"],
    ["journal", "index.f6c66bef1c"],
  ] as const) {
    const section = el("section");
    section.append(el("h3", "", t(key)), get(id));
    detailsContent.append(section);
  }
  details.append(detailsContent);
  const settings = dialog("hud-settings", t("hud.settings")),
    settingsContent = el("div", "hud-settings-content");
  settingsContent.id = "hud-settings-content";
  for (const id of ["sound", "music", "volume"]) {
    const input = get(id);
    settingsContent.append(input.closest("label") ?? input);
  }
  const utilities = el("div", "hud-utilities"),
    preferences = el("button", "secondary", t("qol.accessibility"));
  preferences.type = "button";
  preferences.onclick = () => {
    settings.close();
    document
      .querySelector<HTMLButtonElement>(".accessibility-control")
      ?.click();
  };
  get("mini-window").addEventListener("click", () => settings.close(), {
    capture: true,
  });
  utilities.append(get("mini-window"), preferences, get("back"));
  settingsContent.append(utilities);
  settings.append(settingsContent);
  const language = document.querySelector<HTMLElement>(".language-control"),
    languageHome = language?.parentNode,
    languageNext = language?.nextSibling;
  settings.addEventListener("close", () => {
    if (language && languageHome)
      languageHome.insertBefore(
        language,
        languageNext?.parentNode === languageHome ? languageNext : null,
      );
  });
  const open = (d: HTMLDialogElement) => {
    options.restore();
    document
      .querySelectorAll<HTMLDialogElement>(".hud-dialog[open]")
      .forEach((other) => {
        if (other !== d) other.close();
      });
    if (d === settings && language) settingsContent.prepend(language);
    if (!d.open) d.showModal();
  };
  portrait.onclick = () => open(details);
  const shop = el("button");
  shop.id = "hud-shop";
  shop.onclick = () => {
    options.restore();
    options.shop();
  };
  const settingsButton = el("button");
  settingsButton.id = "hud-options";
  settingsButton.onclick = () => open(settings);
  for (const [id, icon, key] of [
    ["social", "social", "hud.social"],
    ["library", "characters", "hud.characters"],
    ["hud-shop", "shop", "hud.shop"],
    ["progression", "quests", "hud.quests"],
    ["maps", "travel", "hud.travel"],
    ["arena", "arena", "hud.arena"],
    ["hud-options", "settings", "hud.settings"],
  ] as const) {
    const button = (
      id === "hud-shop" ? shop : id === "hud-options" ? settingsButton : get(id)
    ) as HTMLButtonElement;
    button.className = "hud-shortcut";
    button.type = "button";
    button.setAttribute("aria-label", t(key));
    button.dataset.hudLabel = t(key);
    const img = el("img");
    img.src = "/assets/hud/" + icon + ".png";
    img.alt = "";
    img.draggable = false;
    button.replaceChildren(img, el("span", "hud-shortcut-label", t(key)));
    button.addEventListener("click", () => options.restore(), {
      capture: true,
    });
    nav.append(button);
  }
  for (const id of ["auto-hunt", "cast-skill", "pause", "return-lobby"])
    actions.append(get(id));
  const cloudStatus = document.getElementById("cloud-status");
  if (cloudStatus) settingsContent.append(cloudStatus);
  legacy.remove();
  const play = get("play"),
    sync = () => {
      const playing = !play.hidden;
      document.body.classList.toggle("is-playing", playing);
      if (!playing) {
        details.close();
        settings.close();
      }
    };
  new MutationObserver(sync).observe(play, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  sync();
  return {
    update(state: HudState) {
      if (name.textContent !== state.name) name.textContent = state.name;
      level.textContent = t("gear.level", { level: state.level });
      level.title = t("account.level", { level: state.accountLevel });
      if (state.portrait && image.getAttribute("src") !== state.portrait) {
        image.src = state.portrait;
        image.onerror = () => image.removeAttribute("src");
      }
      for (const [meter, now, max] of [
        [hp, state.hp, state.maxHp],
        [chakra, state.chakra, state.maxChakra],
      ] as const) {
        const value = Math.max(0, Math.min(max, now));
        meter.fill.style.width = (max ? (value / max) * 100 : 0) + "%";
        meter.value.textContent = Math.ceil(value) + " / " + max;
        meter.track.setAttribute("aria-valuemin", "0");
        meter.track.setAttribute("aria-valuemax", String(max));
        meter.track.setAttribute("aria-valuenow", String(value));
      }
      xpFill.style.width =
        Math.min(100, Math.max(0, (state.xp / state.needed) * 100)) + "%";
      xp.setAttribute("aria-valuemin", "0");
      xp.setAttribute("aria-valuemax", String(state.needed));
      xp.setAttribute("aria-valuenow", String(state.xp));
      xp.title = t("account.xp", { xp: state.xp, required: state.needed });
      coins.textContent = formatNumber(state.coins);
      wallet.title = t("main.c7d55f788a");
      fragments.textContent = state.fragments
        ? "◆ " + formatNumber(state.fragments)
        : "";
      fragments.title = t("main.023b326283");
      phase.textContent = state.phase;
      phase.dataset.paused = String(state.paused);
      phase.hidden = state.lobby && !state.paused;
      get("pause").hidden = state.lobby;
      actions.hidden = state.lobby;
      get("auto-hunt").setAttribute("aria-pressed", String(state.auto));
      get("pause").setAttribute("aria-pressed", String(state.paused));
      root.dataset.lobby = String(state.lobby);
    },
  };
}
