import { t, th } from "../i18n/core";
import { cloudClient } from "./client";
import {
  cloudJourneyActive,
  cloudSync,
  downloadLocalBackup,
  localSnapshot,
} from "./journey";
import { fresh, type Save } from "../model";

export function cloudError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  if (/SESSION_BUSY/.test(message)) return t("cloud.busy");
  if (/SESSION_LOST|REVISION_CONFLICT|REQUEST_MISMATCH/.test(message))
    return t("cloud.lost");
  if (/SAVE_MISSING/.test(message)) return t("cloud.missing");
  if (/INVALID_SAVE/.test(message)) return t("cloud.invalid");
  if (/Invalid login credentials/.test(message)) return t("cloud.credentials");
  if (/Email not confirmed/.test(message)) return t("cloud.confirm");
  return t("cloud.failure");
}
export function installCloudAccount(launch: (initial?: Save) => Promise<void>) {
  const button = document.createElement("button");
  button.id = "cloud-account";
  button.className = "secondary";
  button.setAttribute("aria-haspopup", "dialog");
  button.textContent = t("cloud.account");
  document.querySelector("#menu .actions")?.append(button);
  const indicator = document.createElement("span");
  indicator.id = "cloud-status";
  indicator.setAttribute("role", "status");
  document.querySelector("#play aside")?.prepend(indicator);
  window.addEventListener("cloud-state", () => {
    indicator.textContent =
      cloudJourneyActive() || cloudSync.active
        ? t(`cloud.state.${cloudSync.state}`)
        : "";
  });
  const dialog = document.createElement("dialog");
  dialog.className = "cloud-panel";
  dialog.setAttribute("aria-label", t("cloud.account"));
  document.body.append(dialog);
  let busy = false;
  let recovery = false;
  let accountEmail = "";
  let hasCloud = false;
  async function refresh() {
    if (cloudClient) {
      const {
        data: { session },
      } = await cloudClient.auth.getSession();
      accountEmail = session?.user.email || "";
      if (session) {
        const { data, error } = await cloudClient
          .from("game_saves")
          .select("revision,updated_at")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        hasCloud = !!data;
      } else hasCloud = false;
    }
    render();
  }
  function render() {
    dialog.innerHTML = `<div class="dialog-heading"><h2>${th("cloud.account")}</h2><button type="button" data-close>${th("cloud.close")}</button></div>
      <p>${th("cloud.description")}</p>
      ${
        !cloudClient
          ? `<p>${th("cloud.unavailable")}</p>`
          : cloudJourneyActive() || !document.getElementById("play")?.hidden
            ? `<p>${th("cloud.returnMenu")}</p>`
            : accountEmail && !recovery
              ? `<p data-account-email></p><p>${th(hasCloud ? "cloud.hasSave" : "cloud.noSave")}</p>
          <div class="actions">${hasCloud ? `<button data-action="continue">${th("cloud.continue")}</button>` : `<button data-action="import">${th("cloud.import")}</button><button data-action="fresh">${th("cloud.fresh")}</button>`}
          <button data-action="logout" class="secondary">${th("cloud.logout")}</button></div>`
              : `<form>${recovery ? "" : `<label>${th("cloud.email")}<input name="email" type="email" required autocomplete="email" maxlength="254"></label>`}
          <label>${th("cloud.password")}<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password"></label>
          <div class="actions"><button type="submit">${th(recovery ? "cloud.updatePassword" : "cloud.login")}</button>
          ${recovery ? "" : `<button type="button" data-action="signup">${th("cloud.signup")}</button><button type="button" data-action="reset" class="secondary">${th("cloud.reset")}</button>`}</div></form>`
      }
      <div class="actions"><button data-action="backup" class="secondary">${th("cloud.backup")}</button></div>
      <p data-feedback role="status" aria-live="polite"></p>`;
    dialog
      .querySelector("[data-account-email]")
      ?.append(document.createTextNode(accountEmail));
    dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick = () =>
      dialog.close();
    dialog.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void action(recovery ? "password" : "login");
    });
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-action]")
      .forEach(
        (item) => (item.onclick = () => void action(item.dataset.action!)),
      );
  }
  async function action(name: string) {
    if (busy) return;
    busy = true;
    const feedback = dialog.querySelector<HTMLElement>("[data-feedback]")!;
    dialog
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = true));
    feedback.textContent = t("cloud.processing");
    try {
      if (name === "backup") {
        downloadLocalBackup();
        feedback.textContent = t("cloud.backupDone");
        return;
      }
      if (!cloudClient) throw new Error("CLOUD_UNAVAILABLE");
      const form = dialog.querySelector("form");
      const email =
        form?.querySelector<HTMLInputElement>("[name=email]")?.value.trim() ||
        "";
      const password =
        form?.querySelector<HTMLInputElement>("[name=password]")?.value || "";
      if (
        ["login", "signup", "password"].includes(name) &&
        !form?.reportValidity()
      ) {
        feedback.textContent = "";
        return;
      }
      if (name === "login") {
        const { error } = await cloudClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await refresh();
      } else if (name === "signup") {
        const { data, error } = await cloudClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
        if (error) throw error;
        if (data.session) await refresh();
        else feedback.textContent = t("cloud.confirm");
      } else if (name === "reset") {
        if (
          !email ||
          !form
            ?.querySelector<HTMLInputElement>("[name=email]")
            ?.reportValidity()
        )
          return;
        const { error } = await cloudClient.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
        if (error) throw error;
        feedback.textContent = t("cloud.resetSent");
      } else if (name === "password") {
        const { error } = await cloudClient.auth.updateUser({ password });
        if (error) throw error;
        recovery = false;
        await refresh();
      } else if (name === "logout") {
        if (cloudJourneyActive()) throw new Error("SESSION_BUSY");
        const { error } = await cloudClient.auth.signOut({ scope: "local" });
        if (error) throw error;
        await refresh();
      } else if (["continue", "import", "fresh"].includes(name)) {
        let initial: Save | undefined;
        if (name === "import") {
          initial = localSnapshot();
          if (!initial) throw new Error("SAVE_MISSING");
          if (!confirm(t("cloud.importConfirm"))) {
            feedback.textContent = "";
            return;
          }
        }
        if (name === "fresh") initial = fresh("naruto");
        dialog.close();
        try {
          await launch(initial);
        } catch (error) {
          dialog.showModal();
          throw error;
        }
      }
    } catch (error) {
      const current = dialog.querySelector<HTMLElement>("[data-feedback]");
      if (current) current.textContent = cloudError(error);
    } finally {
      busy = false;
      dialog
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((b) => (b.disabled = false));
    }
  }
  button.onclick = () => {
    if (busy) return;
    render();
    dialog.showModal();
    void refresh().catch((error) => {
      dialog.querySelector<HTMLElement>("[data-feedback]")!.textContent =
        cloudError(error);
    });
  };
  cloudClient?.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true;
      accountEmail = "";
      render();
      if (!dialog.open) dialog.showModal();
    }
  });
}
