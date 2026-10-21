import { t, errorText } from "./i18n/core.ts";
import "./style.css";
import { installLanguageControl, consumeLanguageResume } from "./i18n/browser";
import { loadingScreen } from "./loading-screen";
import { acquireJourney, releaseJourney } from "./journey-lock";
import { installPreferences } from "./preferences";
async function boot() {
  if (/^\/admin(?:\/|$)/.test(location.pathname)) await import("./admin/main");
  else if (/^\/arena(?:\/|$)/.test(location.pathname)) {
    const { requireAccount } = await import("./cloud/profile");
    try { await requireAccount(); }
    catch { location.replace("/"); return; }
    await import("./arena/page");
  }
  else {
    let transferred = false;
    let transferError = "";
    if (
      new URLSearchParams(location.hash.slice(1)).has("folha-local-transfer")
    ) {
      const address = location.href;
      // Do not leave a copy of the save in the address bar/history after consuming it.
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const { acceptLocalhostTransfer, LOCAL_TRANSFER_BACKUP } = await import(
          "./progression/local-transfer"
        );
        const { LocalProgressStore } = await import("./model");
        await acquireJourney();
        transferred = acceptLocalhostTransfer(
          address,
          new LocalProgressStore(),
          (previous) => localStorage.setItem(LOCAL_TRANSFER_BACKUP, previous),
        );
        if (!transferred) releaseJourney();
      } catch (error) {
        releaseJourney();
        transferError = errorText(error);
      }
    }
    const { installMenu, continueCloud } = await import("./menu");
    await installMenu();
    for (const id of ["new", "continue"]) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = false;
    }
    document.getElementById("menu-loading")?.setAttribute("hidden", "");
    loadingScreen.hide();
    if (transferError) {
      const status = document.getElementById("menu-loading")!;
      status.textContent = transferError;
      status.hidden = false;
    }
    if (sessionStorage.getItem("folha-idle-cloud-resume")) {
      sessionStorage.removeItem("folha-idle-cloud-resume");
      consumeLanguageResume();
      await continueCloud().catch(() =>
        window.dispatchEvent(new Event("account-access-required")),
      );
    } else {
      consumeLanguageResume();
      // Legacy transfers remain available for explicit account import. They must
      // not start guest gameplay or hold the local journey lease on the login page.
      if (transferred) releaseJourney();
    }
  }
}
installLanguageControl();
installPreferences();
const initial = loadingScreen.begin(t("entry.ddc49b1c5f"));
void boot()
  .then(() => {
    if (import.meta.env.DEV && import.meta.env.ADMIN_CONSOLE)
      void import("./admin/debug-console").then((module) =>
        module.installDebugConsole(),
      );
    if (/^\/(admin|arena)(?:\/|$)/.test(location.pathname))
      loadingScreen.hide();
  })
  .catch(() => {
    initial.fail(new Error(t("entry.83eda3ec00")));
    const status = document.getElementById("menu-loading");
    if (status) status.textContent = t("entry.f8b4ab8a93");
  });
