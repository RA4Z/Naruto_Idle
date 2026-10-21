import { t } from "./i18n/core.ts";
export type Preferences = {
  textSize: number;
  reducedEffects: boolean;
  musicVolume: number;
  ambienceVolume: number;
  voiceVolume: number;
  characterFavorites: string[];
  mapFavorites: string[];
  lastMap: string;
};
const KEY = "folha-idle-preferences";
const defaults: Preferences = {
  textSize: 100,
  reducedEffects: false,
  musicVolume: 1,
  ambienceVolume: 1,
  voiceVolume: 1,
  characterFavorites: [],
  mapFavorites: [],
  lastMap: "",
};
let preferences = { ...defaults };
if (typeof window !== "undefined") {
  preferences.reducedEffects =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") {
      for (const key of [
        "musicVolume",
        "ambienceVolume",
        "voiceVolume",
      ] as const)
        if (Number.isFinite(raw[key]))
          preferences[key] = Math.max(0, Math.min(1, raw[key]));
      if (Number.isFinite(raw.textSize))
        preferences.textSize = Math.max(85, Math.min(150, raw.textSize));
      if (typeof raw.reducedEffects === "boolean")
        preferences.reducedEffects = raw.reducedEffects;
      for (const key of ["characterFavorites", "mapFavorites"] as const)
        if (Array.isArray(raw[key]))
          preferences[key] = raw[key]
            .filter((v: unknown) => typeof v === "string")
            .slice(0, 2000);
      if (typeof raw.lastMap === "string") preferences.lastMap = raw.lastMap;
    }
  } catch {
    /* Defaults remain usable without browser storage. */
  }
}
export const getPreferences = () => preferences;
export function updatePreferences(patch: Partial<Preferences>) {
  preferences = { ...preferences, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* Session only. */
  }
  applyPreferences();
  window.dispatchEvent(new Event("preferences-change"));
}
export function toggleFavorite(
  key: "characterFavorites" | "mapFavorites",
  id: string,
) {
  const values = preferences[key];
  updatePreferences({
    [key]: values.includes(id)
      ? values.filter((v) => v !== id)
      : [...values, id],
  });
}
function applyPreferences() {
  const pip = (
    window as Window & { documentPictureInPicture?: { window?: Window } }
  ).documentPictureInPicture?.window;
  for (const doc of [document, pip?.document])
    if (doc) {
      doc.documentElement.style.fontSize = `${preferences.textSize}%`;
      doc.documentElement.classList.toggle(
        "reduced-effects",
        preferences.reducedEffects,
      );
    }
}
export function installPreferences() {
  applyPreferences();
  const button = document.createElement("button");
  button.className = "accessibility-control secondary";
  button.textContent = t("qol.accessibility");
  const dialog = document.createElement("dialog");
  dialog.className = "preferences-panel";
  const title = document.createElement("h2");
  title.textContent = t("qol.accessibility");
  dialog.append(title);
  for (const [key, message, min, max, step] of [
    ["textSize", "qol.textSize", 85, 150, 5],
    ["musicVolume", "qol.musicVolume", 0, 1, 0.05],
    ["ambienceVolume", "qol.ambienceVolume", 0, 1, 0.05],
    ["voiceVolume", "qol.voiceVolume", 0, 1, 0.05],
  ] as const) {
    const label = document.createElement("label");
    label.textContent = t(message);
    const input = document.createElement("input");
    input.type = "range";
    input.dataset.preference = key;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(preferences[key]);
    const output = document.createElement("output");
    const refresh = () => {
      output.textContent = `${Math.round(key === "textSize" ? Number(input.value) : Number(input.value) * 100)}%`;
    };
    refresh();
    input.oninput = () => {
      updatePreferences({ [key]: Number(input.value) });
      refresh();
    };
    label.append(input, output);
    dialog.append(label);
  }
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = preferences.reducedEffects;
  checkbox.dataset.preference = "reducedEffects";
  checkbox.onchange = () =>
    updatePreferences({ reducedEffects: checkbox.checked });
  label.append(checkbox, t("qol.reducedEffects"));
  dialog.append(label);
  const close = document.createElement("button");
  close.textContent = t("progression.ui.0f2bd88ef0");
  close.onclick = () => dialog.close();
  dialog.append(close);
  document.body.append(button, dialog);
  button.onclick = () => dialog.showModal();
}
