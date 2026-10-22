import { t } from "../i18n/core";
import { animationOrigin } from "../entities/animation-origin";
import { frameRectangle, type PackedAtlas } from "../entities/animation-texture";
import type { AnimationDef, EntityManifest } from "../entities/types";
import { effectFrameForBody } from "./native-clock";
import { nativeEffectBounds } from "./native-bounds";

type Binding = { modelId: string; name: string; skillId: string; action: string; manifestUrl: string; fps: number; startFrames: number[] };
export type NativeEffectEntry = {
  id: string;
  definition: Record<string, string>;
  layers: { plane: string; action: string; animation: AnimationDef }[];
  bindings: Binding[];
};
type Loaded = { animation: AnimationDef; image: HTMLImageElement; atlas?: PackedAtlas };

/** Read-only source review. Separate panels deliberately do not assert resolved attachments. */
export function mountNativeEffectReview(host: HTMLElement, entry: NativeEffectEntry) {
  const controls = document.createElement("div"), select = document.createElement("select"),
    play = document.createElement("button"), slider = document.createElement("input"),
    status = document.createElement("p"), note = document.createElement("p"), canvas = document.createElement("canvas"),
    mirror = document.createElement("input"), mirrorLabel = document.createElement("label");
  canvas.width = 1000; canvas.height = 500; canvas.style.width = "100%";
  select.style.maxWidth = "100%"; controls.style.display = "flex"; controls.style.flexWrap = "wrap";
  slider.style.boxSizing = "border-box"; slider.style.margin = "8px 0"; status.style.overflowWrap = "anywhere";
  canvas.style.background = "#14252d"; canvas.setAttribute("aria-label", t("native.review.canvas"));
  play.type = "button"; play.textContent = t("native.review.pause");
  select.setAttribute("aria-label", t("native.review.binding")); slider.setAttribute("aria-label", t("native.review.frame"));
  select.append(new Option(t("native.review.effectOnly"), ""));
  entry.bindings.forEach((binding, index) => select.append(new Option(`${binding.name} · ${binding.modelId} · ${binding.action} · ${binding.skillId}`, String(index))));
  // Only an explicit playSkillEffect source event permits synchronized playback.
  const first = entry.bindings.findIndex(binding => binding.startFrames.length > 0);
  if (first >= 0) select.value = String(first);
  slider.type = "range"; slider.min = "0"; slider.step = "1"; slider.value = "0"; slider.style.width = "100%";
  note.textContent = t("native.review.warning") + (entry.definition.refPointName ? ` (${entry.definition.refPointName})` : "");
  mirror.type = "checkbox"; mirrorLabel.append(mirror, document.createTextNode(t("native.review.mirror")));
  controls.append(select, play, mirrorLabel); host.append(note, controls, canvas, slider, status);
  const abort = new AbortController(); let disposed = false, token = 0, raf = 0, paused = false, previous = performance.now(), frame = 0;
  let layers: Loaded[] = [], body: Loaded | undefined, fps = 24, count = 1, starts = [0];
  const json = async (url: string) => {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(t("native.review.failed"));
    return response.json();
  };
  async function load(animation: AnimationDef): Promise<Loaded> {
    const image = new Image(); image.src = animation.url;
    await image.decode();
    const atlas = animation.packedAtlasUrl ? await json(animation.packedAtlasUrl) : undefined;
    return { animation, image, atlas };
  }
  const timeline = (a: AnimationDef) => a.timeline || Array.from({ length: a.frames }, (_, i) => i);
  function drawAt(ctx: CanvasRenderingContext2D, loaded: Loaded, time: number, x: number, y: number, scale: number) {
    const sequence = timeline(loaded.animation), unique = sequence[Math.min(sequence.length - 1, Math.floor(time))];
    const rect = frameRectangle(loaded.animation, unique, loaded.image.width, loaded.atlas), origin = animationOrigin(loaded.animation, unique);
    ctx.save(); ctx.translate(x, y); ctx.scale(mirror.checked ? -scale : scale, scale);
    ctx.drawImage(loaded.image, rect.x, rect.y, rect.w, rect.h, -origin[0] * rect.w, -origin[1] * rect.h, rect.w, rect.h);
    ctx.restore();
  }
  function draw() {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#dccd99"; ctx.font = "15px sans-serif";
    ctx.fillText(t("native.review.bodyPanel"), 24, 32); ctx.fillText(t("native.review.effectPanel"), 385, 32);
    ctx.strokeStyle = "#53665d"; ctx.beginPath(); ctx.moveTo(350, 0); ctx.lineTo(350, 500); ctx.stroke();
    if (body) drawAt(ctx, body, frame, 160, 350, 0.9);
    const [left, top, right, bottom] = nativeEffectBounds(layers.map(loaded => loaded.animation));
    const scale = Math.min(1, 570 / Math.max(1, right - left), 400 / Math.max(1, bottom - top));
    const x = 385 + (mirror.checked ? right : -left) * scale, y = 70 - top * scale;
    for (const loaded of layers) {
      const total = timeline(loaded.animation).length;
      // Use full-timeline bounds, never the current pose's dimensions, to keep scale stable.
      for (const start of starts) {
        const effectFrame = effectFrameForBody(frame, fps, start, loaded.animation.fps, total);
        if (effectFrame !== undefined) drawAt(ctx, loaded, effectFrame, x, y, scale);
      }
      ctx.fillStyle = "#e4b965"; ctx.fillRect(x - 3, y - 1, 6, 2); ctx.fillRect(x - 1, y - 3, 2, 6);
    }
    slider.value = String(Math.floor(frame));
    status.textContent = `${t("native.review.frame")} ${Math.floor(frame)} / ${count - 1} · ${fps} FPS · ${entry.definition.res} · ${entry.layers.map(layer => layer.action).join(" / ")}`;
  }
  async function choose() {
    const request = ++token; body = undefined; frame = 0; play.disabled = select.disabled = true;
    try {
      if (!layers.length) for (const layer of entry.layers) layers.push(await load(layer.animation));
      if (disposed || request !== token) return;
      const binding = select.value === "" ? undefined : entry.bindings[Number(select.value)];
      starts = binding?.startFrames.length ? binding.startFrames : [0];
      fps = binding?.startFrames.length ? binding.fps : layers[0].animation.fps;
      if (binding) {
        const manifest: EntityManifest = await json(binding.manifestUrl);
        const animation = manifest.modes.battle?.animations[binding.action];
        if (animation && binding.startFrames.length) body = await load(animation);
      }
      if (disposed || request !== token) return;
      count = Math.max(body ? timeline(body.animation).length : 1, ...layers.flatMap(layer => starts.map(start => Math.ceil(start + timeline(layer.animation).length * fps / layer.animation.fps))));
      slider.max = String(count - 1); previous = performance.now();
      note.textContent = t("native.review.warning") + (binding && !binding.startFrames.length ? " · " + t("native.review.noEvent") : "") + (entry.definition.refPointName ? ` (${entry.definition.refPointName})` : "");
      draw();
    } catch {
      if (!disposed && request === token) { layers = []; body = undefined; status.textContent = t("native.review.failed"); }
    } finally { if (!disposed && request === token) play.disabled = select.disabled = false; }
  }
  play.onclick = () => { paused = !paused; play.textContent = t(paused ? "native.review.play" : "native.review.pause"); };
  select.onchange = () => void choose();
  mirror.onchange = draw;
  slider.oninput = () => { paused = true; frame = Number(slider.value); play.textContent = t("native.review.play"); draw(); };
  const tick = (now: number) => {
    if (disposed) return;
    if (!document.hidden && !paused && !select.disabled && layers.length) { frame = (frame + Math.min(100, now - previous) / 1000 * fps) % count; draw(); }
    previous = now; raf = requestAnimationFrame(tick);
  };
  void choose(); raf = requestAnimationFrame(tick);
  return () => { disposed = true; token++; abort.abort(); cancelAnimationFrame(raf); layers = []; body = undefined; };
}
