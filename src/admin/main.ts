import "./admin.css";
type Entry = {
  id: string;
  name: string;
  variant?: string;
  preview?: string;
  portrait?: string;
  collection: string;
  status: string;
};
const root = document.getElementById("app")!;
document.title = "Admin · Caminho da Folha";
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/admin/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha ao carregar");
  return data;
}
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function login() {
  root.innerHTML =
    '<main class="admin-login"><p class="eyebrow">CAMINHO DA FOLHA</p><h1>Administração</h1><p>Entre para consultar os recursos e diagnósticos do jogo.</p><form><label>Senha de administrador<input name="password" type="password" autocomplete="current-password" required></label><button>Entrar</button><p role="status"></p></form><a href="/">Voltar ao jogo</a></main>';
  root.querySelector("form")!.onsubmit = async (e) => {
    e.preventDefault();
    const button = root.querySelector("button")!;
    button.disabled = true;
    try {
      await api("login", {
        password: (root.querySelector("input") as HTMLInputElement).value,
      });
      await shell();
    } catch (err) {
      root.querySelector('[role="status"]')!.textContent = String(err);
    } finally {
      button.disabled = false;
    }
  };
}
let content: HTMLElement,
  section = "overview",
  generation = 0;
async function shell() {
  root.innerHTML =
    '<div class="admin-shell"><aside class="admin-nav"><p class="eyebrow">CAMINHO DA FOLHA</p><h2>Administração</h2><nav></nav><a href="/">Abrir o jogo ↗</a><button data-logout class="secondary">Sair</button></aside><main class="admin-main"><header><div><p class="eyebrow">ACERVO DO JOGO</p><h1 data-title></h1></div><span class="admin-badge">Acesso administrativo</span></header><section data-content></section></main></div>';
  content = root.querySelector("[data-content]")!;
  for (const [id, name] of [
    ["overview", "Visão geral"],
    ["characters", "Personagens"],
    ["maps", "Mapas"],
    ["effects", "Efeitos"],
    ["sounds", "Sons e músicas"],
    ["progression", "Itens e missões"],
    ["arena", "Salas da arena"],
    ["files", "Todos os arquivos"],
  ]) {
    const button = node("button", name, "secondary");
    button.dataset.section = id;
    button.onclick = () => void show(id, name);
    root.querySelector("nav")!.append(button);
  }
  root.querySelector<HTMLButtonElement>("[data-logout]")!.onclick =
    async () => {
      await api("logout", {});
      login();
    };
  await show("overview", "Visão geral");
}
async function show(id: string, title: string) {
  section = id;
  const request = ++generation;
  root.querySelector("[data-title]")!.textContent = title;
  root
    .querySelectorAll<HTMLButtonElement>("[data-section]")
    .forEach((b) => b.classList.toggle("active", b.dataset.section === id));
  content.replaceChildren(node("p", "Carregando…"));
  try {
    if (id === "overview") {
      const data = await api("overview");
      if (request !== generation) return;
      const grid = node("div", undefined, "admin-stats");
      for (const [key, label] of [
        ["characters", "Modelos catalogados"],
        ["playable", "Modelos com ações padrão"],
        ["previews", "Prévias de corpo inteiro"],
        ["maps", "Mapas integrados"],
        ["effects", "Efeitos preparados"],
        ["sounds", "Arquivos de som"],
        ["files", "Arquivos no jogo"],
      ]) {
        const card = node("article");
        card.append(node("strong", String(data[key])), node("span", label));
        grid.append(card);
      }
      content.replaceChildren(
        grid,
        node(
          "p",
          "A coleção principal reúne os modelos com caminhada e combate preservados. O acervo de revisão mantém NPCs, objetos, invocações e recursos incompletos. Os mapas ainda não integrados e as próximas funcionalidades estão registrados no roadmap.",
          "admin-note",
        ),
      );
    } else if (id === "characters") {
      const data = await api("characters");
      if (request !== generation) return;
      characters(data.entities);
    } else if (id === "maps") {
      const data = await api("maps");
      if (request !== generation) return;
      content.replaceChildren();
      const grid = node("div", undefined, "admin-grid");
      for (const map of data.maps) {
        const card = node("article", undefined, "admin-card"),
          img = node("img");
        img.src = map.thumbnail;
        img.alt = map.name;
        img.className = "admin-map";
        card.append(
          img,
          node("h3", map.name),
          node("p", map.description),
          node(
            "p",
            `ID ${map.id} · ${Math.round(map.width)} × ${Math.round(map.height)} unidades`,
          ),
        );
        const button = node("button", "Inspecionar mapa", "secondary");
        button.onclick = () => void inspectMap(map);
        card.append(button);
        grid.append(card);
      }
      content.append(grid);
    } else if (id === "effects" || id === "sounds") {
      const data = await api("presentation");
      if (request !== generation) return;
      content.replaceChildren();
      const grid = node("div", undefined, "admin-grid");
      if (id === "sounds") {
        for (const [key, sound] of Object.entries<any>(data.sounds)) {
          const card = node("article", undefined, "admin-card");
          card.append(node("h3", sound.name || key));
          for (const url of sound.urls) {
            const audio = node("audio");
            audio.src = url;
            audio.controls = true;
            audio.preload = "none";
            audio.onplay = () =>
              document.querySelectorAll("audio").forEach((other) => {
                if (other !== audio) other.pause();
              });
            card.append(audio);
          }
          grid.append(card);
        }
        const card = node("article", undefined, "admin-card");
        card.append(node("h3", "Música principal"));
        const audio = node("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = data.music.url;
        card.append(audio);
        grid.prepend(card);
      } else
        for (const [key, effect] of Object.entries<any>(data.effects)) {
          const card = node("article", undefined, "admin-card");
          card.append(
            node("h3", key),
            node("p", `${effect.frames} quadros · ${effect.fps} FPS`),
          );
          const button = node("button", "Visualizar efeito", "secondary");
          button.onclick = () =>
            animationDialog(key, {
              effect: {
                animations: { efeito: effect },
                referenceHeight: Math.min(effect.frameHeight, 200),
              },
            });
          card.append(button);
          grid.append(card);
        }
      content.append(grid);
    } else if (id === "progression") {
      const data = await api("progression");
      if (request !== generation) return;
      content.replaceChildren();
      const grid = node("div", undefined, "admin-grid");
      for (const item of data.items) {
        const card = node("article", undefined, "admin-card");
        card.append(
          node("h3", item.name),
          node("p", item.description),
          node(
            "p",
            `${item.price} moedas · ${item.slot} · Ataque +${item.attack} · Vida +${item.hp} · Chakra +${item.chakra}`,
          ),
        );
        grid.append(card);
      }
      for (const quest of data.quests) {
        const card = node("article", undefined, "admin-card");
        card.append(
          node("h3", quest.name),
          node("p", quest.description),
          node(
            "p",
            `${quest.coins} moedas + ${quest.xp} XP · recompensa única`,
          ),
        );
        grid.append(card);
      }
      content.append(grid);
    } else if (id === "arena") {
      const data = await api("arena");
      if (request !== generation) return;
      const refresh = node("button", "Atualizar salas", "secondary");
      refresh.onclick = () => void show("arena", "Salas da arena");
      const grid = node("div", undefined, "admin-grid");
      for (const room of data.rooms) {
        const card = node("article", undefined, "admin-card");
        card.append(
          node("h3", "Sala " + room.code),
          node(
            "p",
            `${room.status} · ${room.mode === "journey" ? "Jornada" : "Nivelado"} · Turno ${room.turnNumber} · ${room.players.length}/2 jogadores`,
          ),
        );
        for (const p of room.players)
          card.append(
            node(
              "p",
              `${p.character} · ${p.hp}/${p.maxHp} vida · ${p.chakra} chakra · ${p.connected ? "conectado" : "ausente"}`,
            ),
          );
        if (room.reason) card.append(node("p", "Encerramento: " + room.reason));
        grid.append(card);
      }
      content.replaceChildren(
        refresh,
        node(
          "p",
          `${data.rooms.length}/${data.capacity} salas locais. Sessões temporárias, sem ranking ou recompensas.`,
        ),
        grid,
      );
    } else if (id === "files") files();
  } catch (e) {
    if (request === generation)
      content.replaceChildren(node("p", String(e), "admin-error"));
  }
}
function characters(entries: Entry[]) {
  const controls = node("div", undefined, "admin-controls"),
    search = node("input"),
    collection = node("select"),
    grid = node("div", undefined, "admin-grid"),
    pages = node("div", undefined, "admin-pages");
  search.placeholder = "Buscar nome, variante ou ID";
  search.setAttribute("aria-label", "Buscar no acervo");
  for (const [value, label] of [
    ["all", "Todo o acervo"],
    ["playable", "Personagens com ações padrão"],
    ["review", "Para revisão"],
  ]) {
    const o = node("option", label);
    o.value = value;
    collection.append(o);
  }
  controls.append(search, collection);
  content.replaceChildren(controls, grid, pages);
  let page = 0;
  const render = () => {
    const q = search.value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const filtered = entries.filter(
      (e) =>
        (collection.value === "all" || e.collection === collection.value) &&
        [e.id, e.name, e.variant || ""]
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(q),
    );
    grid.replaceChildren();
    for (const entry of filtered.slice(page * 24, page * 24 + 24)) {
      const card = node("article", undefined, "admin-card");
      if (entry.preview || entry.portrait) {
        const image = node("img");
        image.src = entry.preview || entry.portrait!;
        image.loading = "lazy";
        image.alt = entry.preview
          ? "Corpo inteiro de " + entry.name
          : "Retrato de " + entry.name;
        image.className = "admin-character";
        card.append(image);
      }
      card.append(
        node(
          "h3",
          entry.name + (entry.variant ? " [" + entry.variant + "]" : ""),
        ),
        node(
          "p",
          `ID ${entry.id} · ${entry.collection === "playable" ? "Coleção principal" : "Em revisão"}`,
        ),
      );
      const button = node("button", "Ver ações e animações", "secondary");
      button.onclick = async () => {
        try {
          const m = await api("characters/" + entry.id);
          animationDialog(entry.name, m.modes || {}, m);
        } catch (e) {
          alert(String(e));
        }
      };
      card.append(button);
      card.style.cursor = "pointer";
      card.onclick = (event) => { if (event.target !== button) button.click(); };
      grid.append(card);
    }
    pages.replaceChildren();
    const prev = node("button", "Anterior", "secondary"),
      next = node("button", "Próxima", "secondary");
    prev.disabled = page === 0;
    next.disabled = (page + 1) * 24 >= filtered.length;
    prev.onclick = () => {
      page--;
      render();
    };
    next.onclick = () => {
      page++;
      render();
    };
    pages.append(
      prev,
      node(
        "span",
        `${filtered.length} modelos · página ${page + 1} / ${Math.max(1, Math.ceil(filtered.length / 24))}`,
      ),
      next,
    );
  };
  search.oninput = collection.onchange = () => {
    page = 0;
    render();
  };
  render();
}
function modal(title: string) {
  const dialog = node("dialog", undefined, "admin-detail");
  const top = node("div", undefined, "admin-detail-heading"),
    close = node("button", "Fechar", "secondary");
  top.append(node("h2", title), close);
  dialog.append(top);
  document.body.append(dialog);
  close.onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  return dialog;
}
function animationDialog(title: string, modes: any, manifest?: any) {
  const dialog = modal(title),
    actionGrid = node("div", undefined, "animation-grid"),
    canvas = node("canvas"),
    info = node("p"),
    zoom = node("input");
  canvas.width = 560;
  canvas.height = 400;
  zoom.type = "range";
  zoom.min = "0.4";
  zoom.max = "2";
  zoom.step = "0.05";
  zoom.value = "1";
  zoom.setAttribute("aria-label", "Zoom da prévia");
  const actions: any[] = [];
  for (const [mode, data] of Object.entries<any>(modes))
    for (const [name, anim] of Object.entries<any>(data.animations || {})) {
      actions.push({ mode, name, anim, reference: data.referenceHeight });
    }
  actionGrid.setAttribute("aria-label", "Animações disponíveis");
  dialog.append(node("p", "Passe o mouse ou use o teclado para ver uma prévia. Clique para ampliar."), actionGrid, zoom, canvas, info);
  if (manifest) {
    const details = node("details"), summary = node("summary", `Arquivos do modelo (${manifest.assets?.length || 0})`), list = node("ul", undefined, "admin-assets");
    for (const asset of manifest.assets || []) {
      const li = node("li"), link = node("a", asset.url.split("/").slice(-2).join("/"));
      link.href = asset.url; link.target = "_blank"; link.rel = "noopener";
      li.append(link, document.createTextNode(` ? ${Math.ceil(asset.bytes / 1024)} KB`)); list.append(li);
    }
    details.append(summary, list); dialog.append(details);
    if (manifest.issues?.length) dialog.append(node("p", "Pendências: " + JSON.stringify(manifest.issues)));
    const form = node("form", undefined, "admin-review"), decision = node("select"), notes = node("textarea"), roles = node("div"), status = node("p"), save = node("button", "Salvar revisão");
    for (const [value, label] of [["pending", "Pendente"], ["approved", "Aprovado para uso"], ["rejected", "Não utilizável"]]) { const option = node("option", label); option.value = value; decision.append(option); }
    decision.value = manifest.review?.decision || "pending";
    notes.placeholder = "Observações da revisão"; notes.maxLength = 1000; notes.value = manifest.review?.notes || "";
    const checks: Record<string, HTMLInputElement> = {};
    for (const [role, label] of [["npc", "Morador"], ["companion", "Companheiro recrutável"], ["enemy", "Adversário"]]) {
      const wrap = node("label"), checkbox = node("input"); checkbox.type = "checkbox"; checkbox.checked = manifest.review?.capabilities?.[role] ?? manifest.capabilities?.[role] ?? false; checks[role] = checkbox;
      wrap.append(checkbox, document.createTextNode(" " + label)); roles.append(wrap);
    }
    form.append(node("h3", "Revisão e uso no jogo"), node("p", "A aprovação libera as funções selecionadas na biblioteca após recarregar o jogo. Não adiciona protagonistas nem reconstrói animações ausentes."), decision, roles, notes, save, status);
    form.onsubmit = async (event) => {
      event.preventDefault(); save.disabled = true; status.textContent = "Salvando...";
      try {
        const enabled = decision.value === "approved";
        await api(`characters/${manifest.id}/review`, { decision: decision.value, notes: notes.value, capabilities: Object.fromEntries(Object.entries(checks).map(([role, checkbox]) => [role, enabled && checkbox.checked])) });
        status.textContent = "Revisão salva. Recarregue o jogo para aplicar.";
      } catch (error) { status.textContent = String(error); } finally { save.disabled = false; }
    };
    dialog.append(form);
  }
  if (!actions.length) {
    info.textContent = "Este recurso não possui animações convertidas.";
    return;
  }
  let selected = 0, hovered = -1, hoverImage: HTMLImageElement | undefined,
    hoverStart = 0, hoverToken = 0,
    frame = 0,
    image: HTMLImageElement | undefined,
    start = 0,
    raf = 0,
    token = 0, lastDraw = 0;
  const buttons: HTMLButtonElement[] = [], thumbnails: HTMLCanvasElement[] = [];
  const visible = new Set<number>(), pending: number[] = [];
  let loading = 0;
  const paintThumb = (index: number, img: HTMLImageElement, time: number, began: number) => {
    const thumb = thumbnails[index], ctx = thumb.getContext("2d")!, entry = actions[index], anim = entry.anim;
    const timeline = anim.timeline?.length ? anim.timeline : Array.from({ length: anim.frames }, (_, i) => i);
    const cols = Math.floor(img.width / anim.frameWidth);
    if (!timeline.length || !cols || !anim.frameHeight) return;
    const frame = timeline[Math.floor((time - began) / 1000 * anim.fps) % timeline.length];
    const scale = Math.min(2, 62 / Math.max(1, entry.reference || anim.frameHeight));
    const w = anim.frameWidth * scale, h = anim.frameHeight * scale;
    ctx.clearRect(0, 0, thumb.width, thumb.height);
    ctx.drawImage(img, frame % cols * anim.frameWidth, Math.floor(frame / cols) * anim.frameHeight,
      anim.frameWidth, anim.frameHeight, thumb.width / 2 - w * (anim.origin?.[0] ?? 0.5),
      thumb.height * 0.875 - h * (anim.origin?.[1] ?? 1), w, h);
  };
  const load = async (index: number) => {
    const img = new Image(); img.src = actions[index].anim.url; await img.decode(); return img;
  };
  const pump = () => {
    while (dialog.open && loading < 1 && pending.length) {
      const index = pending.shift()!;
      if (!visible.has(index)) continue;
      loading++;
      void load(index).then(img => {
        if (dialog.open && visible.has(index) && hovered !== index) paintThumb(index, img, 0, 0);
      }).catch(() => { if (dialog.open) buttons[index].title = "Imagem indisponível"; })
        .finally(() => { loading--; pump(); });
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const index = Number((entry.target as HTMLElement).dataset.index);
      if (entry.isIntersecting) { visible.add(index); pending.push(index); }
      else visible.delete(index);
    }
    pump();
  }, { root: actionGrid, rootMargin: "80px" });
  const preview = async (index: number) => {
    hovered = index; hoverImage = undefined;
    const request = ++hoverToken;
    try {
      const img = await load(index);
      if (request !== hoverToken || !dialog.open) return;
      hoverImage = img; hoverStart = performance.now();
    } catch { /* The static thumbnail remains available. */ }
  };
  const stopPreview = (index: number) => {
    if (hovered !== index) return;
    if (hoverImage) paintThumb(index, hoverImage, 0, 0);
    hovered = -1; hoverImage = undefined; hoverToken++;
  };
  actions.forEach((entry, index) => {
    const button = node("button", undefined, "animation-card"), thumb = node("canvas");
    button.type = "button"; button.dataset.index = String(index); button.setAttribute("aria-pressed", "false");
    thumb.width = 160; thumb.height = 112; thumb.setAttribute("aria-hidden", "true");
    button.append(thumb, node("span", entry.name), node("small", entry.mode));
    if (entry.anim.fallback) button.append(node("small", "Prévia provisória"));
    button.onclick = () => void choose(index);
    button.onpointerenter = () => void preview(index);
    button.onpointerleave = () => stopPreview(index);
    button.onfocus = () => void preview(index);
    button.onblur = () => stopPreview(index);
    buttons.push(button); thumbnails.push(thumb); actionGrid.append(button); observer.observe(button);
  });
  const choose = async (index: number) => {
    selected = index;
    buttons.forEach((button, i) => { button.classList.toggle("selected", i === index); button.setAttribute("aria-pressed", String(i === index)); });
    const request = ++token,
      entry = actions[index];
    image = undefined;
    const im = new Image();
    im.src = entry.anim.url;
    try {
      await im.decode();
      if (request !== token || !dialog.open) return;
      image = im;
      start = performance.now();
      info.textContent = `${entry.mode} · ${entry.name} · ${entry.anim.frames} quadros únicos · ${entry.anim.fps} FPS · ${entry.anim.status}${manifest?.organization ? " · " + manifest.organization.reason : ""}`;
      if (entry.anim.fallback) info.textContent += " · " + entry.anim.fallback.reason;
    } catch {
      if (request === token && dialog.open) info.textContent = "Imagem indisponível.";
    }
  };
  const draw = (time: number) => {
    if (!dialog.open) return;
    if (document.hidden || time - lastDraw < 1000 / 24) {
      raf = requestAnimationFrame(draw);
      return;
    }
    lastDraw = time;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 560, 400);
    if (image) {
      const { anim, reference } = actions[selected],
        timeline =
          anim.timeline || Array.from({ length: anim.frames }, (_, i) => i);
      frame =
        timeline[
          Math.floor(((time - start) / 1000) * anim.fps) % timeline.length
        ];
      const cols = image.width / anim.frameWidth,
        scale =
          Math.min(2, 220 / Math.max(1, reference || anim.frameHeight)) *
          Number(zoom.value),
        w = anim.frameWidth * scale,
        h = anim.frameHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        (frame % cols) * anim.frameWidth,
        Math.floor(frame / cols) * anim.frameHeight,
        anim.frameWidth,
        anim.frameHeight,
        280 - w * (anim.origin?.[0] ?? 0.5),
        350 - h * (anim.origin?.[1] ?? 1),
        w,
        h,
      );
    }
    if (hoverImage && hovered >= 0) paintThumb(hovered, hoverImage, time, hoverStart);
    raf = requestAnimationFrame(draw);
  };
  dialog.addEventListener("close", () => { token++; hoverToken++; observer.disconnect(); visible.clear(); pending.length = 0; cancelAnimationFrame(raf); });
  void choose(0);
  raf = requestAnimationFrame(draw);
}
async function inspectMap(map: any) {
  const dialog = modal(map.name),
    image = node("img");
  image.className = "admin-map-full";
  image.src = map.background;
  image.alt = map.name;
  dialog.append(
    image,
    node("p", `ID ${map.id} · Grade original de colisões · ${map.navigation}`),
  );
  const r = await fetch(map.navigation),
    nav = await r.json();
  dialog.append(
    node(
      "p",
      `${nav.cells.length} células transitáveis · região principal ${nav.sourceRegion} · projeção isométrica ${nav.cellWidth}×${nav.cellHeight}`,
    ),
  );
}
function files() {
  const input = node("input"),
    list = node("div"),
    pages = node("div", undefined, "admin-pages");
  input.placeholder = "Buscar caminho ou extensão";
  input.setAttribute("aria-label", "Buscar arquivo");
  content.replaceChildren(input, list, pages);
  let page = 0,
    request = 0,
    timer: ReturnType<typeof setTimeout>;
  const render = async () => {
    const current = ++request;
    try {
      const result = await api(
        "files?q=" + encodeURIComponent(input.value) + "&page=" + page,
      );
      if (current !== request || section !== "files") return;
      list.replaceChildren();
      for (const file of result.files) {
        const row = node("div", undefined, "admin-file"),
          link = node("a", file.url);
        link.href = file.url;
        link.target = "_blank";
        link.rel = "noopener";
        row.append(link, node("span", `${(file.bytes / 1024).toFixed(1)} KB`));
        list.append(row);
      }
      pages.replaceChildren();
      const prev = node("button", "Anterior", "secondary"),
        next = node("button", "Próxima", "secondary");
      prev.disabled = !page;
      next.disabled = (page + 1) * 60 >= result.total;
      prev.onclick = () => {
        page--;
        void render();
      };
      next.onclick = () => {
        page++;
        void render();
      };
      pages.append(
        prev,
        node("span", `${result.total} arquivos · página ${page + 1}`),
        next,
      );
    } catch (e) {
      list.textContent = String(e);
    }
  };
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      page = 0;
      void render();
    }, 200);
  };
  void render();
}
void api("session").then(shell).catch(login);
