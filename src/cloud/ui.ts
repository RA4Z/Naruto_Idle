import { t, th } from "../i18n/core";
import { cloudClient } from "./client";
import { normalizeUsername } from "./profile";
import { cloudJourneyActive, cloudSync } from "./journey";
import type { Save } from "../model";

export function cloudError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  if (/USERNAME_TAKEN|duplicate key.*username/.test(message)) return t("auth.usernameTaken");
  if (/USERNAME_INVALID/.test(message)) return t("auth.usernameHelp");
  if (/PASSWORD_MISMATCH/.test(message)) return t("auth.passwordMismatch");
  if (/PROFILE_REQUIRED/.test(message)) return t("auth.completeProfile");
  if (/AUTH_REQUIRED/.test(message)) return t("auth.required");
  if (/CLOUD_UNAVAILABLE/.test(message)) return t("cloud.unavailable");
  if (/SESSION_BUSY/.test(message)) return t("cloud.busy");
  if (/SESSION_LOST|REVISION_CONFLICT|REQUEST_MISMATCH/.test(message)) return t("cloud.lost");
  if (/SAVE_MISSING/.test(message)) return t("cloud.missing");
  if (/INVALID_SAVE/.test(message)) return t("cloud.invalid");
  if (/Invalid login credentials/.test(message)) return t("cloud.credentials");
  if (/Email not confirmed/.test(message)) return t("cloud.confirm");
  if (/email_address_not_authorized|Email address not authorized|Error sending confirmation|Error sending recovery/.test(message)) return t("auth.emailUnavailable");
  if (/rate.limit|too many|over_email_send_rate_limit/i.test(message)) return t("auth.rateLimit");
  if (/already registered|user_already_exists/i.test(message)) return t("auth.alreadyRegistered");
  return t("cloud.failure");
}

