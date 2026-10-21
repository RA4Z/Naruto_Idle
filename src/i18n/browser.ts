import {
  t,
  getLocale,
  setLocale,
  LOCALES,
  type Locale,
  type MessageKey,
} from "./core";
const RESUME_KEY = "folha-idle-resume-language";
export function consumeLanguageResume() {
  try {
    const resume = sessionStorage.getItem(RESUME_KEY) === "1";
    sessionStorage.removeItem(RESUME_KEY);
    return resume;
  } catch {
    return false;
  }
}
export function installLanguageControl() {
  document.documentElement.lang = getLocale();
  const initialMessage = document.getElementById("loading-message");
  if (initialMessage) initialMessage.textContent = t("common.loading");
  const menuMessage = document.getElementById("menu-loading");
  if (menuMessage) menuMessage.textContent = t("common.loadingGame");
  for (const node of Array.from(
    document.querySelectorAll<HTMLElement>("[data-i18n]"),
  ))
    node.textContent = t(node.dataset.i18n as MessageKey);
  for (const attribute of ["title", "alt", "placeholder", "aria-label"]) {
    for (const node of Array.from(
      document.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`),
    )) {
      node.setAttribute(
        attribute,
        t(node.getAttribute(`data-i18n-${attribute}`) as MessageKey),
      );
    }
  }
  const label = document.createElement("label");
  label.className = "language-control";
  label.append(document.createTextNode(t("common.language") + " "));
  const select = document.createElement("select");
  select.setAttribute("aria-label", t("common.language"));
  select.dataset.language = "";
  for (const [value, name] of Object.entries(LOCALES)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    select.append(option);
  }
  select.value = getLocale();
  select.onchange = async () => {
    // Commit the live game (including PiP) before reloading translated modules.
    const tasks: Promise<void>[] = [];
    window.dispatchEvent(
      new CustomEvent("before-language-change", { detail: { tasks } }),
    );
    select.disabled = true;
    try {
      await Promise.all(tasks);
    } catch {
      select.disabled = false;
      select.value = getLocale();
      alert(t("cloud.failure"));
      return;
    }
    try {
      const play = document.getElementById("play");
      if (play && !play.hidden && play.querySelector("canvas"))
        sessionStorage.setItem(RESUME_KEY, "1");
    } catch {
      /* Reload still works if session storage is unavailable. */
    }
    setLocale(select.value as Locale);
    location.reload();
  };
  label.append(select);
  document.body.append(label);
}
