type PictureInPictureHost = Window & {
  documentPictureInPicture?: {
    requestWindow(options: { width: number; height: number }): Promise<Window>;
  };
};
type MiniWindowOptions = {
  button: HTMLButtonElement;
  canvas: HTMLElement;
  summary: () => string;
  onViewport: (host: Window) => () => void;
  notify: (text: string) => void;
  openOnLocalhost: () => void;
};

// Move the existing canvas, keeping one game instance and one save writer.
export function installMiniWindow(options: MiniWindowOptions) {
  const { button, canvas } = options;
  const help = document.createElement("dialog");
  help.className = "mini-help";
  help.setAttribute("aria-labelledby", "mini-help-title");
  help.innerHTML = `<h2 id="mini-help-title">Janela sobre outras abas</h2><p data-mini-reason></p><div data-localhost-help><p>Se o servidor está neste computador, abra por localhost para habilitar a janela flutuante. Seu progresso acompanha a mudança de endereço. Depois, continue usando localhost neste computador.</p><button data-mini-localhost>Abrir em localhost com meu progresso</button></div><p class="caption">A minijanela interna fica somente nesta aba e não acompanha outras abas.</p><div class="mini-help-actions"><button class="secondary" data-mini-internal>Usar somente nesta aba</button><button class="secondary" data-mini-cancel>Cancelar</button></div>`;
  document.body.append(help);
  help.querySelector<HTMLButtonElement>("[data-mini-localhost]")!.onclick =
    () => {
      options.openOnLocalhost();
    };
  help.querySelector<HTMLButtonElement>("[data-mini-internal]")!.onclick =
    () => {
      help.close();
      void open(true);
    };
  help.querySelector<HTMLButtonElement>("[data-mini-cancel]")!.onclick = () =>
    help.close();
  function explain(reason: string) {
    help.querySelector("[data-mini-reason]")!.textContent = reason;
    help.querySelector<HTMLElement>("[data-localhost-help]")!.hidden =
      window.isSecureContext;
    if (!help.open) help.showModal();
  }
  const panel = document.createElement("section");
  panel.className = "mini-window";
  panel.setAttribute("aria-label", "Minijanela do jogo");
  panel.hidden = true;
  panel.innerHTML = `<div class="mini-window-bar"><button class="mini-drag" aria-label="Arrastar minijanela" title="Arraste para mover; use as setas quando estiver focado">Caminho da Folha</button><button class="secondary" data-mini-return>Restaurar</button></div><div class="mini-viewport"></div><p class="mini-summary"></p><div class="mini-actions"></div><p class="mini-note"></p>`;
  document.body.append(panel);
  const viewport = panel.querySelector<HTMLElement>(".mini-viewport")!;
  const summary = panel.querySelector<HTMLElement>(".mini-summary")!;
  const placeholder = document.createElement("section");
  placeholder.className = "mini-placeholder";
  placeholder.innerHTML =
    "<p>O jogo está na minijanela.</p><button>Voltar à tela normal</button>";
  let host: Window | undefined;
  let stopViewport: (() => void) | undefined;
  let opening = false;
  let version = 0;
  const proxies = new Map<HTMLButtonElement, HTMLButtonElement>();
  for (const id of ["auto-hunt", "pause", "cast-skill"]) {
    const source = document.getElementById(id) as HTMLButtonElement;
    const proxy = document.createElement("button");
    proxy.className = "secondary";
    proxy.dataset.miniAction = id;
    proxy.onclick = () => {
      source.click();
      sync();
    };
    proxies.set(source, proxy);
    panel.querySelector(".mini-actions")!.append(proxy);
  }
  function sync() {
    if (!host) return;
    summary.textContent = options.summary();
    for (const [source, proxy] of proxies) {
      proxy.textContent = source.textContent;
      proxy.disabled = source.disabled;
      proxy.hidden = source.hidden;
    }
  }
  function restore() {
    if (help.open) help.close();
    version++;
    const previousHost = host;
    host = undefined;
    stopViewport?.();
    stopViewport = undefined;
    if (placeholder.isConnected) placeholder.replaceWith(canvas);
    document.body.append(panel);
    panel.hidden = true;
    panel.classList.remove("mini-external");
    button.textContent = "Abrir janela flutuante";
    button.setAttribute("aria-pressed", "false");
    if (previousHost && previousHost !== window && !previousHost.closed)
      previousHost.close();
    // Recalculate after the canvas has returned to its normal grid cell.
    window.dispatchEvent(new Event("resize"));
  }
  placeholder.querySelector("button")!.onclick = restore;
  panel.querySelector<HTMLButtonElement>("[data-mini-return]")!.onclick =
    restore;
  function copyStyles(target: Document) {
    const base = target.createElement("base");
    base.href = document.baseURI;
    target.head.append(base);
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = target.createElement("style");
        style.textContent = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
        target.head.append(style);
      } catch {
        if (sheet.href) {
          const link = target.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          target.head.append(link);
        }
      }
    }
  }
  async function open(internal = false) {
    if (opening) return;
    if (host) {
      restore();
      return;
    }
    if (!canvas.querySelector("canvas")) return;
    opening = true;
    button.disabled = true;
    const request = ++version;
    let destination: Window = window;
    try {
      const api = (window as PictureInPictureHost).documentPictureInPicture;
      if (!internal && (!window.isSecureContext || !api)) {
        explain(
          !window.isSecureContext
            ? "O endereço HTTP por IP não permite a janela flutuante do navegador. Por isso ela desaparece quando você muda de aba."
            : "A janela flutuante não está disponível neste navegador. A opção abaixo funciona somente nesta aba.",
        );
        return;
      }
      if (!internal && api) {
        try {
          destination = await api.requestWindow({ width: 520, height: 420 });
        } catch {
          explain(
            "O navegador não permitiu abrir a janela flutuante. Tente novamente pelo botão ou escolha a minijanela interna.",
          );
          return;
        }
      }
      if (request !== version) {
        if (destination !== window) destination.close();
        return;
      }
      if (destination !== window) {
        copyStyles(destination.document);
        destination.document.title = "Caminho da Folha · Minijanela";
        destination.document.body.append(panel);
        destination.addEventListener("pagehide", restore, { once: true });
      }
      host = destination;
      panel.classList.toggle("mini-external", host !== window);
      panel.querySelector(".mini-note")!.textContent =
        host === window
          ? "Somente nesta aba — não acompanha outras abas. Arraste pelo título para mover."
          : "Arraste a janela pela barra do navegador. Fechar devolve o jogo à página.";
      canvas.replaceWith(placeholder);
      viewport.append(canvas);
      panel.hidden = false;
      button.textContent = "Voltar à tela normal";
      button.setAttribute("aria-pressed", "true");
      stopViewport = options.onViewport(host);
      sync();
      canvas.querySelector("canvas")?.focus({ preventScroll: true });
      if (host === window) clampPosition();
    } catch (error) {
      restore();
      if (destination !== window && !destination.closed) destination.close();
      options.notify(
        `Não foi possível abrir a minijanela: ${(error as Error).message}`,
      );
    } finally {
      opening = false;
      button.disabled = false;
    }
  }
  function place(left: number, top: number) {
    panel.style.left = `${Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth))}px`;
    panel.style.top = `${Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight))}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }
  function clampPosition() {
    if (host === window) {
      const rect = panel.getBoundingClientRect();
      place(rect.left, rect.top);
    }
  }
  const drag = panel.querySelector<HTMLButtonElement>(".mini-drag")!;
  let pointer:
    | { id: number; x: number; y: number; left: number; top: number }
    | undefined;
  drag.onpointerdown = (event) => {
    if (host !== window || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    drag.setPointerCapture(event.pointerId);
  };
  drag.onpointermove = (event) => {
    if (pointer?.id === event.pointerId)
      place(
        pointer.left + event.clientX - pointer.x,
        pointer.top + event.clientY - pointer.y,
      );
  };
  drag.onlostpointercapture = () => {
    pointer = undefined;
  };
  drag.onpointerup = () => {
    pointer = undefined;
  };
  drag.onkeydown = (event) => {
    if (
      host !== window ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    place(
      rect.left +
        (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0),
      rect.top +
        (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0),
    );
  };
  window.addEventListener("resize", clampPosition);
  window.addEventListener("pagehide", restore);
  button.setAttribute("aria-pressed", "false");
  button.onclick = () => void open();
  return {
    restore,
    sync,
    get external() {
      return !!host && host !== window;
    },
  };
}
