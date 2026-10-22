import { frameRectangle, type PackedAtlas } from "../entities/animation-texture";
import { mountNativeEffectReview, type NativeEffectEntry } from "../effects/native-review";
import { animationOrigin } from "../entities/animation-origin";
import {
  t,
  th,
  localizeContent,
  errorText,
  translateText,
  formatNumber,
  statusText,
} from "../i18n/core.ts";
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
document.title = t("admin.main.ca22623e43");
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/admin/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = localizeContent(await r.json());
  if (!r.ok)
    throw new Error(errorText(data.error || t("admin.main.828889030a")));
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
  root.innerHTML = `<main class="admin-login"><p class="eyebrow">${th("admin.main.7984cfa6d0")}</p><h1>${th("admin.main.7d8098b4f7")}</h1><p>${th("admin.main.b235bf06ba")}</p><form><label>${th("admin.main.c7b3d7022a")}<input name="password" type="password" autocomplete="current-password" required></label><button>${th("admin.main.4105811890")}</button><p role="status"></p></form><a href="/">${th("admin.main.48a640ef1d")}</a></main>`;
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
  root.innerHTML = `<div class="admin-shell"><aside class="admin-nav"><p class="eyebrow">${th("admin.main.7984cfa6d0")}</p><h2>${th("admin.main.7d8098b4f7")}</h2><nav></nav><a href="/">Abrir o jogo \u2197</a><button data-logout class="secondary">${th("admin.main.2d023dea2a")}</button></aside><main class="admin-main"><header><div><p class="eyebrow">${th("admin.main.d0c40a35b6")}</p><h1 data-title></h1></div><span class="admin-badge">${th("admin.main.f6c44eaec8")}</span></header><section data-content></section></main></div>`;
  content = root.querySelector("[data-content]")!;
  for (const [id, name] of [
    ["overview", t("admin.main.36664e8242")],
    ["characters", t("admin.main.125523ff6a")],
    ["maps", t("admin.main.7ab84a7603")],
    ["effects", t("admin.main.020cdce113")],
    ["sounds", t("admin.main.0476208c29")],
    ["progression", t("admin.main.3a245f3036")],
    ["arena", t("admin.main.a5f5025f3a")],
    ["files", t("admin.main.0d4623424b")],
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
  await show("overview", t("admin.main.36664e8242"));
}
async function show(id: string, title: string) {
  section = id;
  const request = ++generation;
  root.querySelector("[data-title]")!.textContent = title;
  root
    .querySelectorAll<HTMLButtonElement>("[data-section]")
    .forEach((b) => b.classList.toggle("active", b.dataset.section === id));
  content.querySelectorAll("audio").forEach((audio) => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  });
  content.replaceChildren(node("p", t("common.loading")));
  try {
    if (id === "overview") {
      const data = await api("overview");
      if (request !== generation) return;
      const grid = node("div", undefined, "admin-stats");
      for (const [key, label] of [
        ["characters", t("admin.main.b8e48d64b5")],
        ["playable", t("admin.main.2ddf37c17f")],
        ["previews", t("admin.main.665064ba23")],
        ["maps", t("admin.main.771d20b513")],
        ["effects", t("admin.main.33ee891fa6")],
        ["sounds", t("admin.main.e894147eef")],
        ["files", t("admin.main.577b5bed9a")],
      ]) {
        const card = node("article");
        card.append(node("strong", String(data[key])), node("span", label));
        grid.append(card);
      }
      content.replaceChildren(
        grid,
        node("p", t("admin.main.13f0402845"), "admin-note"),
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
            t("admin.main.007351c4f9", {
              v0: map.id,
              v1: Math.round(map.width),
              v2: Math.round(map.height),
            }),
          ),
        );
        const button = node("button", t("admin.main.94d0c95e58"), "secondary");
        button.onclick = () => void inspectMap(map);
        card.append(button);
        grid.append(card);
      }
      content.append(grid);
    } else if (id === "effects" || id === "sounds") {
      const data = await api("presentation");
      const sceneAudio = id === "sounds" ? await api("scene-audio") : undefined;
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
        for (const [modelId, ref] of Object.entries<any>(
          data.entityAudio || {},
        )) {
          const entry = node("article", undefined, "admin-card");
          entry.dataset.entityAudio = modelId;
          entry.append(
            node("h3", ref.name),
            node("p", t("common.model") + modelId + t("admin.main.153b3ebfee")),
          );
          const button = node(
            "button",
            t("admin.main.4c4c4e16a0"),
            "secondary",
          );
          button.onclick = async () => {
            button.disabled = true;
            try {
              const response = await fetch(ref.url, {
                signal: AbortSignal.timeout(15000),
              });
              if (!response.ok) throw new Error(t("admin.main.acb2115f9a"));
              const model = await response.json();
              if (request !== generation) return;
              for (const [sid, sound] of Object.entries<any>(model.sounds)) {
                entry.append(node("p", t("common.package") + sid));
                for (const clip of sound.clips) {
                  const preview = node("audio");
                  preview.controls = true;
                  preview.preload = "none";
                  preview.src = clip.url;
                  preview.onplay = () =>
                    document.querySelectorAll("audio").forEach((other) => {
                      if (other !== preview) other.pause();
                    });
                  entry.append(preview);
                }
              }
              button.remove();
            } catch {
              button.disabled = false;
              button.textContent = t("admin.main.be839d7fb4");
            }
          };
          entry.append(button);
          grid.append(entry);
        }
        const card = node("article", undefined, "admin-card");
        card.append(node("h3", t("admin.main.9ce5f599cc")));
        const audio = node("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = data.music.url;
        audio.onplay = () =>
          document.querySelectorAll("audio").forEach((other) => {
            if (other !== audio) other.pause();
          });
        card.append(node("p", t("admin.main.6ffe95954a")), audio);
        grid.prepend(card);
        for (const [url, file] of Object.entries<any>(sceneAudio.files)) {
          const entry = node("article", undefined, "admin-card");
          entry.dataset.sceneAudio = url;
          const uses = Object.entries<any>(sceneAudio.maps)
            .filter(
              ([, map]) => map.tracks.includes(url) || map.environment === url,
            )
            .map(([id, map]) => map.name + " (" + id + ")");
          entry.append(
            node("h3", url.split("/").pop()!),
            node("p", uses.join(" · ")),
            node("p", file.source),
          );
          const preview = node("audio");
          preview.controls = true;
          preview.preload = "none";
          preview.src = url;
          preview.onplay = () =>
            document.querySelectorAll("audio").forEach((other) => {
              if (other !== preview) other.pause();
            });
          entry.append(preview);
          grid.prepend(entry);
        }
      } else
        for (const [key, effect] of Object.entries<any>(data.effects)) {
          const card = node("article", undefined, "admin-card");
          card.append(
            node("h3", key),
            node(
              "p",
              t("admin.main.a1aba54bcd", { v0: effect.frames, v1: effect.fps }),
            ),
          );
          const button = node(
            "button",
            t("admin.main.a82031d4ce"),
            "secondary",
          );
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
      if (id === "effects") {
        const response = await fetch("/assets/effects/native/index.json");
        if (request !== generation) return;
        if (response.ok) {
          const native = await response.json();
          if (request !== generation) return;
          for (const entry of Object.values(native.effects) as NativeEffectEntry[]) {
            const card = node("article", undefined, "admin-card");
            card.dataset.nativeEffect = entry.id;
            card.append(node("h3", t("native.review.title") + " · " + entry.id),
              node("p", entry.definition.res), node("p", t("native.review.warning")));
            const button = node("button", t("native.review.open"), "secondary");
            button.onclick = () => {
              const dialog = modal(t("native.review.title") + " · " + entry.id);
              const dispose = mountNativeEffectReview(dialog, entry);
              dialog.addEventListener("close", dispose, { once: true });
            };
            card.append(button); grid.prepend(card);
          }
        }
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
            t("balance.equipmentTier", {
              tier: item.tier,
              level: item.level,
              path: t(`balance.path.${item.path}` as "balance.path.damage"),
            }),
          ),
          node(
            "p",
            t("admin.main.716ad8ef8f", {
              v0: item.price,
              v1: statusText(item.slot),
              v2: item.attack,
              v3: item.hp,
              v4: item.chakra,
            }),
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
            t("admin.main.f4371821aa", { v0: quest.coins, v1: quest.xp }),
          ),
        );
        grid.append(card);
      }
      content.append(grid);
    } else if (id === "arena") {
      const data = await api("arena");
      if (request !== generation) return;
      const refresh = node("button", t("admin.main.2c892d733b"), "secondary");
      refresh.onclick = () => void show("arena", t("admin.main.a5f5025f3a"));
      const grid = node("div", undefined, "admin-grid");
      for (const room of data.rooms) {
        const card = node("article", undefined, "admin-card");
        card.append(
          node("h3", t("common.room") + room.code),
          node(
            "p",
            t("admin.main.dad3543391", {
              v0: statusText(room.status),
              v1:
                room.mode === "journey"
                  ? t("admin.main.20c99ea996")
                  : t("admin.main.58aa7af176"),
              v2: room.turnNumber,
              v3: room.players.length,
            }),
          ),
        );
        for (const p of room.players)
          card.append(
            node(
              "p",
              t("admin.main.e0977f1300", {
                v0: p.character,
                v1: p.hp,
                v2: p.maxHp,
                v3: p.chakra,
                v4: p.connected ? "conectado" : "ausente",
              }),
            ),
          );
        if (room.reason)
          card.append(node("p", t("common.ending") + room.reason));
        grid.append(card);
      }
      content.replaceChildren(
        refresh,
        node(
          "p",
          t("admin.main.bab7410da8", {
            v0: data.rooms.length,
            v1: data.capacity,
          }),
        ),
        grid,
      );
    } else if (id === "files") files();
  } catch (e) {
    if (request === generation)
      content.replaceChildren(node("p", errorText(e), "admin-error"));
  }
}
function characters(entries: Entry[]) {
  const controls = node("div", undefined, "admin-controls"),
    search = node("input"),
    collection = node("select"),
    grid = node("div", undefined, "admin-grid"),
    pages = node("div", undefined, "admin-pages");
  search.placeholder = t("admin.main.10e02090d3");
  search.setAttribute("aria-label", t("admin.main.58e3fc6ab2"));
  for (const [value, label] of [
    ["all", t("common.allArchive")],
    ["playable", t("admin.main.710053a202")],
    ["review", t("admin.main.73d5490306")],
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
          ? t("admin.main.40e5dc98cf") + entry.name
          : t("admin.main.784b535812") + entry.name;
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
          t("admin.main.35a06c5c0c", {
            v0: entry.id,
            v1:
              entry.collection === "playable"
                ? t("admin.main.21cc76e3ac")
                : t("admin.main.5f80549834"),
          }),
        ),
      );
      const button = node("button", t("admin.main.e5b3ce7ac0"), "secondary");
      button.onclick = async () => {
        try {
          const m = await api("characters/" + entry.id);
          animationDialog(entry.name, m.modes || {}, m);
        } catch (e) {
          alert(errorText(e));
        }
      };
      card.append(button);
      card.style.cursor = "pointer";
      card.onclick = (event) => {
        if (event.target !== button) button.click();
      };
      grid.append(card);
    }
    pages.replaceChildren();
    const prev = node("button", t("admin.main.e4ce7c09d5"), "secondary"),
      next = node("button", t("admin.main.2fe966afd7"), "secondary");
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
        t("admin.main.d906beb0eb", {
          v0: filtered.length,
          v1: page + 1,
          v2: Math.max(1, Math.ceil(filtered.length / 24)),
        }),
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
    close = node("button", t("admin.main.0f2bd88ef0"), "secondary");
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
  zoom.setAttribute("aria-label", t("admin.main.6dfeceaf97"));
  const actions: any[] = [];
  for (const [mode, data] of Object.entries<any>(modes))
    for (const [name, anim] of Object.entries<any>(data.animations || {})) {
      actions.push({ mode, name, anim, reference: data.referenceHeight });
    }
  actionGrid.setAttribute("aria-label", t("admin.main.cdf24c02e5"));
  dialog.append(
    node("p", t("admin.main.c7b3df9c67")),
    actionGrid,
    zoom,
    canvas,
    info,
  );
  if (manifest) {
    const details = node("details"),
      summary = node(
        "summary",
        t("admin.main.2f771c4f1e", { v0: manifest.assets?.length || 0 }),
      ),
      list = node("ul", undefined, "admin-assets");
    for (const asset of manifest.assets || []) {
      const li = node("li"),
        link = node("a", asset.url.split("/").slice(-2).join("/"));
      link.href = asset.url;
      link.target = "_blank";
      link.rel = "noopener";
      li.append(
        link,
        document.createTextNode(
          t("admin.main.21d35bf930", { v0: Math.ceil(asset.bytes / 1024) }),
        ),
      );
      list.append(li);
    }
    details.append(summary, list);
    dialog.append(details);
    if (manifest.issues?.length)
      dialog.append(
        node("p", t("admin.main.bceeb00a5e") + JSON.stringify(manifest.issues)),
      );
    const form = node("form", undefined, "admin-review"),
      decision = node("select"),
      notes = node("textarea"),
      roles = node("div"),
      status = node("p"),
      save = node("button", t("admin.main.151029cd95"));
    for (const [value, label] of [
      ["pending", t("admin.main.0b52c68ee6")],
      ["approved", t("admin.main.09242e57b4")],
      ["rejected", t("admin.main.c9ea857e45")],
    ]) {
      const option = node("option", label);
      option.value = value;
      decision.append(option);
    }
    decision.value = manifest.review?.decision || "pending";
    notes.placeholder = t("admin.main.b820bf07a9");
    notes.maxLength = 1000;
    notes.value = manifest.review?.notes || "";
    const checks: Record<string, HTMLInputElement> = {};
    for (const [role, label] of [
      ["npc", t("common.resident")],
      ["companion", t("admin.main.551338a627")],
      ["enemy", t("admin.main.77ba10b67c")],
    ]) {
      const wrap = node("label"),
        checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.checked =
        manifest.review?.capabilities?.[role] ??
        manifest.capabilities?.[role] ??
        false;
      checks[role] = checkbox;
      wrap.append(checkbox, document.createTextNode(" " + label));
      roles.append(wrap);
    }
    form.append(
      node("h3", t("admin.main.1112fd3993")),
      node("p", t("admin.main.8a6c014009")),
      decision,
      roles,
      notes,
      save,
      status,
    );
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      status.textContent = t("common.saving");
      try {
        const enabled = decision.value === "approved";
        await api(`characters/${manifest.id}/review`, {
          decision: decision.value,
          notes: notes.value,
          capabilities: Object.fromEntries(
            Object.entries(checks).map(([role, checkbox]) => [
              role,
              enabled && checkbox.checked,
            ]),
          ),
        });
        status.textContent = t("admin.main.dc66834ae1");
      } catch (error) {
        status.textContent = errorText(error);
      } finally {
        save.disabled = false;
      }
    };
    dialog.append(form);
  }
  if (!actions.length) {
    info.textContent = t("admin.main.c9ea27d9d7");
    return;
  }
  let selected = 0,
    hovered = -1,
    hoverImage: HTMLImageElement | undefined,
    hoverStart = 0,
    hoverToken = 0,
    frame = 0,
    image: HTMLImageElement | undefined,
    start = 0,
    raf = 0,
    token = 0,
    lastDraw = 0;
  const atlases = new WeakMap<HTMLImageElement, PackedAtlas>();
  const buttons: HTMLButtonElement[] = [],
    thumbnails: HTMLCanvasElement[] = [];
  const visible = new Set<number>(),
    pending: number[] = [];
  let loading = 0;
  const paintThumb = (
    index: number,
    img: HTMLImageElement,
    time: number,
    began: number,
  ) => {
    const thumb = thumbnails[index],
      ctx = thumb.getContext("2d")!,
      entry = actions[index],
      anim = entry.anim;
    const timeline = anim.timeline?.length
      ? anim.timeline
      : Array.from({ length: anim.frames }, (_, i) => i);
    if (!timeline.length || !anim.frameHeight) return;
    const frame =
      timeline[
        Math.floor(((time - began) / 1000) * anim.fps) % timeline.length
      ];
    const scale = Math.min(
      2,
      62 / Math.max(1, entry.reference || anim.frameHeight),
    );
    const rect = frameRectangle(anim, frame, img.width, atlases.get(img));
    const w = rect.w * scale, h = rect.h * scale;
    ctx.clearRect(0, 0, thumb.width, thumb.height);
    ctx.drawImage(
      img,
      rect.x, rect.y, rect.w, rect.h,
      thumb.width / 2 - w * animationOrigin(anim, frame)[0],
      thumb.height * 0.875 - h * animationOrigin(anim, frame)[1],
      w,
      h,
    );
  };
  const load = async (index: number) => {
    const img = new Image();
    img.src = actions[index].anim.url;
    await img.decode();
    if (actions[index].anim.packedAtlasUrl) {
      const response = await fetch(actions[index].anim.packedAtlasUrl);
      if (!response.ok) throw new Error(t("native.review.failed"));
      atlases.set(img, await response.json());
    }
    return img;
  };
  const pump = () => {
    while (dialog.open && loading < 1 && pending.length) {
      const index = pending.shift()!;
      if (!visible.has(index)) continue;
      loading++;
      void load(index)
        .then((img) => {
          if (dialog.open && visible.has(index) && hovered !== index)
            paintThumb(index, img, 0, 0);
        })
        .catch(() => {
          if (dialog.open) buttons[index].title = t("admin.main.209eda3bf6");
        })
        .finally(() => {
          loading--;
          pump();
        });
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.index);
        if (entry.isIntersecting) {
          visible.add(index);
          pending.push(index);
        } else visible.delete(index);
      }
      pump();
    },
    { root: actionGrid, rootMargin: "80px" },
  );
  const preview = async (index: number) => {
    hovered = index;
    hoverImage = undefined;
    const request = ++hoverToken;
    try {
      const img = await load(index);
      if (request !== hoverToken || !dialog.open) return;
      hoverImage = img;
      hoverStart = performance.now();
    } catch {
      /* The static thumbnail remains available. */
    }
  };
  const stopPreview = (index: number) => {
    if (hovered !== index) return;
    if (hoverImage) paintThumb(index, hoverImage, 0, 0);
    hovered = -1;
    hoverImage = undefined;
    hoverToken++;
  };
  actions.forEach((entry, index) => {
    const button = node("button", undefined, "animation-card"),
      thumb = node("canvas");
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-pressed", "false");
    thumb.width = 160;
    thumb.height = 112;
    thumb.setAttribute("aria-hidden", "true");
    button.append(
      thumb,
      node("span", entry.name),
      node("small", statusText(entry.mode)),
    );
    if (entry.anim.fallback)
      button.append(node("small", t("admin.main.248b16bc68")));
    button.onclick = () => void choose(index);
    button.onpointerenter = () => void preview(index);
    button.onpointerleave = () => stopPreview(index);
    button.onfocus = () => void preview(index);
    button.onblur = () => stopPreview(index);
    buttons.push(button);
    thumbnails.push(thumb);
    actionGrid.append(button);
    observer.observe(button);
  });
  const choose = async (index: number) => {
    selected = index;
    buttons.forEach((button, i) => {
      button.classList.toggle("selected", i === index);
      button.setAttribute("aria-pressed", String(i === index));
    });
    const request = ++token,
      entry = actions[index];
    image = undefined;
    try {
      const im = await load(index);
      if (request !== token || !dialog.open) return;
      image = im;
      start = performance.now();
      info.textContent = t("admin.main.e4026fd796", {
        v0: statusText(entry.mode),
        v1: entry.name,
        v2: entry.anim.frames,
        v3: entry.anim.fps,
        v4: statusText(entry.anim.status),
        v5: manifest?.organization
          ? " · " + translateText(manifest.organization.reason)
          : "",
      });
      if (entry.anim.fallback)
        info.textContent += " · " + entry.anim.fallback.reason;
    } catch {
      if (request === token && dialog.open)
        info.textContent = t("admin.main.b37bde4762");
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
      const scale =
          Math.min(2, 220 / Math.max(1, reference || anim.frameHeight)) *
          Number(zoom.value),
        rect = frameRectangle(anim, frame, image.width, atlases.get(image)),
        w = rect.w * scale,
        h = rect.h * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        rect.x, rect.y, rect.w, rect.h,
        280 - w * animationOrigin(anim, frame)[0],
        350 - h * animationOrigin(anim, frame)[1],
        w,
        h,
      );
    }
    if (hoverImage && hovered >= 0)
      paintThumb(hovered, hoverImage, time, hoverStart);
    raf = requestAnimationFrame(draw);
  };
  dialog.addEventListener("close", () => {
    token++;
    hoverToken++;
    observer.disconnect();
    visible.clear();
    pending.length = 0;
    cancelAnimationFrame(raf);
  });
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
    node("p", t("admin.main.a40490fece", { v0: map.id, v1: map.navigation })),
  );
  if (map.layers?.nativeForeground) {
    const layer = map.layers.nativeForeground;
    dialog.append(
      node(
        "p",
        t("admin.main.472965c682", {
          v0: layer.foregroundRects,
          v1: layer.alphaLevels.join(" / "),
        }),
      ),
    );
  }
  const r = await fetch(map.navigation),
    nav = await r.json();
  dialog.append(
    node(
      "p",
      t("admin.main.c7c939764a", {
        v0: nav.cells.length,
        v1: nav.sourceRegion,
        v2: nav.cellWidth,
        v3: nav.cellHeight,
      }),
    ),
  );
}
function files() {
  const input = node("input"),
    list = node("div"),
    pages = node("div", undefined, "admin-pages");
  input.placeholder = t("admin.main.a2a616e778");
  input.setAttribute("aria-label", t("admin.main.e8447477bd"));
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
        row.append(
          link,
          node(
            "span",
            t("admin.main.86b3da5385", {
              v0: formatNumber(file.bytes / 1024, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
            }),
          ),
        );
        list.append(row);
      }
      pages.replaceChildren();
      const prev = node("button", t("admin.main.e4ce7c09d5"), "secondary"),
        next = node("button", t("admin.main.2fe966afd7"), "secondary");
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
        node(
          "span",
          t("admin.main.26a98310eb", { v0: result.total, v1: page + 1 }),
        ),
        next,
      );
    } catch (e) {
      list.textContent = errorText(e);
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