/** The landing page is the account gate; no guest journey is exposed. */
export async function installCloudAccount(launch: (initial?: Save) => Promise<void>, prepare: () => void = () => {}) {
  const root = document.createElement("section");
  root.id = "account-access";
  root.className = "account-card";
  root.setAttribute("aria-label", t("cloud.account"));
  document.getElementById("menu")!.append(root);
  const oldActions = document.querySelector<HTMLElement>("#menu > .actions");
  if (oldActions) oldActions.hidden = true;
  let mode: "login" | "signup" | "reset" | "password" = "login";
  let busy = false, revision = 0;
  let user: { id: string; email?: string } | null = null;
  let username = "", hasSave = false;
  const indicator = document.createElement("span");
  indicator.id = "cloud-status";
  indicator.setAttribute("role", "status");
  document.querySelector("#play aside")?.prepend(indicator);
  window.addEventListener("cloud-state", () => {
    indicator.textContent = cloudJourneyActive() || cloudSync.active ? t(`cloud.state.${cloudSync.state}`) : "";
  });
  const field = (name: string, label: string, type: string, extra = "") =>
    `<label for="auth-${name}">${label}</label><input id="auth-${name}" name="${name}" type="${type}" required ${extra}>`;
  function render() {
    const completing = !!user && !username && mode !== "password";
    root.innerHTML = `<p class="eyebrow">${th("auth.cardEyebrow")}</p>
      <h2>${th(mode === "password" ? "cloud.updatePassword" : completing ? "auth.completeProfile" : user ? "auth.welcome" : mode === "signup" ? "auth.createTitle" : mode === "reset" ? "cloud.reset" : "auth.loginTitle")}</h2>
      <p class="account-caption">${th(user ? "auth.accountSaved" : "auth.required")}</p>
      ${!cloudClient ? `<p role="alert">${th("cloud.unavailable")}</p>` :
        user && username && mode !== "password" ? `<p class="account-identity"><strong data-username></strong><span data-email></span></p>
          <div class="account-actions">${hasSave ? `<button data-action="play">${th("cloud.continue")}</button>` : `<button data-action="choose">${th("auth.choose")}</button>`}
          <button class="text-button" data-action="logout">${th("cloud.logout")}</button></div>` :
        `<form id="account-${completing ? "profile" : mode}" autocomplete="on">
          ${completing || mode === "password" ? "" : field("email", th("cloud.email"), "email", `autocomplete="${mode === "reset" ? "email" : "username"}" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254"`)}
          ${completing || mode === "signup" ? field("nickname", th("auth.username"), "text", 'autocomplete="off" data-lpignore="true" data-1p-ignore="true" minlength="3" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{2,19}" aria-describedby="username-help"') + `<small id="username-help">${th("auth.usernameHelp")}</small>` : ""}
          ${completing || mode === "reset" ? "" : field("password", th(mode === "login" ? "auth.password" : "cloud.password"), "password", `autocomplete="${mode === "login" ? "current-password" : "new-password"}" ${mode === "login" ? "" : 'minlength="8" maxlength="128"'}`)}
          ${mode === "signup" || mode === "password" ? field("confirm", th("auth.confirmPassword"), "password", 'autocomplete="new-password" minlength="8" maxlength="128"') : ""}
          <button type="submit">${th(completing ? "auth.saveUsername" : mode === "signup" ? "cloud.signup" : mode === "reset" ? "auth.sendReset" : mode === "password" ? "cloud.updatePassword" : "cloud.login")}</button>
        </form>
        ${user ? `<button class="text-button" data-action="logout">${th("cloud.logout")}</button>` : `<div class="account-links"><button class="text-button" data-mode="${mode === "login" ? "signup" : "login"}">${th(mode === "login" ? "auth.goSignup" : "auth.goLogin")}</button>${mode === "login" ? `<button class="text-button" data-mode="reset">${th("cloud.reset")}</button>` : ""}</div>`}`}
      <p data-feedback role="status" aria-live="polite"></p>`;
    if (username) root.querySelector("[data-username]")?.append(document.createTextNode(username));
    if (user?.email) root.querySelector("[data-email]")?.append(document.createTextNode(user.email));
    root.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void action(completing ? "profile" : mode);
    });
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.onclick = () => {
      if (busy) return;
      mode = b.dataset.mode as typeof mode;
      render();
      root.querySelector<HTMLInputElement>("input")?.focus();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => b.onclick = () => void action(b.dataset.action!));
  }
  function feedback(text: string) {
    const node = root.querySelector<HTMLElement>("[data-feedback]");
    if (node) node.textContent = text;
  }
  async function refresh() {
    const request = ++revision;
    if (!cloudClient) { render(); return; }
    const { data, error } = await cloudClient.auth.getSession();
    if (error) throw error;
    let profileName = "", saveExists = false;
    if (data.session) {
      const id = data.session.user.id;
      const [profile, save] = await Promise.all([
        cloudClient.from("player_profiles").select("username").eq("user_id", id).maybeSingle(),
        cloudClient.from("game_saves").select("revision").eq("user_id", id).maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      profileName = profile.data?.username || "";
      if (save.error) throw save.error;
      saveExists = !!save.data;
    }
    if (request !== revision || mode === "password") return;
    const nextUser = data.session?.user || null;
    const changed = user?.id !== nextUser?.id || user?.email !== nextUser?.email || username !== profileName || hasSave !== saveExists;
    user = nextUser;
    username = profileName;
    hasSave = saveExists;
    // Do not erase a typed login while the initial anonymous lookup finishes.
    if (changed || user) {
      document.getElementById("choices")!.hidden = true;
      render();
    }
    if (user && username) prepare();
  }
  async function action(name: string) {
    if (busy || !cloudClient) return;
    const form = root.querySelector("form");
    if (["login", "signup", "reset", "password", "profile"].includes(name) && !form?.reportValidity()) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.disabled = true);
    feedback(t("cloud.processing"));
    const value = (key: string) => form?.querySelector<HTMLInputElement>(`[name=${key}]`)?.value || "";
    try {
      const email = value("email").trim(), password = value("password");
      if (["signup", "password"].includes(name) && password !== value("confirm")) throw new Error("PASSWORD_MISMATCH");
      if (name === "login") {
        const reply = await cloudClient.auth.signInWithPassword({ email, password });
        if (reply.error) throw reply.error;
        await refresh();
      } else if (name === "signup" || name === "profile") {
        const candidate = normalizeUsername(value("nickname"));
        if (name === "profile") {
          const result = await cloudClient.rpc("game_set_username", { p_username: candidate });
          if (result.error) throw result.error;
          await refresh();
        } else {
          const available = await cloudClient.rpc("game_username_available", { p_username: candidate });
          if (available.error) throw available.error;
          if (!available.data) throw new Error("USERNAME_TAKEN");
          const result = await cloudClient.auth.signUp({ email, password,
            options: { emailRedirectTo: location.origin, data: { username: candidate } } });
          if (result.error) {
            const check = await cloudClient.rpc("game_username_available", { p_username: candidate });
            if (check.data === false) throw new Error("USERNAME_TAKEN");
            throw result.error;
          }
          if (result.data.session) await refresh();
          else { mode = "login"; render(); feedback(t("auth.confirmSent")); }
        }
      } else if (name === "reset") {
        const result = await cloudClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (result.error) throw result.error;
        feedback(t("cloud.resetSent"));
      } else if (name === "password") {
        const result = await cloudClient.auth.updateUser({ password });
        if (result.error) throw result.error;
        mode = "login";
        await refresh();
        feedback(t("auth.passwordUpdated"));
      } else if (name === "logout") {
        if (cloudJourneyActive()) throw new Error("SESSION_BUSY");
        const result = await cloudClient.auth.signOut({ scope: "local" });
        if (result.error) throw result.error;
        mode = "login";
        await refresh();
      } else if (name === "choose") {
        document.getElementById("new")?.click();
        feedback("");
      } else if (name === "play") {
        await launch();
        await refresh();
      }
    } catch (error) { feedback(cloudError(error)); }
    finally {
      busy = false;
      root.removeAttribute("aria-busy");
      root.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.disabled = false);
    }
  }
  window.addEventListener("account-access-required", () => {
    root.scrollIntoView({ block: "nearest" });
    void refresh().catch((error) => feedback(cloudError(error)));
  });
  window.addEventListener("account-menu", () => {
    void refresh().catch((error) => feedback(cloudError(error)));
  });
  cloudClient?.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") { mode = "password"; render(); }
    else if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
      setTimeout(() => { if (!busy) void refresh().catch((e) => feedback(cloudError(e))); }, 0);
    }
  });
  render();
  // Account restoration may involve an expired token or an unavailable server.
  // Keep the login form interactive while it completes; gameplay still requires
  // the authoritative account check and cloud lease in openCloudJourney().
  void refresh().catch((error) => feedback(cloudError(error)));
}
