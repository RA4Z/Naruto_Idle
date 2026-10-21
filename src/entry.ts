import { t } from "./i18n/core.ts";
import "./style.css";
import { installLanguageControl, consumeLanguageResume } from "./i18n/browser";
import { loadingScreen } from "./loading-screen";
import { installPreferences } from "./preferences";
import { clearLegacyProgress } from "./cloud/runtime-progress";
async function boot() {
  try { clearLegacyProgress(localStorage); } catch { /* No local save is needed when storage is unavailable. */ }
  if (/^\/admin(?:\/|$)/.test(location.pathname)) await import("./admin/main");
  else if (/^\/arena(?:\/|$)/.test(location.pathname)) {
    const { requireAccount } = await import("./cloud/profile");
    try { await requireAccount(); }
    catch { location.replace("/"); return; }
    await import("./arena/page");
  }
  else {
    if (
      new URLSearchParams(location.hash.slice(1)).has("folha-local-transfer")
    ) {
      // Obsolete save-transfer links are discarded, never imported.
      history.replaceState(null, "", location.pathname + location.search);
    }
    const { installMenu, continueCloud } = await import("./menu");
    await installMenu();
    for (const id of ["new", "continue"]) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = false;
    }
    document.getElementById("menu-loading")?.setAttribute("hidden", "");
    loadingScreen.hide();
    if (sessionStorage.getItem("folha-idle-cloud-resume")) {
      sessionStorage.removeItem("folha-idle-cloud-resume");
      consumeLanguageResume();
      await continueCloud().catch(() =>
        window.dispatchEvent(new Event("account-access-required")),
      );
    } else {
      consumeLanguageResume();
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
