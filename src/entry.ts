import "./style.css";
import { loadingScreen } from "./loading-screen";
async function boot() {
  if (/^\/admin(?:\/|$)/.test(location.pathname)) await import("./admin/main");
  else if (/^\/arena(?:\/|$)/.test(location.pathname))
    await import("./arena/page");
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
        transferred = acceptLocalhostTransfer(
          address,
          new LocalProgressStore(),
          (previous) => localStorage.setItem(LOCAL_TRANSFER_BACKUP, previous),
        );
      } catch (error) {
        transferError = (error as Error).message;
      }
    }
    const { installMenu } = await import("./menu");
    installMenu();
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
    if (transferred) document.getElementById("continue")?.click();
  }
}
const initial = loadingScreen.begin("Preparando sua jornada");
void boot()
  .then(() => {
    if (/^\/(admin|arena)(?:\/|$)/.test(location.pathname))
      loadingScreen.hide();
  })
  .catch(() => {
    initial.fail(
      new Error(
        "Não foi possível carregar o jogo. Verifique sua conexão e tente novamente.",
      ),
    );
    const status = document.getElementById("menu-loading");
    if (status)
      status.textContent =
        "Não foi possível carregar o jogo. Recarregue a página.";
  });
