import type { Save } from "../model";
import { th } from "../i18n/core";
import { accountNeeded, ensureAccountProgress } from "./account-progress";

export function renderAccountProgress(root: HTMLElement, save: Save) {
  ensureAccountProgress(save);
  const key = `${save.accountLevel}:${save.accountXp}`;
  if (root.dataset.accountProgress === key) return;
  root.dataset.accountProgress = key;
  const required = accountNeeded(save.accountLevel!);
  root.innerHTML = `<p><strong>${th("account.level", { level: save.accountLevel! })}</strong><span>${th("account.xp", { xp: save.accountXp!, required })}</span></p><div class="meter xp" role="progressbar" aria-label="${th("account.progress")}" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${save.accountXp!}"><i style="width:${(save.accountXp! / required) * 100}%"></i></div>`;
}
