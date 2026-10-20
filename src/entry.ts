import "./style.css";
async function boot() {
  if (/^\/admin(?:\/|$)/.test(location.pathname)) await import("./admin/main");
  else if (/^\/arena(?:\/|$)/.test(location.pathname)) await import("./arena/page");
  else {
    await import("./main");
    for (const id of ["new", "continue"]) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = false;
    }
    document.getElementById("menu-loading")?.setAttribute("hidden", "");
  }
}
void boot().catch(() => {
  const status = document.getElementById("menu-loading");
  if (status) status.textContent = "Não foi possível carregar o jogo. Recarregue a página.";
});
