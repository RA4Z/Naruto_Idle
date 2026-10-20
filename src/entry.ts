import "./style.css";
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
    await import("./main");
    for (const id of ["new", "continue"]) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = false;
    }
    document.getElementById("menu-loading")?.setAttribute("hidden", "");
    if (transferError) {
      const status = document.getElementById("menu-loading")!;
      status.textContent = transferError;
      status.hidden = false;
    }
    if (transferred) document.getElementById("continue")?.click();
  }
}
void boot().catch(() => {
  const status = document.getElementById("menu-loading");
  if (status)
    status.textContent =
      "Não foi possível carregar o jogo. Recarregue a página.";
});
